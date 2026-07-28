resource "aws_cognito_user_pool" "main" {
  name                     = "elevator-user-pool-${var.env_name}"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = true # selfSignUpEnabled: false
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false
  }

  # Pre-token generation trigger (adds group claims).
  lambda_config {
    pre_token_generation = aws_lambda_function.pretoken.arn
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cognito_user_group" "admin" {
  name         = "Admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Admin users with full access"
  precedence   = 1
}

resource "aws_cognito_user_group" "auditors" {
  name         = "Auditors"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Auditor users with read-only access"
  precedence   = 2
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "elevator-${var.env_name}-${local.account_id}"
  user_pool_id = aws_cognito_user_pool.main.id
}

# SAML identity provider federated to IAM Identity Center. The metadata URL is
# produced by the IdC SAML application (see idc_saml.tf).
resource "aws_cognito_identity_provider" "idc" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "IDC"
  provider_type = "SAML"

  provider_details = {
    MetadataURL = local.idc_metadata_url
  }

  attribute_mapping = {
    email = "Email"
  }
}

resource "aws_cognito_user_pool_client" "main" {
  name         = "elevator-client-${var.env_name}"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  supported_identity_providers = [
    "COGNITO",
    aws_cognito_identity_provider.idc.provider_name,
  ]

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code", "implicit"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]

  callback_urls = local.callback_urls
  logout_urls   = local.callback_urls
}
