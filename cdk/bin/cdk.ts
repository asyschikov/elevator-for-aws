#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ElevatorStack } from '../lib/elevator-stack';

const app = new cdk.App();

const envName = app.node.tryGetContext('envName');
const elevatorAdminGroup = app.node.tryGetContext('elevatorAdminGroup');
const elevatorAuditorGroup = app.node.tryGetContext('elevatorAuditorGroup');
const idcRegion = app.node.tryGetContext('idcRegion');
const externalDomain = app.node.tryGetContext('externalDomain');
const samlMetadataUrl = app.node.tryGetContext('samlMetadataUrl');

const missing = [
  !envName && 'envName',
  !elevatorAdminGroup && 'elevatorAdminGroup',
  !elevatorAuditorGroup && 'elevatorAuditorGroup',
  !process.env.CDK_DEFAULT_ACCOUNT && 'CDK_DEFAULT_ACCOUNT (resolve via AWS_PROFILE)',
  !process.env.CDK_DEFAULT_REGION && 'CDK_DEFAULT_REGION (resolve via AWS_REGION)',
].filter(Boolean);

if (missing.length > 0) {
  throw new Error(`Missing required configuration: ${missing.join(', ')}`);
}

new ElevatorStack(app, `ElevatorStack-${envName}`, {
  stackName: `ElevatorStack-${envName}`,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT!,
    region: process.env.CDK_DEFAULT_REGION!,
  },
  envName,
  elevatorAdminGroup,
  elevatorAuditorGroup,
  idcRegion,
  externalDomain,
  samlMetadataUrl,
  tags: {
    Environment: envName,
    Application: 'Elevator',
  },
});
