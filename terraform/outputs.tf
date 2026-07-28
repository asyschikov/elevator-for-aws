output "user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  value       = aws_cognito_user_pool_client.main.id
}

output "oauth_domain" {
  description = "Cognito OAuth domain prefix"
  value       = aws_cognito_user_pool_domain.main.domain
}

output "api_url" {
  description = "API Gateway HTTP API endpoint"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "region" {
  description = "AWS region"
  value       = local.region
}

output "website_bucket_name" {
  description = "S3 bucket that hosts the frontend"
  value       = aws_s3_bucket.website.bucket
}

output "distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.website.id
}

output "distribution_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.website.domain_name
}

output "website_url" {
  description = "Elevator URL"
  value       = "https://${local.app_domain}/"
}

# Ready-to-write frontend config (matches src/config.json). Consumed by
# scripts/deploy-frontend.sh via `terraform output -json frontend_config`.
output "frontend_config" {
  description = "Values for src/config.json"
  value = {
    awsRegion        = local.region
    userPoolId       = aws_cognito_user_pool.main.id
    userPoolClientId = aws_cognito_user_pool_client.main.id
    oauthDomain      = "${aws_cognito_user_pool_domain.main.domain}.auth.${local.region}.amazoncognito.com"
    appDomain        = local.app_domain
    apiEndpoint      = aws_apigatewayv2_api.main.api_endpoint
    elevatorLoginUrl = "https://${local.app_domain}/"
  }
}
