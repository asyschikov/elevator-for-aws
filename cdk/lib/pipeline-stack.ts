import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as cpactions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface PipelineStackProps extends cdk.StackProps {
  /** Prod environment name. Also the SSM namespace and pipeline-naming key. */
  envName: string;
  /**
   * Optional non-prod environment name. When set, a non-prod deploy stage is
   * inserted before the prod approval. When unset, the stage is not synthesized
   * at all (a clean synth-time toggle, not a disabled action).
   */
  nonProdEnv?: string;
  // Git source (pipeline shape — supplied at pipeline-deploy time)
  repoOwner: string;
  repoName: string;
  branch: string;
}

/**
 * Multi-stage delivery pipeline for Elevator.
 *
 *   Source -> UpdatePipeline (self-mutate) -> [Deploy-NonProd?] -> Approve-Prod -> Deploy-Prod
 *
 * Application configuration is NOT baked into this stack. Each deploy stage reads
 * its environment's config from SSM (`/elevator/<env>/config/*`) at run time, so
 * operators change a value once in AWS and the next run uses it — no pipeline
 * redeploy. The GitHub connection is created out-of-band by `bootstrap.sh` and its
 * ARN is read here from SSM (`/elevator/<envName>/pipeline/connectionArn`).
 */
export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { envName, nonProdEnv, repoOwner, repoName, branch } = props;

    // GitHub connection ARN — created and approved once by bootstrap.sh, stored in SSM.
    const connectionArn = ssm.StringParameter.valueForStringParameter(
      this,
      `/elevator/${envName}/pipeline/connectionArn`,
    );

    // ---- IAM: least-privilege statements shared by every deploy/self-mutate build ----
    const deployPolicy = (): iam.PolicyStatement[] => [
      // Deploys run through the CDK bootstrap roles (which hold the privileged
      // sso:* / organizations:* the SAML custom resource needs). CodeBuild only
      // needs to assume them.
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
      // The CDK CLI reads stack state, and the frontend step reads stack outputs.
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: ['*'],
      }),
      // Run-time application config.
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/elevator/*`],
      }),
      // Frontend upload to the website bucket.
      new iam.PolicyStatement({
        actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [
          `arn:aws:s3:::elevator-website-*`,
          `arn:aws:s3:::elevator-website-*/*`,
        ],
      }),
      // CloudFront invalidation after upload.
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        resources: ['*'],
      }),
    ];

    // ---- Buildspec: deploy Elevator to one environment ----
    const deployBuildSpec = (targetEnv: string) =>
      codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': { nodejs: '20', python: '3.12' },
            commands: [
              'npm ci',
              'cd cdk && npm ci && cd ..',
              'python3 -m pip install --quiet boto3',
            ],
          },
          build: {
            // Single shell invocation so exported env vars propagate to cdk/build.
            commands: [
              [
                'set -eu',
                'export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)',
                'export CDK_DEFAULT_REGION=$AWS_REGION',
                `export ELEVATOR_ENV=${targetEnv}`,
                `export ELEVATOR_STACK=ElevatorStack-${targetEnv}`,
                // Load application config from SSM at run time (not baked into the stack).
                `for name in $(aws ssm get-parameters-by-path --path /elevator/${targetEnv}/config ` +
                  `--recursive --query 'Parameters[].Name' --output text); do ` +
                  `val=$(aws ssm get-parameter --name "$name" --query 'Parameter.Value' --output text); ` +
                  `export "$(basename "$name")=$val"; done`,
                // Infrastructure (includes the IdC SAML app via custom resource).
                `cd cdk && npx cdk deploy ElevatorStack-${targetEnv} --method=direct --require-approval never && cd ..`,
                // Frontend: config from stack outputs, build, upload, invalidate.
                'cd deployment && python3 generate-config.py && cd ..',
                'npm run build',
                `WEBSITE_BUCKET=$(aws cloudformation describe-stacks --stack-name ElevatorStack-${targetEnv} ` +
                  `--query "Stacks[0].Outputs[?OutputKey=='WebsiteBucketName'].OutputValue" --output text)`,
                `DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name ElevatorStack-${targetEnv} ` +
                  `--query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)`,
                'aws s3 sync build "s3://$WEBSITE_BUCKET" --delete',
                'aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*"',
              ].join('\n'),
            ],
          },
        },
      });

    const makeDeployProject = (targetEnv: string): codebuild.PipelineProject => {
      const project = new codebuild.PipelineProject(this, `Deploy-${targetEnv}`, {
        projectName: `elevator-deploy-${targetEnv}`,
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: codebuild.ComputeType.MEDIUM,
          privileged: true, // Docker, for PythonFunction asset bundling during cdk deploy
        },
        buildSpec: deployBuildSpec(targetEnv),
      });
      deployPolicy().forEach((s) => project.addToRolePolicy(s));
      return project;
    };

    // ---- Self-mutation: redeploy the pipeline stack from the checked-out source ----
    const updateProject = new codebuild.PipelineProject(this, 'UpdatePipeline', {
      projectName: `elevator-update-pipeline-${envName}`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      // Pipeline shape lives in env vars (not app config) so `cdk deploy` of the
      // pipeline synthesizes an identical pipeline.
      environmentVariables: {
        ELEVATOR_ENV: { value: envName },
        ELEVATOR_REPO_OWNER: { value: repoOwner },
        ELEVATOR_REPO_NAME: { value: repoName },
        ELEVATOR_BRANCH: { value: branch },
        ...(nonProdEnv ? { ELEVATOR_NONPROD_ENV: { value: nonProdEnv } } : {}),
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': { nodejs: '20' },
            commands: ['cd cdk && npm ci && cd ..'],
          },
          build: {
            commands: [
              [
                'set -eu',
                'export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)',
                'export CDK_DEFAULT_REGION=$AWS_REGION',
                `cd cdk && npx cdk deploy ElevatorPipeline-${envName} --require-approval never`,
              ].join('\n'),
            ],
          },
        },
      }),
    });
    deployPolicy().forEach((s) => updateProject.addToRolePolicy(s));

    // ---- Pipeline ----
    const sourceOutput = new codepipeline.Artifact('SourceOutput');

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `elevator-${envName}`,
      pipelineType: codepipeline.PipelineType.V2,
      restartExecutionOnUpdate: true,
    });

    // Source — auto-triggers on push to the configured branch.
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new cpactions.CodeStarConnectionsSourceAction({
          actionName: 'GitHub',
          owner: repoOwner,
          repo: repoName,
          branch,
          connectionArn,
          output: sourceOutput,
          triggerOnPush: true,
        }),
      ],
    });

    // Self-mutation — applies pipeline changes before anything is deployed.
    pipeline.addStage({
      stageName: 'UpdatePipeline',
      actions: [
        new cpactions.CodeBuildAction({
          actionName: 'SelfMutate',
          project: updateProject,
          input: sourceOutput,
        }),
      ],
    });

    // Optional non-prod stage — only present when a non-prod env is configured.
    if (nonProdEnv) {
      pipeline.addStage({
        stageName: 'Deploy-NonProd',
        actions: [
          new cpactions.CodeBuildAction({
            actionName: `Deploy-${nonProdEnv}`,
            project: makeDeployProject(nonProdEnv),
            input: sourceOutput,
          }),
        ],
      });
    }

    // Prod — always gated by a manual approval.
    pipeline.addStage({
      stageName: 'Approve-Prod',
      actions: [
        new cpactions.ManualApprovalAction({
          actionName: 'ApproveProdDeploy',
          additionalInformation: `Approve deployment of Elevator to the '${envName}' (prod) environment.`,
        }),
      ],
    });

    pipeline.addStage({
      stageName: 'Deploy-Prod',
      actions: [
        new cpactions.CodeBuildAction({
          actionName: `Deploy-${envName}`,
          project: makeDeployProject(envName),
          input: sourceOutput,
        }),
      ],
    });

    // ---- Outputs ----
    new cdk.CfnOutput(this, 'PipelineName', {
      value: pipeline.pipelineName,
      description: 'CodePipeline name',
    });
    new cdk.CfnOutput(this, 'NonProdStage', {
      value: nonProdEnv ?? '(disabled)',
      description: 'Non-prod environment deployed before the prod approval, if any',
    });
  }
}
