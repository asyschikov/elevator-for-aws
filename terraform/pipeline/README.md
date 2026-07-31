# Elevator — Terraform CI/CD pipeline

The Terraform counterpart to the CDK pipeline ([`../../deployment`](../../deployment)).
A one-time bootstrap provisions a self-mutating, multi-stage **CodePipeline** that
deploys Elevator (via the Terraform config in [`..`](..)) from GitHub.

```
Source (GitHub) → UpdatePipeline (self-mutate) → [Deploy-NonProd?] → Approve-Prod → Deploy-Prod
```

- **Config in AWS:** application config lives in SSM (`/elevator/<env>/config/*`) and
  is read at run time (mapped to `TF_VAR_*`), so changing a value takes effect on the
  next run — no pipeline redeploy.
- **Self-mutation:** the `UpdatePipeline` stage runs `terraform apply` on this pipeline
  config, so changes to it apply before the app is deployed.
- **Prod is always gated** by a manual approval.
- **Non-prod stage** is optional — set `ELEVATOR_NONPROD_ENV` to add a deploy stage
  before the prod approval; leave it unset and the stage isn't created.

Each deploy stage runs, in CodeBuild: install Terraform + uv → load SSM config →
`build-lambdas.sh` → `terraform init/apply` the app → `deploy-frontend.sh`.

## Prerequisites

- The state bucket exists — run [`../bootstrap`](../bootstrap) once first.
- AWS credentials for the target account; a GitHub repo for Elevator.

## Usage

```bash
cp params.sh.example params.sh   # edit: env, region, groups, state bucket, repo
./bootstrap.sh
```

`bootstrap.sh` writes config to SSM, creates the GitHub connection (ARN → SSM),
applies the pipeline, and prints the console URL to **approve the connection** — the
one manual, one-time step (no long-lived credentials).

### Change config later

```bash
./config-put.sh <env>     # re-write SSM from params.sh; next run picks it up
```

### Enable a non-prod stage

Set `ELEVATOR_NONPROD_ENV=<name>` in `params.sh`, run `./config-put.sh <name>` to
populate its config, then re-run `./bootstrap.sh`.

## Notes

- **CodeBuild role uses `AdministratorAccess`.** `terraform apply` for the full stack
  creates IAM roles, Cognito, Lambda, etc., so it needs broad permissions (the CDK
  equivalent assumes the admin CDK bootstrap roles). Scope this down for production —
  see the comment in `iam.tf`.
- **IdC SAML app** is created by the deploy job the same way as a local apply — via
  `../scripts/idc_app.py` — so the CodeBuild role must be able to administer IAM
  Identity Center in `idc_region`.
- `terraform validate` + `fmt` clean; not yet apply-tested end to end.
