resource "aws_codepipeline" "main" {
  name          = "elevator-tf-${var.env_name}"
  role_arn      = aws_iam_role.pipeline.arn
  pipeline_type = "V2"

  artifact_store {
    location = aws_s3_bucket.artifacts.bucket
    type     = "S3"
  }

  # Source — auto-triggers on push to the configured branch.
  stage {
    name = "Source"
    action {
      name             = "GitHub"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["SourceOutput"]
      configuration = {
        ConnectionArn    = local.connection_arn
        FullRepositoryId = "${var.repo_owner}/${var.repo_name}"
        BranchName       = var.branch
        DetectChanges    = "true"
      }
    }
  }

  # Self-mutation — applies pipeline changes before anything is deployed.
  stage {
    name = "UpdatePipeline"
    action {
      name            = "SelfMutate"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["SourceOutput"]
      configuration = {
        ProjectName = aws_codebuild_project.update.name
      }
    }
  }

  # Optional non-prod stage — only present when var.nonprod_env is set.
  dynamic "stage" {
    for_each = local.has_nonprod ? [1] : []
    content {
      name = "Deploy-NonProd"
      action {
        name            = "Deploy-${var.nonprod_env}"
        category        = "Build"
        owner           = "AWS"
        provider        = "CodeBuild"
        version         = "1"
        input_artifacts = ["SourceOutput"]
        configuration = {
          ProjectName          = aws_codebuild_project.deploy.name
          EnvironmentVariables = jsonencode([{ name = "TARGET_ENV", value = var.nonprod_env, type = "PLAINTEXT" }])
        }
      }
    }
  }

  # Prod — always gated by a manual approval.
  stage {
    name = "Approve-Prod"
    action {
      name     = "ApproveProdDeploy"
      category = "Approval"
      owner    = "AWS"
      provider = "Manual"
      version  = "1"
      configuration = {
        CustomData = "Approve deployment of Elevator to the '${var.env_name}' (prod) environment."
      }
    }
  }

  stage {
    name = "Deploy-Prod"
    action {
      name            = "Deploy-${var.env_name}"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["SourceOutput"]
      configuration = {
        ProjectName          = aws_codebuild_project.deploy.name
        EnvironmentVariables = jsonencode([{ name = "TARGET_ENV", value = var.env_name, type = "PLAINTEXT" }])
      }
    }
  }

  depends_on = [aws_iam_role_policy.pipeline]
}
