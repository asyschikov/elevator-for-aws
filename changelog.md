# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-22

First public release of Elevator.

Elevator started as a fork of the AWS
[Temporary Elevated Access Management (TEAM)](https://github.com/aws-samples/iam-identity-center-team)
sample and has since been substantially rewritten. Highlights of the rebuild:

### Added

- Single-stack AWS CDK deployment (`cdk/lib/elevator-stack.ts`) with a
  one-step deploy flow under `deployment/`.
- Python (Lambda) backend behind an API Gateway HTTP API, with typed
  request/response models generated into an OpenAPI 3.0 spec and TypeScript
  client types.
- Cognito user pool with SAML federation to IAM Identity Center, auto-created
  IAM Identity Center SAML application, and optional custom domain support.
- React frontend built with Vite and Cloudscape components.

### Changed

- Replaced the original AWS Amplify + AppSync GraphQL architecture with API
  Gateway + a REST/OpenAPI backend.
- Rebranded the application from TEAM to Elevator.

### Removed

- AWS Amplify tooling, GraphQL schema, and the legacy two-stack CDK layout.
