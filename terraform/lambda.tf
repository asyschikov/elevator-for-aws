# =============================================================================
# Lambda packaging
# =============================================================================
# The deployment zips are produced by ./scripts/build-lambdas.sh (installs deps
# with uv into build/<name>/), which must be run before `terraform apply`.
# archive_file then zips the prepared directories and tracks their hash.

data "archive_file" "backend" {
  type        = "zip"
  source_dir  = "${path.module}/build/backend"
  output_path = "${path.module}/build/backend.zip"
}

data "archive_file" "pretoken" {
  type        = "zip"
  source_dir  = "${path.module}/build/pretoken"
  output_path = "${path.module}/build/pretoken.zip"
}

# =============================================================================
# Environment variables
# =============================================================================
locals {
  common_lambda_env = {
    ELEVATOR_ADMIN_GROUP   = var.elevator_admin_group
    ELEVATOR_AUDITOR_GROUP = var.elevator_auditor_group
    REQUESTS_TABLE         = aws_dynamodb_table.requests.name
    APPROVERS_TABLE        = aws_dynamodb_table.approvers.name
    SETTINGS_TABLE         = aws_dynamodb_table.settings.name
    ELIGIBILITY_TABLE      = aws_dynamodb_table.eligibility.name
    POLICY_TABLE_NAME      = aws_dynamodb_table.eligibility.name # eligibility table doubles as policy table
    INTEGRATIONS_TABLE     = aws_dynamodb_table.integrations.name
    SNS_TOPIC_ARN          = aws_sns_topic.notifications.arn
    ELEVATOR_LOGIN_URL     = local.primary_login_url
    IDC_REGION             = local.idc_region
    EVENT_DATA_STORE_ARN   = aws_cloudtrail_event_data_store.main.arn
    ACCOUNT_ID             = local.account_id
    REVOKE_RULE_NAME       = "elevator-revoke-rule-${var.env_name}"
  }
}

# =============================================================================
# IAM: shared permissions for the backend + revocation functions
# =============================================================================
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "common" {
  statement {
    sid = "DynamoDB"
    actions = [
      "dynamodb:GetItem", "dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:Scan",
      "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem",
      "dynamodb:BatchWriteItem", "dynamodb:ConditionCheckItem", "dynamodb:DescribeTable",
    ]
    resources = concat(local.table_arns, local.table_index_arns)
  }
  statement {
    sid       = "SNS"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.notifications.arn]
  }
  statement {
    sid       = "SES"
    actions   = ["ses:SendEmail"]
    resources = ["*"]
  }
  statement {
    sid = "SSO"
    actions = [
      "sso:CreateAccountAssignment", "sso:DeleteAccountAssignment",
      "sso:DescribeAccountAssignmentCreationStatus", "sso:DescribeAccountAssignmentDeletionStatus",
      "sso:ListPermissionSets", "sso:ListPermissionSetsProvisionedToAccount",
      "sso:DescribePermissionSet", "sso:ListInstances",
    ]
    resources = ["*"]
  }
  statement {
    sid = "IdentityStore"
    actions = [
      "identitystore:ListUsers", "identitystore:ListGroups",
      "identitystore:ListGroupMemberships", "identitystore:ListGroupMembershipsForMember",
      "identitystore:GetUserId", "identitystore:GetGroupId", "identitystore:DescribeUser",
    ]
    resources = ["*"]
  }
  statement {
    sid = "Organizations"
    actions = [
      "organizations:ListAccounts", "organizations:DescribeOrganization",
      "organizations:ListOrganizationalUnitsForParent", "organizations:ListRoots",
      "organizations:ListAccountsForParent", "organizations:ListParents",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "CloudTrail"
    actions   = ["cloudtrail:LookupEvents", "cloudtrail:StartQuery", "cloudtrail:GetQueryResults"]
    resources = [aws_cloudtrail_event_data_store.main.arn]
  }
}

resource "aws_iam_policy" "common" {
  name   = "elevator-lambda-common-${var.env_name}"
  policy = data.aws_iam_policy_document.common.json
}

# =============================================================================
# Revocation function (created first — backend references its ARN)
# =============================================================================
resource "aws_iam_role" "revocation" {
  name               = "elevator-revocation-${var.env_name}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "revocation_basic" {
  role       = aws_iam_role.revocation.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "revocation_common" {
  role       = aws_iam_role.revocation.name
  policy_arn = aws_iam_policy.common.arn
}

resource "aws_iam_role_policy" "revocation_scheduler" {
  name = "scheduler"
  role = aws_iam_role.revocation.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["scheduler:DeleteSchedule", "scheduler:GetSchedule"]
      Resource = "*"
    }]
  })
}

resource "aws_lambda_function" "revocation" {
  function_name    = "elevator-revocation-${var.env_name}"
  role             = aws_iam_role.revocation.arn
  handler          = "index.revocation_handler"
  runtime          = var.lambda_runtime
  architectures    = [var.lambda_architecture]
  timeout          = 60
  memory_size      = 512
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256

  environment {
    variables = merge(local.common_lambda_env, {
      AUTH_ELEVATOR_USERPOOLID = aws_cognito_user_pool.main.id
    })
  }
}

# =============================================================================
# Backend function (API Gateway proxy target)
# =============================================================================
resource "aws_iam_role" "backend" {
  name               = "elevator-backend-${var.env_name}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "backend_basic" {
  role       = aws_iam_role.backend.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "backend_common" {
  role       = aws_iam_role.backend.name
  policy_arn = aws_iam_policy.common.arn
}

resource "aws_iam_role_policy" "backend_extra" {
  name = "backend-extra"
  role = aws_iam_role.backend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "CognitoListUsers"
        Effect   = "Allow"
        Action   = ["cognito-idp:ListUsers"]
        Resource = aws_cognito_user_pool.main.arn
      },
      {
        Sid      = "Scheduler"
        Effect   = "Allow"
        Action   = ["scheduler:CreateSchedule", "scheduler:DeleteSchedule", "scheduler:GetSchedule"]
        Resource = "*"
      },
      {
        Sid      = "PassSchedulerRole"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = aws_iam_role.scheduler.arn
        Condition = {
          StringEquals = { "iam:PassedToService" = "scheduler.amazonaws.com" }
        }
      },
    ]
  })
}

resource "aws_lambda_function" "backend" {
  function_name    = "elevator-backend-${var.env_name}"
  role             = aws_iam_role.backend.arn
  handler          = "index.backend_handler"
  runtime          = var.lambda_runtime
  architectures    = [var.lambda_architecture]
  timeout          = 60
  memory_size      = 512
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256

  environment {
    variables = merge(local.common_lambda_env, {
      AUTH_ELEVATOR_USERPOOLID = aws_cognito_user_pool.main.id
      REVOCATION_FUNCTION_ARN  = aws_lambda_function.revocation.arn
      SCHEDULER_ROLE_ARN       = aws_iam_role.scheduler.arn
    })
  }
}

# =============================================================================
# Pre-token generation function (Cognito trigger)
# =============================================================================
resource "aws_iam_role" "pretoken" {
  name               = "elevator-pretoken-${var.env_name}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "pretoken_basic" {
  role       = aws_iam_role.pretoken.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "pretoken" {
  name = "pretoken"
  role = aws_iam_role.pretoken.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SettingsRead"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:BatchGetItem"]
        Resource = [aws_dynamodb_table.settings.arn]
      },
      {
        Sid      = "SSO"
        Effect   = "Allow"
        Action   = ["sso:ListInstances"]
        Resource = "*"
      },
      {
        Sid      = "IdentityStore"
        Effect   = "Allow"
        Action   = ["identitystore:GetUserId", "identitystore:GetGroupId", "identitystore:ListGroupMembershipsForMember"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_lambda_function" "pretoken" {
  function_name    = "elevator-pretoken-${var.env_name}"
  role             = aws_iam_role.pretoken.arn
  handler          = "index.handler"
  runtime          = var.lambda_runtime
  architectures    = [var.lambda_architecture]
  timeout          = 30
  memory_size      = 256
  filename         = data.archive_file.pretoken.output_path
  source_code_hash = data.archive_file.pretoken.output_base64sha256

  environment {
    variables = {
      SETTINGS_TABLE         = aws_dynamodb_table.settings.name
      ELEVATOR_ADMIN_GROUP   = var.elevator_admin_group
      ELEVATOR_AUDITOR_GROUP = var.elevator_auditor_group
      IDC_REGION             = local.idc_region
    }
  }
}

# Allow Cognito to invoke the pre-token function.
resource "aws_lambda_permission" "cognito_pretoken" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pretoken.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
