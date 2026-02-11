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

Instead of running `./03-deploy.sh` locally, you can set up a CodePipeline to deploy from AWS.

### Create the Pipeline

After your initial deployment with `./03-deploy.sh`, run:

```bash
./create-pipeline.sh
```

This creates a CodePipeline that:
- Pulls from your branch (auto-detected from git, or set `ELEVATOR_BRANCH`)
- Deploys infrastructure changes via CDK
- Builds and deploys the frontend

### Approve GitHub Connection

After creating the pipeline, you must approve the GitHub connection in the AWS Console:

1. Go to **Developer Tools > Settings > Connections**
2. Find the `elevator-github-*` connection (status: Pending)
3. Click **Update pending connection** and authorize GitHub access

### Run the Pipeline

The pipeline does not trigger automatically. To deploy, manually start the pipeline:
- In AWS Console: **CodePipeline > elevator-{env} > Release change**
- Or via CLI: `aws codepipeline start-pipeline-execution --name elevator-$ELEVATOR_ENV`

### Custom Domain with Pipeline

Custom domain setup is interactive and must be done manually (not via pipeline).

**Recommended: Set up custom domain before creating pipeline**

1. Set `ELEVATOR_CUSTOM_DOMAIN` in `00-params.sh`
2. Run `./02-create-domain-and-cert.sh` and configure NS records
3. Run `./03-deploy.sh` for initial deployment
4. Run `./create-pipeline.sh` to create the pipeline

**Adding custom domain to existing pipeline**

1. Set `ELEVATOR_CUSTOM_DOMAIN` in `00-params.sh`
2. Run `./02-create-domain-and-cert.sh` and configure NS records
3. Run `./create-pipeline.sh` again to update the pipeline
4. Trigger the pipeline to deploy with the custom domain

### Pipeline Variables

| Variable | Description |
|----------|-------------|
| `ELEVATOR_REPO_OWNER` | GitHub owner/org (auto-detected from git remote) |
| `ELEVATOR_REPO_NAME` | Repository name (auto-detected from git remote) |
| `ELEVATOR_BRANCH` | Branch to deploy (defaults to current branch) |

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
| `03-deploy.sh` | Deploy the Elevator stack |
| `create-pipeline.sh` | Create CodePipeline for deployments |
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
