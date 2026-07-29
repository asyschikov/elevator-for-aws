output "pipeline_name" {
  description = "CodePipeline name"
  value       = aws_codepipeline.main.name
}

output "artifacts_bucket" {
  description = "Pipeline artifact bucket"
  value       = aws_s3_bucket.artifacts.bucket
}

output "nonprod_stage" {
  description = "Non-prod environment deployed before the prod approval, if any"
  value       = local.has_nonprod ? var.nonprod_env : "(disabled)"
}
