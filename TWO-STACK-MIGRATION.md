# Two-Stack Architecture Summary

## What Changed

Your TEAM application infrastructure has been split into **two independent CDK stacks** instead of one monolithic stack.

## The Two Stacks

### 1. Backend Stack (`team-backend-{env}`)
**Purpose**: All application logic and APIs

**Contains**:
- Cognito User Pool & Identity Pool
- AppSync GraphQL API
- 19 Lambda Functions
- 5 DynamoDB Tables
- 5 Step Functions State Machines
- CloudTrail Lake Event Data Store
- SNS Topic
- Supporting IAM roles and policies

**Stack Name**: `team-backend-dev` (or `team-backend-prod`, etc.)

### 2. Frontend Stack (`team-frontend-{env}`)
**Purpose**: Static asset hosting and CDN

**Contains**:
- S3 Bucket (private, for static assets)
- CloudFront Distribution (with OAI)
- CloudFront Log Bucket
- Cache Policies (optimized for different asset types)
- BucketDeployment (auto-uploads `build/` directory)

**Stack Name**: `team-frontend-dev` (or `team-frontend-prod`, etc.)

## Why Two Stacks?

### Benefits

1. **Independent Deployments**
   - Update backend APIs without touching CloudFront
   - Update frontend infrastructure without redeploying Lambda
   - Faster deployments (only changed stack updates)

2. **Clear Separation of Concerns**
   - Backend = APIs, Auth, Data, Logic
   - Frontend = Static Hosting, CDN
   - Easier to understand and maintain

3. **Cost Optimization**
   - Frontend stack rarely changes (stable infrastructure)
   - Backend stack can be updated frequently
   - Avoid unnecessary CloudFormation updates

4. **Security Isolation**
   - Different IAM permissions per stack
   - Reduced blast radius for changes
   - Can be managed by different teams

5. **Flexible Environment Strategy**
   - Deploy backend to multiple environments
   - Share frontend across environments (if desired)
   - Different retention/backup policies per stack

## How to Deploy

### Both Stacks at Once
```bash
npm run deploy
# or
cd cdk && cdk deploy --all
```

### Backend Only
```bash
npm run cdk:deploy:backend
# or
cd cdk && cdk deploy TeamBackendStack-dev
```

### Frontend Only
```bash
npm run cdk:deploy:frontend
# or
cd cdk && cdk deploy TeamFrontendStack-dev
```

### Different Environments
```bash
cd cdk
cdk deploy --all --context environment=prod
```

## Stack Outputs

### Backend Stack Provides
- `UserPoolId` - For creating users
- `UserPoolClientId` - For authentication
- `IdentityPoolId` - For AWS credentials
- `GraphQLApiUrl` - For API calls
- `GraphQLApiId` - For monitoring
- `Region` - AWS Region

### Frontend Stack Provides
- `WebsiteBucketName` - S3 bucket name
- `DistributionDomainName` - CloudFront domain
- `DistributionId` - For invalidations
- `WebsiteURL` - Full HTTPS URL

## Configuration Flow

```
1. Deploy Backend Stack
   └─> Creates Cognito, AppSync, Lambda, etc.

2. Deploy Frontend Stack
   └─> Creates S3, CloudFront
   └─> Uploads build/ directory

3. Generate Config Script
   ├─> Fetches Backend stack outputs (API URLs, Cognito IDs)
   ├─> Fetches Frontend stack outputs (CloudFront URL)
   └─> Generates src/aws-exports.js

4. Rebuild Frontend
   └─> Uses new aws-exports.js

5. Redeploy Frontend
   └─> BucketDeployment uploads new build
   └─> CloudFront invalidation triggered automatically
```

## Common Operations

### Update Backend Code
```bash
# Edit Lambda functions or infrastructure
# in amplify/backend/function/ or cdk/lib/team-stack.ts

npm run cdk:deploy:backend
```

### Update Frontend Code
```bash
# Edit React components in src/

npm run build
npm run cdk:deploy:frontend
```

### Update Both
```bash
npm run deploy
```

### Destroy Everything
```bash
npm run cdk:destroy
# This destroys both stacks
```

## File Organization

```
cdk/
├── bin/
│   └── cdk.ts                    # Creates both stacks
├── lib/
│   ├── team-stack.ts             # Backend stack definition
│   └── frontend-stack.ts         # Frontend stack definition
├── state-machines/               # Step Functions definitions
└── scripts/
    ├── generate-config.js        # Fetches outputs from both stacks
    └── deploy-frontend.sh        # Helper script
```

## Dependencies Between Stacks

**Independence**: The two stacks are **completely independent** at the infrastructure level.

- No CDK dependencies between stacks
- No CloudFormation exports/imports
- Frontend doesn't reference backend resources in CDK

**Runtime Connection**: The stacks connect at runtime:
- Browser loads frontend from CloudFront
- Browser calls AppSync API (URL from aws-exports.js)
- Cognito authenticates users
- AppSync authorizes requests

## Migration from Single Stack

If you had a previous single-stack deployment:

### Old Stack Name
```
team-stack-dev
```

### New Stack Names
```
team-backend-dev   (replaces most of old stack)
team-frontend-dev  (new, for hosting only)
```

### Migration Path
1. Deploy new two-stack architecture
2. Export data from old DynamoDB tables
3. Import data to new tables
4. Update DNS if using custom domain
5. Destroy old single stack

## Monitoring

### Backend Stack
```bash
# View backend logs
aws logs tail /aws/lambda/team-router --follow
aws logs tail /aws/appsync/apis/<api-id> --follow
```

### Frontend Stack
```bash
# View CloudFront logs (stored in S3)
aws s3 ls s3://team-cloudfront-logs-dev-<account>/cloudfront-logs/

# CloudFront metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name Requests \
  --dimensions Name=DistributionId,Value=<dist-id> \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

## Cost Implications

### Backend Stack
- Most of the costs (Lambda, AppSync, DynamoDB, Step Functions)
- Charged per execution/request
- Can optimize by adjusting Lambda memory, DynamoDB capacity

### Frontend Stack
- Lower costs (S3 storage, CloudFront data transfer)
- Mostly fixed/predictable
- Can optimize with CloudFront caching

## Best Practices

1. ✅ **Deploy backend first** in new environments
2. ✅ **Run generate-config** after backend deployment
3. ✅ **Build frontend** before deploying frontend stack
4. ✅ **Use environment context** for multi-env deployments
5. ✅ **Monitor both stacks** independently
6. ✅ **Tag resources** for cost tracking
7. ✅ **Test in dev** before deploying to prod
8. ✅ **Keep stacks independent** (don't add cross-stack refs)

## Troubleshooting

### Q: Frontend deploys but shows 403 error
**A**: Check CloudFront OAI has S3 bucket read permission. Redeploy frontend stack.

### Q: Backend API calls fail with CORS
**A**: Check AppSync settings. Regenerate aws-exports.js. Rebuild and redeploy frontend.

### Q: Stack names conflict
**A**: Use different environment names: `--context environment=dev2`

### Q: Can't find stack outputs
**A**: Ensure both stacks are deployed. Check stack names match environment.

### Q: BucketDeployment fails
**A**: Ensure `build/` directory exists. Run `npm run build` first.

## Additional Resources

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Full deployment guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Detailed architecture
- [QUICKSTART.md](./QUICKSTART.md) - Quick start guide
