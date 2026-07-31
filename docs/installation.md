# Elevator — Installation & Update Guide

Elevator can be deployed with **AWS CDK** (covered here) or **Terraform**
(see [`terraform/README.md`](../terraform/README.md)). Pick one IaC tool per
environment — both create the same resources with the same names.

## Prerequisites

- **AWS account with IAM Identity Center enabled** (management account, or a member
  account registered as delegated administrator — see below).
- Credentials for that account (e.g. `AWS_PROFILE=...`).
- **Node.js 18+**, **Python 3.12+**, and the **AWS CDK CLI** (`npm i -g aws-cdk`).
- Two or three IAM Identity Center **groups**: an admin group, an auditor group, and a
  group whose members may sign in to the app.

## 1. Configure

```bash
git clone https://github.com/asyschikov/elevator-for-aws.git
cd elevator-for-aws
npm install

cd deployment
cp 00-params-template.sh 00-params.sh
# edit 00-params.sh
```

Key parameters (`deployment/00-params.sh`):

| Variable | Meaning |
|----------|---------|
| `ELEVATOR_ENV` | Environment name (e.g. `prod`) — suffixes all resource names |
| `AWS_REGION` / `IDC_REGION` | Deployment region / IAM Identity Center home region |
| `ELEVATOR_ADMIN_GROUP` | IdC group granted Elevator admin |
| `ELEVATOR_AUDITOR_GROUP` | IdC group granted read-only auditor access |
| `ELEVATOR_IDC_ACCESS_GROUP` | IdC group allowed to sign in to the app |
| `ELEVATOR_CUSTOM_DOMAIN` | Optional custom domain (else the CloudFront domain is used) |
| `ELEVATOR_ALLOW_LOCALHOST` | Allow `localhost:5173` callback URLs (dev only) |

## 2. (Member account only) Delegated administration

If you deploy to a **member** account rather than the org management account, register
it as delegated admin **once, from the management account**:

```bash
./01-delegate.sh <elevator-account-id>
```

This enables delegated administration for AWS Account Management, CloudTrail, and IAM
Identity Center.

## 3. (Optional) Custom domain

```bash
# with ELEVATOR_CUSTOM_DOMAIN set in 00-params.sh
./02-create-domain-and-cert.sh
```

This creates a Route53 hosted zone and an ACM certificate (**in us-east-1**, required
for CloudFront). Follow the prompts to set NS records at your registrar and wait for
DNS validation. Do this **before** the first deploy.

## 4. Deploy

```bash
./03-deploy.sh
```

First run in a new account/region will need a one-time `cdk bootstrap` (the script
tells you). `03-deploy.sh`:
1. `cdk deploy ElevatorStack-<env>` — all infrastructure, including the IdC SAML app.
2. Builds the frontend, generates `src/config.json` from stack outputs, uploads to S3,
   and invalidates CloudFront.

When it finishes it prints the app URL (the CloudFront domain, or your custom domain).

## 5. First sign-in

Access is federated through IAM Identity Center — there are no local user accounts to
create. To get in as an admin:

1. In IAM Identity Center, make sure **your user is a member of**:
   - `ELEVATOR_IDC_ACCESS_GROUP` (permission to open the app), and
   - `ELEVATOR_ADMIN_GROUP` (admin rights inside Elevator).
2. Open the app URL and sign in — you'll be redirected through IdC.
3. As admin, configure eligibility policies, approvers, and settings (see
   [customization](customization.md)).

## Updating

### Application changes (code)

Re-running the deploy reconciles the stack in place:

```bash
cd deployment && ./03-deploy.sh
```

> **If the environment is managed by the pipeline, do not run `03-deploy.sh` for it** —
> deploy through the pipeline instead (below), or the two deployers will fight.

### Frontend only

```bash
cd deployment && ./deploy-frontend.sh
```

### After changing the API models

When you change backend API models (`lambda/backend/models/api_models.py`) or endpoint
signatures (`lambda/backend/index.py`), regenerate the OpenAPI spec and the frontend
TypeScript types **before** building the frontend:

```bash
cd lambda/backend && uv run python generate_openapi.py > ../../openapi.json
cd ../.. && npm run generate:api
```

## Deploying via CI/CD (optional)

Instead of deploying from a laptop, provision a CodePipeline that deploys from GitHub:

```bash
cd deployment && ./bootstrap.sh
```

This is a one-time, admin-run bootstrap. It stores config in SSM, creates a GitHub
connection, and deploys the pipeline (`Source → UpdatePipeline → Approve-Prod →
Deploy-Prod`). Full details — including **how to adopt an already-deployed stack** into
the pipeline — are in [`deployment/README.md`](../deployment/README.md).

After adoption, change app config without redeploying the pipeline:

```bash
cd deployment && ./config-put.sh <env>   # writes /elevator/<env>/config/* to SSM
```

## Uninstall

```bash
cd cdk && npx cdk destroy ElevatorStack-<env>
```

Stateful resources (DynamoDB tables, S3 buckets, the Cognito user pool) are set to
**RETAIN**, so they survive stack deletion — remove them manually if you truly want
them gone. The IdC SAML app is deleted automatically; to remove it by hand:

```bash
cd deployment && source 00-params.sh && python3 delete-idc-app.py
```

## Terraform

For the Terraform path (S3 state backend, `bootstrap` for the state bucket, and a
matching pipeline under `terraform/pipeline/`), follow
[`terraform/README.md`](../terraform/README.md).
