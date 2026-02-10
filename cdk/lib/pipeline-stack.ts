import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codestarconnections from 'aws-cdk-lib/aws-codestarconnections';
import { Construct } from 'constructs';

export interface PipelineStackProps extends cdk.StackProps {
  envName: string;
  // Git settings
  repoOwner: string;
  repoName: string;
  branch: string;
  // Elevator config (passed to CodeBuild as env vars)
  elevatorAdminGroup: string;
  elevatorAuditorGroup: string;
  idcAccessGroup: string;
  idcRegion?: string;
  customDomain?: string;
  allowLocalhost?: boolean;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { envName } = props;

    // CodeStar Connection to GitHub (requires manual console approval after first deploy)
    const connection = new codestarconnections.CfnConnection(this, 'GitHubConnection', {
      connectionName: `elevator-github-${envName}`,
      providerType: 'GitHub',
    });

    // Source artifact
    const sourceOutput = new codepipeline.Artifact('SourceOutput');

    // Build environment variables from props
    const buildEnvVars: { [key: string]: codebuild.BuildEnvironmentVariable } = {
      ELEVATOR_ENV: { value: props.envName },
      ELEVATOR_ADMIN_GROUP: { value: props.elevatorAdminGroup },
      ELEVATOR_AUDITOR_GROUP: { value: props.elevatorAuditorGroup },
      ELEVATOR_IDC_ACCESS_GROUP: { value: props.idcAccessGroup },
    };

    if (props.idcRegion) {
      buildEnvVars.IDC_REGION = { value: props.idcRegion };
    }
    if (props.customDomain) {
      buildEnvVars.ELEVATOR_CUSTOM_DOMAIN = { value: props.customDomain };
    }
    if (props.allowLocalhost) {
      buildEnvVars.ELEVATOR_ALLOW_LOCALHOST = { value: 'true' };
    }

    // CodeBuild project for deployment
    const deployProject = new codebuild.PipelineProject(this, 'DeployProject', {
      projectName: `elevator-deploy-${envName}`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      environmentVariables: buildEnvVars,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '20',
              python: '3.12',
            },
            commands: [
              'npm install -g aws-cdk',
              'npm ci',
              'cd cdk && npm ci && cd ..',
              'cd lambda/backend && pip install -r requirements.txt && cd ../..',
            ],
          },
          build: {
            commands: [
              // Deploy CDK stack
              'cd cdk && npx cdk deploy ElevatorStack-$ELEVATOR_ENV --method=direct --require-approval never && cd ..',
              // Generate frontend config and build
              'cd deployment2 && python3 generate-config.py && cd ..',
              'npm run build',
              // Deploy frontend to S3 and invalidate CloudFront
              'WEBSITE_BUCKET=$(aws cloudformation describe-stacks --stack-name ElevatorStack-$ELEVATOR_ENV --query "Stacks[0].Outputs[?OutputKey==\'WebsiteBucketName\'].OutputValue" --output text)',
              'DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name ElevatorStack-$ELEVATOR_ENV --query "Stacks[0].Outputs[?OutputKey==\'DistributionId\'].OutputValue" --output text)',
              'aws s3 sync build s3://$WEBSITE_BUCKET --delete',
              'aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"',
            ],
          },
        },
      }),
    });

    // Grant CodeBuild permissions to deploy
    deployProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        // CloudFormation
        'cloudformation:*',
        // CDK bootstrap resources
        'sts:AssumeRole',
      ],
      resources: ['*'],
    }));

    // Grant permissions to assume CDK roles
    deployProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sts:AssumeRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/cdk-*-${this.account}-${this.region}`,
      ],
    }));

    // Grant S3 and CloudFront permissions for frontend deployment
    deployProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:*',
        'cloudfront:CreateInvalidation',
        'cloudfront:GetInvalidation',
      ],
      resources: ['*'],
    }));

    // Pipeline
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `elevator-${envName}`,
      pipelineType: codepipeline.PipelineType.V2,
      restartExecutionOnUpdate: true,
    });

    // Source stage
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: 'GitHub',
          owner: props.repoOwner,
          repo: props.repoName,
          branch: props.branch,
          connectionArn: connection.attrConnectionArn,
          output: sourceOutput,
          triggerOnPush: false,
        }),
      ],
    });

    // Deploy stage
    pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Deploy',
          project: deployProject,
          input: sourceOutput,
        }),
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, 'PipelineName', {
      value: pipeline.pipelineName,
      description: 'CodePipeline name',
    });

    new cdk.CfnOutput(this, 'ConnectionArn', {
      value: connection.attrConnectionArn,
      description: 'CodeStar connection ARN (approve in console after first deploy)',
    });

    new cdk.CfnOutput(this, 'ConnectionApprovalUrl', {
      value: `https://${this.region}.console.aws.amazon.com/codesuite/settings/connections`,
      description: 'URL to approve the GitHub connection',
    });
  }
}
