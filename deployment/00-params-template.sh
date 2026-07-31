#!/usr/bin/env bash

# Elevator Deployment Parameters
# Copy this file to 00-params.sh and set your values.
# Note: AWS credentials must be configured separately (via AWS_PROFILE, env vars, etc.)

# Environment name (e.g., dev, staging, prod)
export ELEVATOR_ENV=prod

# IAM Identity Center home region (required if different from deployment region)
export IDC_REGION=eu-west-1

# Elevator admin group name in IAM Identity Center (must match group in IDC)
export ELEVATOR_ADMIN_GROUP=Elevator-Admins

# Elevator auditor group name in IAM Identity Center (must match group in IDC)
export ELEVATOR_AUDITOR_GROUP=Elevator-Auditors

# IAM Identity Center group that can access the Elevator app (authentication only, authZ is in-app)
export ELEVATOR_IDC_ACCESS_GROUP=Developers

# Custom domain for Elevator (optional, e.g., elevator.example.com)
# If set, run ./02-create-domain-and-cert.sh before deploying to set up DNS and certificate
export ELEVATOR_CUSTOM_DOMAIN=

# Allow localhost redirect URLs in Cognito (for local development)
# Set to "true" for dev/test environments, "false" for production
export ELEVATOR_ALLOW_LOCALHOST=false

# =============================================================================
# Pipeline Settings (optional - only needed for ./bootstrap.sh)
# =============================================================================
# ELEVATOR_ENV above is the PROD environment the pipeline deploys to (after a
# manual approval). Bootstrap stores config in SSM; the pipeline reads it at run
# time, so you can change values later with ./config-put.sh without redeploying.

# GitHub repository owner (auto-detected from git remote if not set)
# export ELEVATOR_REPO_OWNER=

# GitHub repository name (auto-detected from git remote if not set)
# export ELEVATOR_REPO_NAME=

# Branch to deploy from (defaults to current branch or 'main')
# export ELEVATOR_BRANCH=main

# Optional non-prod environment. When set, the pipeline gains a non-prod deploy
# stage that runs BEFORE the prod approval. Leave unset to disable it entirely
# (the stage is not added to the pipeline at all). Populate its config with:
#   ./config-put.sh <name>
# export ELEVATOR_NONPROD_ENV=staging

# =============================================================================
# Derived values (do not modify)
# =============================================================================
export ELEVATOR_STACK="ElevatorStack-${ELEVATOR_ENV}"
