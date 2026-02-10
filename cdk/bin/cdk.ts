#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ElevatorStack } from '../lib/elevator-stack';
import { DomainStack } from '../lib/domain-stack';

const app = new cdk.App();

const envName = app.node.tryGetContext('envName');
const elevatorAdminGroup = app.node.tryGetContext('elevatorAdminGroup');
const elevatorAuditorGroup = app.node.tryGetContext('elevatorAuditorGroup');
const idcRegion = app.node.tryGetContext('idcRegion');
const customDomain = app.node.tryGetContext('customDomain');
const idcAccessGroup = app.node.tryGetContext('idcAccessGroup');

if (!envName) {
  throw new Error('Missing required context: envName');
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
  !elevatorAdminGroup && 'elevatorAdminGroup',
  !elevatorAuditorGroup && 'elevatorAuditorGroup',
  !idcAccessGroup && 'idcAccessGroup',
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
    elevatorAdminGroup,
    elevatorAuditorGroup,
    idcRegion,
    customDomain,
    idcAccessGroup,
    tags: commonTags,
  });
}
