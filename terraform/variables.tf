variable "env_name" {
  description = "Environment name (e.g. prod, staging). Used to name resources."
  type        = string
}

variable "aws_region" {
  description = "AWS region to deploy Elevator into."
  type        = string
}

variable "idc_region" {
  description = "IAM Identity Center home region. Defaults to aws_region when empty."
  type        = string
  default     = ""
}

variable "elevator_admin_group" {
  description = "Elevator admin group name in IAM Identity Center."
  type        = string
}

variable "elevator_auditor_group" {
  description = "Elevator auditor group name in IAM Identity Center."
  type        = string
}

variable "elevator_idc_access_group" {
  description = "IAM Identity Center group granted access to the Elevator app (authN only; authZ is in-app)."
  type        = string
}

variable "custom_domain" {
  description = "Custom domain for Elevator (e.g. elevator.example.com). Empty to use the CloudFront domain. When set, an ISSUED ACM certificate for this domain must already exist in us-east-1 and a Route53 hosted zone for it must exist."
  type        = string
  default     = ""
}

variable "allow_localhost" {
  description = "Allow http://localhost:5173 in Cognito callback/logout URLs (for local development)."
  type        = bool
  default     = false
}

variable "lambda_runtime" {
  description = "Python runtime for the Lambda functions."
  type        = string
  default     = "python3.14"
}

variable "lambda_architecture" {
  description = "Lambda architecture (x86_64 or arm64). Must match what build-lambdas.sh builds wheels for."
  type        = string
  default     = "x86_64"
}
