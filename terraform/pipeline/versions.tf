terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }

  # Pipeline state is stored in the same S3 bucket as the app state, under a
  # separate key (elevator/<env>/pipeline.tfstate). Configure via backend.hcl.
  backend "s3" {}
}
