# One-time bootstrap of the S3 bucket that holds Terraform state for Elevator.
# Uses LOCAL state (there is no backend block here) — it must run before the main
# configuration, which uses this bucket as its S3 backend.
#
#   cd terraform/bootstrap
#   terraform init
#   terraform apply -var region=us-east-1
#   # then copy the printed bucket name into ../backend.hcl

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  description = "Region for the state bucket."
  type        = string
}

variable "bucket_name" {
  description = "State bucket name. Defaults to elevator-tfstate-<account-id>."
  type        = string
  default     = ""
}

data "aws_caller_identity" "current" {}

locals {
  bucket = var.bucket_name != "" ? var.bucket_name : "elevator-tfstate-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "state" {
  bucket = local.bucket

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "bucket" {
  description = "State bucket name — put this in ../backend.hcl"
  value       = aws_s3_bucket.state.bucket
}
