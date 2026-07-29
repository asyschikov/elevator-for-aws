variable "env_name" {
  description = "Prod environment name. Also the SSM namespace and pipeline-naming key."
  type        = string
}

variable "aws_region" {
  description = "AWS region for the pipeline and deployments."
  type        = string
}

variable "repo_owner" {
  description = "GitHub repository owner/org."
  type        = string
}

variable "repo_name" {
  description = "GitHub repository name."
  type        = string
}

variable "branch" {
  description = "Branch to deploy from."
  type        = string
  default     = "main"
}

variable "nonprod_env" {
  description = "Optional non-prod environment. When set, a non-prod deploy stage runs before the prod approval. Empty disables it entirely."
  type        = string
  default     = ""
}

variable "state_bucket" {
  description = "S3 bucket holding Terraform state (created by terraform/bootstrap). The pipeline uses it for both app and pipeline state."
  type        = string
}

variable "terraform_version" {
  description = "Terraform version the CodeBuild deploy jobs install and use."
  type        = string
  default     = "1.14.5"
}
