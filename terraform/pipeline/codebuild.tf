locals {
  # Deploy one environment: load config from SSM, build Lambdas, terraform apply
  # the app stack, then build + upload the frontend.
  deploy_buildspec = <<-EOT
    version: 0.2
    phases:
      install:
        commands:
          - |
            set -eu
            curl -fsSL -o /tmp/tf.zip "https://releases.hashicorp.com/terraform/${var.terraform_version}/terraform_${var.terraform_version}_linux_amd64.zip"
            unzip -o -q /tmp/tf.zip -d /usr/local/bin
            terraform version
            pip install --quiet uv
      build:
        commands:
          - |
            set -eu
            # Load application config from SSM into TF_VAR_* (not baked into the pipeline).
            for name in $(aws ssm get-parameters-by-path --path /elevator/$TARGET_ENV/config --recursive --query 'Parameters[].Name' --output text); do
              key=$(basename "$name")
              val=$(aws ssm get-parameter --name "$name" --query 'Parameter.Value' --output text)
              case "$key" in
                ELEVATOR_ADMIN_GROUP)      export TF_VAR_elevator_admin_group="$val" ;;
                ELEVATOR_AUDITOR_GROUP)    export TF_VAR_elevator_auditor_group="$val" ;;
                ELEVATOR_IDC_ACCESS_GROUP) export TF_VAR_elevator_idc_access_group="$val" ;;
                IDC_REGION)                export TF_VAR_idc_region="$val" ;;
                ELEVATOR_CUSTOM_DOMAIN)    export TF_VAR_custom_domain="$val" ;;
                ELEVATOR_ALLOW_LOCALHOST)  export TF_VAR_allow_localhost="$val" ;;
              esac
            done
            export TF_VAR_env_name="$TARGET_ENV"
            export TF_VAR_aws_region="$AWS_REGION"
            cd terraform
            ./scripts/build-lambdas.sh
            terraform init -input=false \
              -backend-config="bucket=$STATE_BUCKET" \
              -backend-config="key=elevator/$TARGET_ENV/terraform.tfstate" \
              -backend-config="region=$AWS_REGION" \
              -backend-config="encrypt=true" \
              -backend-config="use_lockfile=true"
            terraform apply -input=false -auto-approve
            ./scripts/deploy-frontend.sh
  EOT

  # Self-mutation: terraform apply the pipeline configuration itself.
  update_buildspec = <<-EOT
    version: 0.2
    phases:
      install:
        commands:
          - |
            set -eu
            curl -fsSL -o /tmp/tf.zip "https://releases.hashicorp.com/terraform/${var.terraform_version}/terraform_${var.terraform_version}_linux_amd64.zip"
            unzip -o -q /tmp/tf.zip -d /usr/local/bin
            terraform version
      build:
        commands:
          - |
            set -eu
            cd terraform/pipeline
            export TF_VAR_env_name="$PROD_ENV"
            export TF_VAR_aws_region="$AWS_REGION"
            export TF_VAR_repo_owner="$REPO_OWNER"
            export TF_VAR_repo_name="$REPO_NAME"
            export TF_VAR_branch="$BRANCH"
            export TF_VAR_state_bucket="$STATE_BUCKET"
            if [ -n "$NONPROD_ENV" ]; then export TF_VAR_nonprod_env="$NONPROD_ENV"; fi
            terraform init -input=false \
              -backend-config="bucket=$STATE_BUCKET" \
              -backend-config="key=elevator/$PROD_ENV/pipeline.tfstate" \
              -backend-config="region=$AWS_REGION" \
              -backend-config="encrypt=true" \
              -backend-config="use_lockfile=true"
            terraform apply -input=false -auto-approve
  EOT
}

resource "aws_codebuild_project" "deploy" {
  name         = "elevator-tf-deploy-${var.env_name}"
  service_role = aws_iam_role.codebuild.arn

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    type            = "LINUX_CONTAINER"
    compute_type    = "BUILD_GENERAL1_MEDIUM"
    image           = "aws/codebuild/standard:7.0"
    privileged_mode = false

    environment_variable {
      name  = "AWS_REGION"
      value = var.aws_region
    }
    environment_variable {
      name  = "STATE_BUCKET"
      value = var.state_bucket
    }
    environment_variable {
      name  = "TARGET_ENV"
      value = var.env_name # default; overridden per pipeline action
    }
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = local.deploy_buildspec
  }
}

resource "aws_codebuild_project" "update" {
  name         = "elevator-tf-update-pipeline-${var.env_name}"
  service_role = aws_iam_role.codebuild.arn

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    type         = "LINUX_CONTAINER"
    compute_type = "BUILD_GENERAL1_SMALL"
    image        = "aws/codebuild/standard:7.0"

    environment_variable {
      name  = "AWS_REGION"
      value = var.aws_region
    }
    environment_variable {
      name  = "STATE_BUCKET"
      value = var.state_bucket
    }
    environment_variable {
      name  = "PROD_ENV"
      value = var.env_name
    }
    environment_variable {
      name  = "REPO_OWNER"
      value = var.repo_owner
    }
    environment_variable {
      name  = "REPO_NAME"
      value = var.repo_name
    }
    environment_variable {
      name  = "BRANCH"
      value = var.branch
    }
    environment_variable {
      name  = "NONPROD_ENV"
      value = var.nonprod_env
    }
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = local.update_buildspec
  }
}
