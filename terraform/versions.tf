terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }

  # State is stored in S3. The bucket/key/region are supplied at init time via
  # `-backend-config=backend.hcl` (see backend.hcl.example). S3-native locking
  # (`use_lockfile = true`) is used — no DynamoDB lock table required.
  backend "s3" {}
}
