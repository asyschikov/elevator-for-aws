# TEAM - CDK Deployment Guide

This application has been migrated from AWS Amplify to AWS CDK for infrastructure as code. The frontend is built manually using `npm run build`, and CDK handles all backend infrastructure deployment.

## Architecture Overview

The application is deployed as **two separate CDK stacks**:

### Backend Stack (`team-backend-{env}`)
- **Cognito** - User authentication and authorization
- **AppSync** - GraphQL API
- **DynamoDB** - Data storage (5 tables)
- **Lambda** - Backend functions (19 functions)
- **Step Functions** - Workflow orchestration (5 state machines)
- **CloudTrail Lake** - Audit logging
- **SNS** - Notifications

### Frontend Stack (`team-frontend-{env}`)
- **S3** - Static asset storage
- **CloudFront** - Content delivery network
- **BucketDeployment** - Automated frontend uploads

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## Prerequisites

Before deploying, ensure you have:

1. **Node.js** (v18 or later)
2. **AWS CLI** configured with appropriate credentials
3. **AWS CDK CLI** installed globally:
   ```bash
   npm install -g aws-cdk
   ```
4. **IAM Identity Center (AWS SSO)** set up in your AWS account
5. **Sufficient IAM permissions** to create all resources

## Project Structure

```
.
├── src/                      # React frontend source code
├── public/                   # Static assets
├── amplify/backend/          # Lambda function code (preserved from Amplify)
│   ├── function/            # All Lambda functions
│   └── api/team/            # GraphQL schema
├── cdk/                      # CDK infrastructure code
│   ├── bin/                 # CDK app entry point
│   ├── lib/                 # Stack definitions
│   │   └── team-stack.ts   # Main infrastructure stack
│   ├── state-machines/      # Step Functions definitions
│   └── scripts/             # Deployment scripts
└── build/                    # Frontend build output (generated)
```

## Deployment Steps

### 1. Install Dependencies

```bash
# Install root dependencies (frontend)
npm install

# Install CDK dependencies
cd cdk
npm install
cd ..
```

### 2. Bootstrap CDK (First Time Only)

If this is your first CDK deployment in this AWS account/region:

```bash
cd cdk
cdk bootstrap
cd ..
```

### 3. Build Frontend

```bash
npm run build
```

This creates the `build/` directory with the compiled React application.

### 4. Deploy Infrastructure

```bash
# Option 1: Deploy all stacks (recommended)
npm run deploy

# Option 2: Deploy only backend stack
npm run cdk:deploy:backend

# Option 3: Deploy only frontend stack
npm run cdk:deploy:frontend

# Option 4: Deploy to specific environment
cd cdk
cdk deploy --all --context environment=prod
```

The deployment will create **two stacks**:

**Backend Stack** - Creates:
- Cognito User Pool and Identity Pool
- AppSync GraphQL API
- All Lambda functions
- Step Functions state machines
- DynamoDB tables
- Supporting services (SNS, CloudTrail Lake, etc.)

**Frontend Stack** - Creates:
- S3 bucket for static assets
- CloudFront distribution
- Uploads build/ directory automatically
- Sets up cache policies

### 5. Generate Frontend Configuration

After first deployment, update the frontend configuration:

```bash
npm run generate-config
# or specify environment
node cdk/scripts/generate-config.js prod
```

This fetches outputs from both stacks and creates `src/aws-exports.js` with the correct API endpoints and Cognito pool IDs.

### 6. Rebuild and Redeploy Frontend

```bash
npm run build
npm run cdk:deploy:frontend
```

Or deploy both stacks:
```bash
npm run deploy
```

## Environment Management

The stack supports multiple environments (dev, staging, prod):

```bash
# Deploy to dev (default)
cd cdk && cdk deploy

# Deploy to production
cd cdk && cdk deploy --context environment=prod

# Deploy to staging
cd cdk && cdk deploy --context environment=staging
```

Each environment creates a separate stack with isolated resources.

## Post-Deployment Configuration

### 1. Create Admin User

```bash
# Get User Pool ID from backend stack outputs
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name team-backend-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

# Create admin user
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS

# Add user to Admin group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --group-name Admin

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --password 'YourSecurePassword123!' \
  --permanent
```

### 2. Configure IAM Identity Center

The application requires IAM Identity Center (AWS SSO) to be configured:

1. Enable IAM Identity Center in your AWS account
2. Note the Identity Store ID and SSO Instance ARN
3. Update Lambda functions with these values if needed (they should auto-discover)

### 3. Configure Settings

Access the application and configure:
- Approval workflows
- Session durations
- Notification settings (SNS, SES, Slack)
- Admin and Auditor groups

## Development Workflow

### Local Development

```bash
# Start frontend dev server
npm start

# The app will use src/aws-exports.js for backend connection
```

### Making Changes

1. **Frontend Changes**: Edit files in `src/`, then `npm run build` and `npm run cdk:deploy`
2. **Lambda Changes**: Edit files in `amplify/backend/function/`, then `npm run cdk:deploy`
3. **Infrastructure Changes**: Edit `cdk/lib/team-stack.ts`, then `npm run cdk:deploy`
4. **State Machine Changes**: Edit JSON in `cdk/state-machines/`, then `npm run cdk:deploy`

### Useful Commands

```bash
# Synthesize CloudFormation template
npm run cdk:synth

# Show diff between deployed and local
npm run cdk:diff

# Destroy all resources (BE CAREFUL!)
npm run cdk:destroy

# View backend stack outputs
aws cloudformation describe-stacks \
  --stack-name team-backend-dev \
  --query 'Stacks[0].Outputs'

# View frontend stack outputs
aws cloudformation describe-stacks \
  --stack-name team-frontend-dev \
  --query 'Stacks[0].Outputs'
```

## Accessing the Application

After deployment, get the CloudFront URL:

```bash
aws cloudformation describe-stacks \
  --stack-name team-frontend-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
  --output text
```

Access the application at `https://<distribution-domain>`

## Monitoring and Logs

### CloudWatch Logs

- **AppSync Logs**: `/aws/appsync/apis/<api-id>`
- **Lambda Logs**: `/aws/lambda/<function-name>`
- **Step Functions Logs**: `/aws/stepfunction/team-step-function/<env>`

### X-Ray Tracing

AppSync and Step Functions have X-Ray tracing enabled. View traces in the AWS X-Ray console.

## Troubleshooting

### Issue: Frontend shows CORS errors

**Solution**: Regenerate configuration after deployment:
```bash
npm run generate-config
npm run build
npm run cdk:deploy
```

### Issue: Lambda functions can't find modules

**Solution**: Ensure Lambda function dependencies are in the function's directory:
```bash
cd amplify/backend/function/<function-name>/src
pip install -r requirements.txt -t .
```

### Issue: State machine execution fails

**Solution**: Check Lambda function IAM permissions and CloudWatch logs:
```bash
aws logs tail /aws/lambda/team-<function-name> --follow
```

### Issue: CDK deployment fails

**Solution**: Check the error message. Common issues:
- IAM permissions insufficient
- Resource limits exceeded
- Name conflicts (try different environment name)

## Cost Optimization

To minimize costs:

1. **Use Pay-Per-Request DynamoDB** (already configured)
2. **Set CloudFront cache TTLs appropriately**
3. **Use Lambda reserved concurrency** for predictable workloads
4. **Enable CloudTrail Lake selectively** (only for required events)
5. **Set DynamoDB TTL** for sessions table (already configured)

## Security Best Practices

1. **Enable MFA** for Cognito users
2. **Use WAF** with CloudFront for production
3. **Enable CloudTrail** for audit logging
4. **Rotate secrets** regularly
5. **Review IAM policies** for least privilege
6. **Enable encryption** at rest (already configured for DynamoDB, S3)

## Migration from Amplify

This deployment completely replaces Amplify infrastructure. To migrate:

1. **Export data** from existing DynamoDB tables
2. **Deploy new CDK stack** (creates new resources)
3. **Import data** to new DynamoDB tables
4. **Update DNS** to point to new CloudFront distribution
5. **Decommission Amplify** resources after verification

## Support

For issues or questions, please refer to:
- AWS CDK Documentation: https://docs.aws.amazon.com/cdk/
- AWS AppSync Documentation: https://docs.aws.amazon.com/appsync/
- IAM Identity Center Documentation: https://docs.aws.amazon.com/singlesignon/

## License

See LICENSE file for details.
