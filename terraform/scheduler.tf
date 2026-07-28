# EventBridge Scheduler role — the backend creates schedules at run time that
# invoke the revocation function to remove access when a session expires.
resource "aws_iam_role" "scheduler" {
  name = "elevator-scheduler-${var.env_name}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name = "invoke-revocation"
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = [aws_lambda_function.revocation.arn, "${aws_lambda_function.revocation.arn}:*"]
    }]
  })
}
