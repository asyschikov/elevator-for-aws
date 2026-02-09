# Configuration Guide

## Environment Configuration

The deployment uses environment variables for AWS account and region configuration. All environment-specific settings are now streamlined to match Amplify's minimal approach.

## Default Environment

The default environment is **`test`** and will be used if no environment is specified during deployment.

## Environment Variables

AWS account and region are retrieved from environment:

```bash
# Set explicitly
export CDK_DEFAULT_ACCOUNT=123456789012
export CDK_DEFAULT_REGION=us-east-1

# Or use AWS CLI configured credentials
aws configure
```

CDK will automatically use your configured AWS credentials.

## Deploying to Different Environments

### Test Environment (Default)
```bash
npm run deploy
# or
cd cdk && cdk deploy --all
```

### Production Environment
```bash
cd cdk
cdk deploy --all --context environment=prod
```

### Other Environments
```bash
cd cdk
cdk deploy --all --context environment=staging
```

## Stack Names

Stack names are generated based on the environment context:

```
team-backend-{environment}
team-frontend-{environment}
```

Examples:
- **Test**: `team-backend-test`, `team-frontend-test`
- **Prod**: `team-backend-prod`, `team-frontend-prod`

## Resource Names

All resources follow consistent naming:

- **DynamoDB Tables**: `{tableName}-{environment}`
  - `requests-test`
  - `sessions-test`
  - `Approvers-test`
  - `Settings-test`
  - `Eligibility-test`

- **S3 Buckets**: `team-{purpose}-{environment}-{account}`
  - `team-website-test-123456789012`
  - `team-cloudtrail-bucket-test-123456789012`

- **Cognito**: `team-user-pool-{environment}`

- **Lambda Functions**: Original names from `amplify/backend/function/`

- **Step Functions**: `TEAM-{Type}-SM-{environment}`
  - `TEAM-Grant-SM-test`
  - `TEAM-Revoke-SM-test`
  - etc.

## Hardcoded Configuration Values

All resource settings are hardcoded to sensible defaults matching Amplify's original configuration:

### DynamoDB
- **Billing Mode**: `PAY_PER_REQUEST` (on-demand pricing)
- **Point-in-Time Recovery**: Enabled
- **Removal Policy**: `RETAIN` (resources preserved on stack deletion)

### Lambda
- **Timeout**: 60 seconds
- **Runtime**: Python 3.11 / Node.js 18.x

### Cognito Password Policy
- **Min Length**: 8 characters
- **Requirements**: Lowercase, uppercase, digits, symbols

### CloudTrail
- **Retention**: 90 days
- **Multi-Region**: Enabled
- **Organization**: Enabled

### Step Functions
- **Log Retention**: 14 days
- **Tracing**: Enabled (X-Ray)

### S3
- **Encryption**: S3-managed
- **Block Public Access**: Enabled
- **Enforce SSL**: Enabled

## Tags

All resources automatically get tags:

```typescript
tags: {
  Environment: envName,
  Application: 'TEAM',
  Component: 'Backend' | 'Frontend',
  ManagedBy: 'CDK',
}
```

Component-specific tags are added:
- `Component: 'Backend'` for backend stack
- `Component: 'Frontend'` for frontend stack

Use tags for:
- Cost allocation reports
- Resource filtering
- Compliance tracking
- Automated operations

## Modifying Configuration

If you need to change resource settings, edit the stack files directly:
- `cdk/lib/team-stack.ts` - Backend resources
- `cdk/lib/frontend-stack.ts` - Frontend resources

After making changes:

```bash
# Rebuild CDK
cd cdk
npm run build

# View changes
cdk diff --context environment=test

# Deploy changes
cdk deploy --all --context environment=test
```
