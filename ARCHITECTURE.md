# TEAM - Architecture Overview

## Two-Stack Architecture

The application is split into **two separate CDK stacks** for better separation of concerns:

### 1. Backend Stack (`team-backend-{env}`)

Contains all backend infrastructure and business logic:

- **Authentication**
  - Cognito User Pool (with Admin and Auditors groups)
  - Cognito Identity Pool
  - Pre-token generation Lambda trigger

- **API Layer**
  - AppSync GraphQL API
  - DynamoDB data sources (5 tables)
  - Lambda resolvers (19 functions)

- **Data Storage**
  - `requests` table (with GSIs for email/status and approver/status)
  - `sessions` table (with TTL)
  - `Approvers` table
  - `Settings` table
  - `Eligibility` table

- **Workflow Orchestration**
  - Grant State Machine (creates SSO account assignments)
  - Revoke State Machine (deletes SSO account assignments)
  - Schedule State Machine (schedules future grants)
  - Reject State Machine (handles rejections/cancellations)
  - Approval State Machine (manages approval workflows)

- **Supporting Services**
  - CloudTrail Lake event data store
  - SNS topic for notifications
  - S3 bucket for CloudTrail query results
  - KMS keys for encryption
  - CloudWatch Log Groups

### 2. Frontend Stack (`team-frontend-{env}`)

Contains all frontend hosting infrastructure:

- **Content Delivery**
  - S3 bucket for static assets
  - CloudFront distribution with OAI
  - Custom cache policies for different asset types
  - CloudFront access logs bucket

- **Cache Strategy**
  - Static assets (JS, CSS, images): 1 year cache
  - index.html and manifests: no cache
  - Path-based cache behaviors for optimization

- **Deployment**
  - BucketDeployment construct for automated uploads
  - Separate deployments for cached vs non-cached files
  - CloudFront invalidation on updates

## Benefits of Two-Stack Architecture

### 1. **Independent Deployment**
- Deploy backend changes without redeploying CloudFront
- Update frontend without touching backend resources
- Faster deployments (only affected stack updates)

### 2. **Cost Optimization**
- Frontend stack rarely changes (infrastructure is stable)
- Backend stack can be updated frequently
- Reduced CloudFormation update time and costs

### 3. **Security Isolation**
- Different IAM permissions for frontend vs backend
- Frontend can be managed by different team
- Reduced blast radius for changes

### 4. **Environment Flexibility**
- Can deploy backend to multiple environments
- Share frontend across environments (if needed)
- Different retention policies per stack

### 5. **Disaster Recovery**
- Independent backup/restore strategies
- Can rebuild frontend quickly from source
- Backend state preserved separately

## Resource Dependencies

```
┌─────────────────────────────────────────────┐
│          Frontend Stack                     │
│  ┌─────────────────────────────────────┐   │
│  │  CloudFront Distribution            │   │
│  │  ┌──────────────────────────────┐   │   │
│  │  │  S3 Bucket (Static Assets)   │   │   │
│  │  └──────────────────────────────┘   │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
                    │
                    │ (Client-side calls)
                    ▼
┌─────────────────────────────────────────────┐
│          Backend Stack                      │
│  ┌─────────────────────────────────────┐   │
│  │  Cognito User Pool                  │   │
│  │  ┌──────────────────────────────┐   │   │
│  │  │  AppSync GraphQL API         │   │   │
│  │  │  ┌──────────────────────┐    │   │   │
│  │  │  │  Lambda Functions    │    │   │   │
│  │  │  └──────────────────────┘    │   │   │
│  │  │  ┌──────────────────────┐    │   │   │
│  │  │  │  DynamoDB Tables     │    │   │   │
│  │  │  └──────────────────────┘    │   │   │
│  │  └──────────────────────────────┘   │   │
│  │  ┌──────────────────────────────┐   │   │
│  │  │  Step Functions              │   │   │
│  │  │  ┌──────────────────────┐    │   │   │
│  │  │  │  IAM Identity Center │    │   │   │
│  │  │  │  (SSO)               │    │   │   │
│  │  │  └──────────────────────┘    │   │   │
│  │  └──────────────────────────────┘   │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Stack Outputs

### Backend Stack Exports
- `UserPoolId` - Cognito User Pool ID
- `UserPoolClientId` - Cognito User Pool Client ID
- `IdentityPoolId` - Cognito Identity Pool ID
- `GraphQLApiUrl` - AppSync GraphQL endpoint
- `GraphQLApiId` - AppSync API ID
- `Region` - AWS Region

### Frontend Stack Exports
- `WebsiteBucketName` - S3 bucket name
- `DistributionDomainName` - CloudFront domain
- `DistributionId` - CloudFront distribution ID
- `WebsiteURL` - Full HTTPS URL

## Deployment Order

Both stacks are **independent** and can be deployed in any order:

```bash
# Deploy both stacks
cdk deploy --all

# Or deploy individually
cdk deploy TeamBackendStack-dev
cdk deploy TeamFrontendStack-dev
```

The frontend stack will work even if backend is not deployed yet (though the app won't function without backend APIs).

## Cross-Stack Communication

The stacks communicate via:
1. **CloudFormation Exports** - Backend exports API URLs
2. **aws-exports.js** - Frontend config file generated from stack outputs
3. **Runtime API calls** - Browser makes GraphQL calls to AppSync

No direct CDK dependencies between stacks (though you can add if needed).

## Scaling Considerations

### Backend Stack
- **Lambda**: Auto-scales per function
- **DynamoDB**: On-demand billing (auto-scales)
- **AppSync**: Managed service (auto-scales)
- **Step Functions**: No scaling needed

### Frontend Stack
- **S3**: Unlimited capacity
- **CloudFront**: Global edge locations (auto-scales)
- **No compute** in frontend stack

## Monitoring

### Backend Monitoring
- CloudWatch Logs for Lambda, AppSync, Step Functions
- X-Ray tracing enabled for AppSync and Step Functions
- DynamoDB metrics (consumed capacity, throttles)
- Step Function execution metrics

### Frontend Monitoring
- CloudFront access logs
- CloudFront metrics (requests, bandwidth, errors)
- S3 bucket metrics (optional)

## Cost Breakdown

### Backend Stack (Primary Costs)
- **Lambda** - Execution time and requests
- **AppSync** - Query/mutation requests
- **DynamoDB** - Read/write capacity (on-demand)
- **Step Functions** - State transitions
- **CloudTrail Lake** - Data ingestion and storage

### Frontend Stack (Lower Costs)
- **CloudFront** - Data transfer and requests
- **S3** - Storage (minimal for static assets)
- **S3** - CloudFront log storage

## Security

### Backend Stack
- Cognito authentication required
- AppSync authorization (Cognito + IAM)
- IAM roles with least privilege
- DynamoDB encryption at rest
- Step Functions logs encrypted with KMS
- Lambda environment variables encrypted

### Frontend Stack
- S3 bucket - private (no public access)
- CloudFront OAI for S3 access
- HTTPS only (redirect HTTP to HTTPS)
- CloudFront security headers (can be added)
- Access logs for audit trail

## Updating the Architecture

### Adding Resources to Backend
Edit `cdk/lib/team-stack.ts` and deploy:
```bash
npm run cdk:deploy:backend
```

### Updating Frontend Infrastructure
Edit `cdk/lib/frontend-stack.ts` and deploy:
```bash
npm run cdk:deploy:frontend
```

### Updating Frontend Code
Build and deploy automatically deploys to S3:
```bash
npm run build
npm run cdk:deploy:frontend
```

## Disaster Recovery

### Backend
- DynamoDB: Point-in-time recovery enabled
- Lambda: Code stored in CloudFormation
- Step Functions: Definitions in source control
- Cognito: User pool can be imported

### Frontend
- S3: Versioning can be enabled
- CloudFront: Can recreate from source
- Build artifacts: Reproducible from source

## Best Practices

1. **Separate stacks** by update frequency and team ownership
2. **Export values** that other stacks might need
3. **Use consistent naming** with environment suffix
4. **Tag all resources** for cost tracking
5. **Enable logging** for security and debugging
6. **Set retention policies** for cost management
7. **Use BucketDeployment** for automated frontend uploads
8. **Implement cache strategies** for performance
9. **Monitor both stacks** independently
10. **Test deployments** in dev before prod
