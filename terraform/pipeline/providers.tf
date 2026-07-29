provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Application = "Elevator"
      Environment = var.env_name
      Component   = "Pipeline"
      ManagedBy   = "Terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

# GitHub connection created and approved once by bootstrap.sh, stored in SSM.
data "aws_ssm_parameter" "connection_arn" {
  name = "/elevator/${var.env_name}/pipeline/connectionArn"
}

locals {
  account_id     = data.aws_caller_identity.current.account_id
  connection_arn = data.aws_ssm_parameter.connection_arn.value

  # Target environments, in deploy order. Non-prod (optional) deploys before the
  # prod approval; prod always requires a manual approval.
  has_nonprod = var.nonprod_env != ""
}
