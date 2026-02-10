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

### Quick Start (Management Account)

If deploying to the AWS Organizations management account:

```bash
./02-deploy.sh
```

### Deploying to a Member Account

If deploying to a member account, you need delegated admin permissions first. This is a one-time setup that must be done from the **management account**.

**Option A: Run the script (from management account)**
```bash
./01-delegate.sh <elevator-account-id>
```

**Option B: Manual setup in AWS Console**

Register the Elevator account as delegated administrator for:
- AWS Account Management
- AWS CloudTrail
- IAM Identity Center

Then deploy from the Elevator account:
```bash
./02-deploy.sh
```

### What Gets Deployed

The deployment creates:
- Cognito User Pool with SAML federation to IAM Identity Center
- IAM Identity Center SAML application (auto-configured)
- API Gateway HTTP API with Lambda backend
- DynamoDB tables for requests, sessions, approvers, eligibility, settings
- S3 bucket + CloudFront distribution for the frontend
- CloudTrail Lake event data store for audit logs

## Custom Domain (Optional)

You can use a custom domain like `elevator.example.com` instead of the CloudFront domain.

### Option 1: Set up custom domain before first deployment

If you want to use a custom domain from the start:

1. **Set the domain in params**
   ```bash
   # In 00-params.sh
   export ELEVATOR_CUSTOM_DOMAIN=elevator.example.com
   ```

2. **Create DNS zone and certificate**
   ```bash
   ./03-create-domain-and-cert.sh
   ```
   This creates a Route53 hosted zone and ACM certificate. The script will:
   - Start the deployment
   - Display NS records once the hosted zone is created
   - Wait for you to configure these NS records at your domain registrar
   - Complete once DNS propagates and the certificate is validated

3. **Deploy the application**
   ```bash
   ./02-deploy.sh
   ```
   The deployment automatically:
   - Looks up the certificate and hosted zone
   - Configures CloudFront with the custom domain
   - Creates an A record pointing to CloudFront

### Option 2: Add custom domain to existing deployment

If you already deployed without a custom domain and want to add one later:

1. **Set the domain in params**
   ```bash
   # In 00-params.sh
   export ELEVATOR_CUSTOM_DOMAIN=elevator.example.com
   ```

2. **Create DNS zone and certificate**
   ```bash
   ./03-create-domain-and-cert.sh
   ```
   Follow the prompts to configure NS records at your domain registrar.

3. **Redeploy to add custom domain**
   ```bash
   ./02-deploy.sh
   ```
   This updates the existing stack with the custom domain configuration.

## Automated Deployments with CodePipeline (Optional)

Instead of running `./02-deploy.sh` manually, you can set up a CI/CD pipeline that automatically deploys when you push to your repository.

### Create the Pipeline

After your initial deployment with `./02-deploy.sh`, run:

```bash
./create-pipeline.sh
```

This creates a CodePipeline that:
- Triggers on pushes to your branch (auto-detected from git, or set `ELEVATOR_BRANCH`)
- Deploys infrastructure changes via CDK
- Builds and deploys the frontend

### Approve GitHub Connection

After creating the pipeline, you must approve the GitHub connection in the AWS Console:

1. Go to **Developer Tools > Settings > Connections**
2. Find the `elevator-github-*` connection (status: Pending)
3. Click **Update pending connection** and authorize GitHub access

The pipeline will start automatically once the connection is approved.

### Pipeline Variables

You can optionally set these in `00-params.sh`:

| Variable | Description |
|----------|-------------|
| `ELEVATOR_REPO_OWNER` | GitHub owner/org (auto-detected from git remote) |
| `ELEVATOR_REPO_NAME` | Repository name (auto-detected from git remote) |
| `ELEVATOR_BRANCH` | Branch to deploy (defaults to current branch) |

## Scripts

| Script | Description |
|--------|-------------|
| `00-params-template.sh` | Template for deployment parameters |
| `00-params.sh` | Your deployment parameters (not in git) |
| `01-delegate.sh` | Set up delegated admin (run from management account) |
| `02-deploy.sh` | Deploy the Elevator stack |
| `03-create-domain-and-cert.sh` | Set up custom domain and certificate |
| `create-pipeline.sh` | Create CodePipeline for automated deployments |
| `deploy-frontend.sh` | Redeploy frontend only |
| `generate-config.py` | Generate frontend config from stack outputs |
| `delete-idc-app.py` | Manually delete the IDC SAML application |

## Updating

### Manual deployment

```bash
./02-deploy.sh
```

### With pipeline

Just push to your configured branch. The pipeline will deploy automatically.

### Frontend only (manual)

```bash
./deploy-frontend.sh
```

## Cleanup

The IDC SAML application is automatically deleted when the stack is destroyed. To manually delete it:

```bash
source 00-params.sh && python3 delete-idc-app.py
```
