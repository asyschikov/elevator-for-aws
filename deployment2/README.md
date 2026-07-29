# Elevator Deployment

Single-step deployment for Elevator (Temporary Elevated Access Management) using CDK.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js and npm installed
- Python 3.12+
- CDK CLI (`npm install -g aws-cdk`)

## Configuration

Copy the template and edit with your values:

```bash
cp 00-params-template.sh 00-params.sh
# Edit 00-params.sh with your values
```

| Variable | Description |
|----------|-------------|
| `ELEVATOR_ENV` | Environment name (e.g., `prod`) |
| `IDC_REGION` | IAM Identity Center home region (if different from deployment region) |
| `ELEVATOR_ADMIN_GROUP` | Admin group name in IAM Identity Center |
| `ELEVATOR_AUDITOR_GROUP` | Auditor group name in IAM Identity Center |
| `ELEVATOR_IDC_ACCESS_GROUP` | IAM Identity Center group for app access |
| `ELEVATOR_CUSTOM_DOMAIN` | Custom domain (optional, e.g., `elevator.example.com`) |
| `ELEVATOR_ALLOW_LOCALHOST` | Allow localhost in Cognito callbacks (`true` for dev, `false` for prod) |

## Deployment

### Quick Start

```bash
# 1. (Optional) Set up custom domain first
./02-create-domain-and-cert.sh

# 2. Deploy Elevator
./03-deploy.sh
```

### Deploying to a Member Account

If deploying to a member account (not the management account), you need delegated admin permissions first. This is a one-time setup from the **management account**.

**Option A: Run the script (from management account)**
```bash
./01-delegate.sh <elevator-account-id>
```

**Option B: Manual setup in AWS Console**

Register the Elevator account as delegated administrator for:
- AWS Account Management
- AWS CloudTrail
- IAM Identity Center

Then deploy from the Elevator account.

### What Gets Deployed

The deployment creates:
- Cognito User Pool with SAML federation to IAM Identity Center
- IAM Identity Center SAML application (auto-configured)
- API Gateway HTTP API with Lambda backend
- DynamoDB tables for requests, sessions, approvers, eligibility, settings
- S3 bucket + CloudFront distribution for the frontend
- CloudTrail Lake event data store for audit logs

## Custom Domain (Optional)

Use a custom domain like `elevator.example.com` instead of the CloudFront domain.

### Recommended: Set up before first deployment

1. **Set the domain in params**
   ```bash
   # In 00-params.sh
   export ELEVATOR_CUSTOM_DOMAIN=elevator.example.com
   ```

2. **Create DNS zone and certificate**
   ```bash
   ./02-create-domain-and-cert.sh
   ```
   This creates a Route53 hosted zone and ACM certificate. The script will:
   - Display NS records once the hosted zone is created
   - Wait for you to configure these NS records at your domain registrar
   - Complete once DNS propagates and the certificate is validated

3. **Deploy the application**
   ```bash
   ./03-deploy.sh
   ```

### Adding custom domain later

If you already deployed without a custom domain:

1. Set `ELEVATOR_CUSTOM_DOMAIN` in `00-params.sh`
2. Run `./02-create-domain-and-cert.sh`
3. Redeploy with `./03-deploy.sh`

## Deployments with CodePipeline (Optional)

Instead of running `./03-deploy.sh` from your laptop for every change, you can run a
**one-time bootstrap** that provisions a self-updating CodePipeline. After that, the
pipeline deploys Elevator from GitHub. See `CICD_PROPOSAL.md` for the full design.

Pipeline shape:

```
Source (GitHub) → [Deploy-NonProd?] → Approve-Prod → Deploy-Prod
```

### One-time bootstrap

```bash
./bootstrap.sh
```

This is safe to re-run and it:

1. Writes your application config to **SSM Parameter Store** (`/elevator/<env>/config/*`).
   The pipeline reads these at run time, so later changes don't require a pipeline redeploy.
2. `cdk bootstrap`s the account/region if needed.
3. Creates a **GitHub CodeConnections** connection and stores its ARN in SSM.
4. Deploys the pipeline stack (`ElevatorPipeline-<env>`).
5. Prints the console URL to **approve the GitHub connection** — the one manual,
   one-time step (no long-lived credentials are stored).

### Approve the GitHub connection

Bootstrap pauses until the connection is approved (`Ctrl-C` to skip; re-running is safe):

1. Open **Developer Tools → Settings → Connections**
2. Select `elevator-github-<env>` (status: *Pending*)
3. Click **Update pending connection** and authorize access to your repo

### How it runs

- **Trigger:** pushing to the configured branch starts the pipeline automatically.
- **The pipeline does not manage itself.** There is no self-mutation — the pipeline
  only deploys the application. Changes to the pipeline itself are released explicitly
  by an admin from the CLI (`./bootstrap.sh`, or
  `cdk deploy ElevatorPipeline-<env>`), so pushing app code can never alter the
  pipeline or its permissions.
- **Prod is always gated:** the `Approve-Prod` manual-approval action must be approved
  (console: **CodePipeline → elevator-<env>**) before prod is deployed.

### Changing configuration later

Edit the value in `00-params.sh` (or directly in SSM) and run:

```bash
./config-put.sh <env>
```

The next pipeline run picks it up — no pipeline redeploy.

### Optional non-prod stage

Set `ELEVATOR_NONPROD_ENV=<name>` in `00-params.sh` and re-run `./bootstrap.sh`. This
adds a non-prod deploy stage **before** the prod approval. Populate its config with
`./config-put.sh <name>`. Leave `ELEVATOR_NONPROD_ENV` unset (default) and the stage is
not part of the pipeline at all.

### Custom domain with the pipeline

Custom-domain certificate setup is interactive (DNS validation) and remains a one-time
prerequisite — run `./02-create-domain-and-cert.sh` **before** `./bootstrap.sh`. The
pipeline's deploy stage does not create the domain/certificate.

### Pipeline Variables

| Variable | Description |
|----------|-------------|
| `ELEVATOR_REPO_OWNER` | GitHub owner/org (auto-detected from git remote) |
| `ELEVATOR_REPO_NAME` | Repository name (auto-detected from git remote) |
| `ELEVATOR_BRANCH` | Branch to deploy (defaults to current branch) |
| `ELEVATOR_NONPROD_ENV` | Optional non-prod env; enables the non-prod stage when set |

## Local Development

Run the frontend locally against a deployed backend (requires `ELEVATOR_ALLOW_LOCALHOST=true`):

```bash
# Generate config pointing to localhost
./generate-local-config.sh

# Start dev server
cd .. && npm run dev
```

The frontend runs at http://localhost:5173 and connects to your deployed API.

**Note:** Localhost must be enabled in Cognito callbacks. Set `ELEVATOR_ALLOW_LOCALHOST=true` in `00-params.sh` and redeploy.

## Scripts

| Script | Description |
|--------|-------------|
| `00-params-template.sh` | Template for deployment parameters |
| `00-params.sh` | Your deployment parameters (not in git) |
| `01-delegate.sh` | Set up delegated admin (run from management account) |
| `02-create-domain-and-cert.sh` | Set up custom domain and certificate (optional) |
| `03-deploy.sh` | Deploy the Elevator stack locally |
| `bootstrap.sh` | One-time setup of the CI/CD pipeline (SSM config + GitHub connection + pipeline) |
| `config-put.sh` | Write/update an environment's config in SSM (read by the pipeline at run time) |
| `create-pipeline.sh` | Deprecated alias for `bootstrap.sh` |
| `deploy-frontend.sh` | Redeploy frontend only |
| `generate-local-config.sh` | Generate config for local development |
| `generate-config.py` | Generate frontend config from stack outputs |
| `delete-idc-app.py` | Manually delete the IDC SAML application |

## Updating

### Local deployment

```bash
./03-deploy.sh
```

### With pipeline

Push to the configured branch — the pipeline triggers automatically. Approve the
`Approve-Prod` step in the console to deploy prod. To force a run without a push:

```bash
aws codepipeline start-pipeline-execution --name elevator-$ELEVATOR_ENV
```

### Frontend only

```bash
./deploy-frontend.sh
```

## Cleanup

The IDC SAML application is automatically deleted when the stack is destroyed. To manually delete it:

```bash
source 00-params.sh && python3 delete-idc-app.py
```
