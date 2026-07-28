resource "aws_dynamodb_table" "requests" {
  name         = "elevator-requests-${var.env_name}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
  attribute {
    name = "email"
    type = "S"
  }
  attribute {
    name = "status"
    type = "S"
  }
  attribute {
    name = "approverId"
    type = "S"
  }

  global_secondary_index {
    name            = "byEmailAndStatus"
    hash_key        = "email"
    range_key       = "status"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "byApproverAndStatus"
    hash_key        = "approverId"
    range_key       = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true # mirrors the CDK RETAIN policy; remove to allow destroy
  }
}

resource "aws_dynamodb_table" "approvers" {
  name         = "elevator-approvers-${var.env_name}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_dynamodb_table" "settings" {
  name         = "elevator-settings-${var.env_name}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_dynamodb_table" "eligibility" {
  name         = "elevator-eligibility-${var.env_name}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_dynamodb_table" "integrations" {
  name         = "elevator-integrations-${var.env_name}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "name"

  attribute {
    name = "name"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  # All table ARNs plus their index ARNs, for IAM policies.
  table_arns = [
    aws_dynamodb_table.requests.arn,
    aws_dynamodb_table.approvers.arn,
    aws_dynamodb_table.settings.arn,
    aws_dynamodb_table.eligibility.arn,
    aws_dynamodb_table.integrations.arn,
  ]
  table_index_arns = [for arn in local.table_arns : "${arn}/index/*"]
}
