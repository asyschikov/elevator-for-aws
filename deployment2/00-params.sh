#!/usr/bin/env bash

# Elevator Deployment Parameters
# Set your values before running deployment scripts.

# --- Delegated Admin Setup (optional) ---
# Only needed if deploying Elevator to a member account (not the org management account).
# If deploying to management account, leave these empty.

# AWS profile for the Organization management account (optional, skip if deploying to org master account)
export ORG_MASTER_PROFILE=

# Elevator account ID (the member account where Elevator will be deployed)
export ELEVATOR_ACCOUNT=

# --- Elevator Deployment Settings ---

# AWS profile for the account where Elevator will be deployed (required)
export AWS_PROFILE=zr-security-admin

# AWS region for deployment
export AWS_REGION=us-east-1

# Environment name (e.g., test, prod)
export ELEVATOR_ENV=prod

# IAM Identity Center home region (if different from deployment region)
# Leave empty to use the deployment region (AWS_REGION)
export IDC_REGION=eu-west-1

# Elevator admin group name in IAM Identity Center (must match group in IDC)
export ELEVATOR_ADMIN_GROUP=TEAM-Admins

# Elevator auditor group name in IAM Identity Center (must match group in IDC)
export ELEVATOR_AUDITOR_GROUP=TEAM-Auditors

# Externally managed custom domain for Elevator (optional, e.g., elevator.example.com)
# If set, this domain is used for notification call-to-actions and added to Cognito redirect URLs
export ELEVATOR_EXTERNAL_DOMAIN=elevator.zenrows.com

# IAM Identity Center group that can access the Elevator app (authentication only, authZ is in-app)
export ELEVATOR_IDC_ACCESS_GROUP=Developers

# SAML Metadata URL from IAM Identity Center (set after running 02-get-saml-metadata.py)
export SAML_METADATA_URL=

# Derived values (do not modify)
export ELEVATOR_STACK="ElevatorStack-${ELEVATOR_ENV}"
