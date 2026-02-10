#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ElevatorStack } from '../lib/elevator-stack';
import { DomainStack } from '../lib/domain-stack';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

// Read configuration from environment variables
const envName = process.env.ELEVATOR_ENV;
const elevatorAdminGroup = process.env.ELEVATOR_ADMIN_GROUP;
const elevatorAuditorGroup = process.env.ELEVATOR_AUDITOR_GROUP;
const idcRegion = process.env.IDC_REGION;
const customDomain = process.env.ELEVATOR_CUSTOM_DOMAIN;
const idcAccessGroup = process.env.ELEVATOR_IDC_ACCESS_GROUP;
const allowLocalhost = process.env.ELEVATOR_ALLOW_LOCALHOST === 'true';

// Pipeline settings
const repoOwner = process.env.ELEVATOR_REPO_OWNER;
const repoName = process.env.ELEVATOR_REPO_NAME;
const branch = process.env.ELEVATOR_BRANCH || 'main';

if (!envName) {
  throw new Error('Missing required env var: ELEVATOR_ENV');
}

if (!process.env.CDK_DEFAULT_ACCOUNT) {
  throw new Error('Missing CDK_DEFAULT_ACCOUNT (configure AWS credentials)');
}

const commonTags = {
  Environment: envName,
  Application: 'Elevator',
};

// Domain Stack (us-east-1 - required for CloudFront certificates)
if (customDomain) {
  new DomainStack(app, `DomainStack-${envName}`, {
    stackName: `DomainStack-${envName}`,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: 'us-east-1',
    },
    envName,
    customDomain,
    tags: commonTags,
  });
}

// Main Elevator Stack - only create if all required params are present
const elevatorMissing = [
  !elevatorAdminGroup && 'ELEVATOR_ADMIN_GROUP',
  !elevatorAuditorGroup && 'ELEVATOR_AUDITOR_GROUP',
  !idcAccessGroup && 'ELEVATOR_IDC_ACCESS_GROUP',
  !process.env.CDK_DEFAULT_REGION && 'CDK_DEFAULT_REGION',
].filter(Boolean);

if (elevatorMissing.length === 0) {
  new ElevatorStack(app, `ElevatorStack-${envName}`, {
    stackName: `ElevatorStack-${envName}`,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION!,
    },
    envName,
    elevatorAdminGroup: elevatorAdminGroup!,
    elevatorAuditorGroup: elevatorAuditorGroup!,
    idcRegion,
    customDomain,
    idcAccessGroup: idcAccessGroup!,
    allowLocalhost,
    tags: commonTags,
  });
}

// Pipeline Stack - created when repo settings are provided
if (repoOwner && repoName && elevatorMissing.length === 0) {
  new PipelineStack(app, `ElevatorPipeline-${envName}`, {
    stackName: `ElevatorPipeline-${envName}`,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION!,
    },
    envName,
    repoOwner,
    repoName,
    branch,
    elevatorAdminGroup: elevatorAdminGroup!,
    elevatorAuditorGroup: elevatorAuditorGroup!,
    idcAccessGroup: idcAccessGroup!,
    idcRegion,
    customDomain,
    allowLocalhost,
    tags: commonTags,
  });
}
