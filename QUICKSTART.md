# Quick Start Guide

## TL;DR - Deploy in 5 Steps

```bash
# 1. Install dependencies
npm install && cd cdk && npm install && cd ..

# 2. Bootstrap CDK (first time only)
cd cdk && cdk bootstrap && cd ..

# 3. Build frontend
npm run build

# 4. Deploy everything
npm run deploy

# 5. Generate config and redeploy
npm run generate-config team-stack-dev
npm run build
npm run deploy
```

## What Gets Created

The deployment creates **two stacks**:

### Backend Stack (`team-backend-dev`)
- **1 Cognito User Pool** with Admin and Auditors groups
- **1 AppSync GraphQL API** with Cognito + IAM auth
- **5 DynamoDB Tables**: requests, sessions, Approvers, Settings, Eligibility
- **19 Lambda Functions** for backend logic
- **5 Step Functions** for workflows (Grant, Revoke, Schedule, Reject, Approval)
- **1 CloudTrail Lake** event data store
- **1 SNS Topic** for notifications

### Frontend Stack (`team-frontend-dev`)
- **1 S3 Bucket** for static assets
- **1 CloudFront Distribution** for content delivery
- **Automated deployment** of build/ directory

## First Login

After deployment:

```bash
# Get website URL
aws cloudformation describe-stacks \
  --stack-name team-frontend-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
  --output text

# Create first admin user
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name team-backend-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS

aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --group-name Admin

aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --password 'ChangeMe123!' \
  --permanent
```

## Making Changes

### Frontend Code
```bash
# Edit files in src/
npm run build
npm run deploy
```

### Lambda Functions
```bash
# Edit files in amplify/backend/function/<function-name>/src/
npm run deploy
```

### Infrastructure
```bash
# Edit cdk/lib/team-stack.ts
npm run deploy
```

## Common Commands

```bash
# View synthesized CloudFormation
npm run cdk:synth

# Compare changes before deploy
npm run cdk:diff

# Destroy everything (⚠️ CAREFUL!)
npm run cdk:destroy
```

## Troubleshooting

**Problem**: `aws-exports.js` not found
**Solution**: Run `npm run generate-config` (or `node cdk/scripts/generate-config.js dev`) after first deployment

**Problem**: CORS errors in browser
**Solution**: Check AppSync API URL in `src/aws-exports.js` matches deployed API

**Problem**: Lambda errors
**Solution**: Check CloudWatch logs: `aws logs tail /aws/lambda/<function-name> --follow`

For more details, see [DEPLOYMENT.md](./DEPLOYMENT.md)
