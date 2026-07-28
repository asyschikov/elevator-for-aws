provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Application = "Elevator"
      Environment = var.env_name
      ManagedBy   = "Terraform"
    }
  }
}

# CloudFront requires ACM certificates in us-east-1; this aliased provider is used
# to look up the certificate for a custom domain.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Application = "Elevator"
      Environment = var.env_name
      ManagedBy   = "Terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = var.aws_region
  idc_region = var.idc_region != "" ? var.idc_region : var.aws_region
  has_domain = var.custom_domain != ""
}
