# Elevator — Terraform deployment

This is an **alternative** to the CDK deployment under [`../cdk`](../cdk) /
[`../deployment`](../deployment). It provisions the same Elevator application —
Cognito + SAML federation to IAM Identity Center, an API Gateway HTTP API backed by
Python Lambdas, DynamoDB, CloudFront, and a CloudTrail Lake event data store — using
Terraform with an **S3 state backend**.

Pick **one** IaC tool per environment (CDK *or* Terraform). Both create resources
with the same names, so they would collide if pointed at the same account + env.

## Prerequisites

- Terraform >= 1.10, AWS CLI configured for the target account
- Python 3 with `boto3` (for the IdC SAML app step)
- [`uv`](https://docs.astral.sh/uv/) (to build the Lambda packages)
- Node.js + npm (to build the frontend)
- IAM Identity Center enabled; credentials able to administer it in `idc_region`
- For a custom domain: an **ISSUED ACM certificate in us-east-1** and a **Route53
  hosted zone** for the domain must already exist

## 1. Bootstrap the state bucket (once per account)

The S3 backend needs its bucket to exist first. Create it with local state:

```bash
cd bootstrap
terraform init
terraform apply -var region=us-east-1
# note the output "bucket"
cd ..
```

## 2. Configure

```bash
cp terraform.tfvars.example terraform.tfvars   # edit values
cp backend.hcl.example backend.hcl             # set bucket/key/region from step 1
```

## 3. Build the Lambda packages

Terraform zips prebuilt directories; build them first (installs deps with `uv`):

```bash
./scripts/build-lambdas.sh
```

## 4. Init & apply

```bash
terraform init -backend-config=backend.hcl
terraform apply
```

During apply, the IdC SAML application is created locally by
`scripts/idc_app.py` (reusing `../lambda/idc-app/index.py`) and its metadata URL is
fed into the Cognito SAML identity provider.

> If the first `apply` errors reading `build/idc_app.json` before it exists, run a
> targeted apply of the SAML app first, then apply the rest:
> `terraform apply -target=null_resource.idc_app && terraform apply`

## 5. Deploy the frontend

```bash
./scripts/deploy-frontend.sh
```

This writes `../src/config.json` from Terraform outputs, builds the frontend, uploads
it to the website bucket, and invalidates CloudFront.

## Custom domain

Set `custom_domain` in `terraform.tfvars`. The certificate (us-east-1, ISSUED) and
Route53 zone must already exist — Terraform looks them up as data sources and adds the
alias A record. Certificate issuance/DNS validation is intentionally out of scope here
(the same as the CDK flow).

## Destroy

```bash
terraform destroy
```

Stateful resources (DynamoDB tables, S3 buckets, the Cognito user pool) have
`prevent_destroy = true` to mirror the CDK `RETAIN` policy — remove those lifecycle
blocks first if you really intend to delete them. The IdC SAML app is deleted by the
`null_resource.idc_app` destroy provisioner.

## Notes & caveats

- **Lambda runtime is Python 3.14** (matching the CDK stack). `build-lambdas.sh`
  installs Linux wheels via `uv`; if a dependency lacks 3.14 wheels for your target
  arch, adjust `ELEVATOR_PY_VERSION` / `lambda_architecture`.
- **The IdC SAML app uses undocumented console APIs** — there is no native resource
  for it in Terraform or the AWS provider; the local-exec approach is the same logic
  the CDK custom resource runs.
- This configuration has been `terraform validate`-checked. Verify a real `apply` in a
  non-prod account before relying on it.
