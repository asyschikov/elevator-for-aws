# =============================================================================
# IAM Identity Center SAML application
# =============================================================================
# There is no Terraform (or public AWS API) resource for an IdC "Custom SAML 2.0"
# application — it is created through the same undocumented console APIs the CDK
# stack drives from a Lambda custom resource. Here we run that exact logic locally
# at apply time via scripts/idc_app.py (which reuses lambda/idc-app/index.py).
#
# Requires: python3 and boto3 on the machine running Terraform, with credentials
# that can administer IAM Identity Center in var.idc_region.

resource "null_resource" "idc_app" {
  triggers = {
    idc_region     = local.idc_region
    cognito_region = local.region
    user_pool_id   = aws_cognito_user_pool.main.id
    oauth_domain   = aws_cognito_user_pool_domain.main.domain
    access_group   = var.elevator_idc_access_group
    app_name       = "Elevator"
    script_sha     = filesha256("${path.module}/scripts/idc_app.py")
  }

  # Create or update the IdC SAML app; write its metadata URL to build/idc_app.json.
  provisioner "local-exec" {
    command = <<-EOT
      python3 "${path.module}/scripts/idc_app.py" create \
        --idc-region "${local.idc_region}" \
        --cognito-region "${local.region}" \
        --user-pool-id "${aws_cognito_user_pool.main.id}" \
        --oauth-domain "${aws_cognito_user_pool_domain.main.domain}" \
        --access-group "${var.elevator_idc_access_group}" \
        --app-name "Elevator" \
        --output "${path.module}/build/idc_app.json"
    EOT
  }

  # Delete the IdC SAML app on destroy (looked up by display name).
  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      python3 "${path.module}/scripts/idc_app.py" delete \
        --idc-region "${self.triggers.idc_region}" \
        --app-name "${self.triggers.app_name}"
    EOT
  }
}

data "local_file" "idc_app" {
  filename   = "${path.module}/build/idc_app.json"
  depends_on = [null_resource.idc_app]
}

locals {
  idc_metadata_url = jsondecode(data.local_file.idc_app.content).metadataUrl
}
