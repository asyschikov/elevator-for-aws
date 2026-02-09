# Elevator Deployment

Scripts for deploying Elevator (Temporary Elevated Access Management) using CDK.

## Prerequisites

- AWS CLI configured with appropriate profiles
- Node.js and npm installed
- Python 3 with boto3, requests, requests-aws4auth
- CDK CLI (`npm install -g aws-cdk`)

## Configuration

Edit `00-params.sh`:

| Variable | Description |
|----------|-------------|
| `AWS_PROFILE` | AWS CLI profile for the Elevator account |
| `AWS_REGION` | AWS region for deployment |
| `ELEVATOR_ENV` | Environment name (e.g., `prod`) |
| `IDC_REGION` | IAM Identity Center home region (if different) |
| `ELEVATOR_ADMIN_GROUP` | Admin group name in IAM Identity Center |
| `ELEVATOR_AUDITOR_GROUP` | Auditor group name in IAM Identity Center |
| `ELEVATOR_EXTERNAL_DOMAIN` | Custom domain (optional) |
| `ELEVATOR_IDC_ACCESS_GROUP` | IAM Identity Center group for app access |
| `SAML_METADATA_URL` | SAML metadata URL (set after step 2) |

## Deployment Steps

### 1. Initialize (one-time)

```bash
./01-init.sh
```

Bootstraps CDK. For member account deployments, also enables delegated admin.

### 2. Create IDC SAML Application

```bash
source 00-params.sh && python3 02-get-saml-metadata.py
```

Creates the IAM Identity Center SAML application and outputs the metadata URL.

Copy the URL to `00-params.sh`:
```bash
export SAML_METADATA_URL=https://portal.sso.{region}.amazonaws.com/saml/metadata/...
```

### 3. Deploy Stack

```bash
source 00-params.sh && ./03-deploy.sh
```

Deploys infrastructure including Cognito with SAML identity provider.

### 4. Configure IDC Application

```bash
source 00-params.sh && python3 04-configure-idc-app.py
```

Configures the IDC app with Cognito's ACS URL and audience, and assigns the access group.

## Scripts

| Script | Description |
|--------|-------------|
| `00-params.sh` | Deployment parameters |
| `01-init.sh` | Initialize CDK / delegated admin |
| `02-get-saml-metadata.py` | Create IDC app, get metadata URL |
| `03-deploy.sh` | Deploy infrastructure |
| `04-configure-idc-app.py` | Configure IDC app with Cognito settings |
| `delete-idc-app.py` | Delete the IDC application |
| `deploy-frontend.sh` | Deploy frontend only |
| `generate-config.py` | Generate frontend config |

## Updating

Redeploy everything:
```bash
source 00-params.sh && ./03-deploy.sh
```

Frontend only:
```bash
./deploy-frontend.sh
```

## Deleting IDC Application

```bash
source 00-params.sh && python3 delete-idc-app.py
```
