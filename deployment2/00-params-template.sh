#!/usr/bin/env bash

# Elevator Deployment Parameters
# Copy this file to 00-params.sh and set your values.
# Note: AWS credentials must be configured separately (via AWS_PROFILE, env vars, etc.)

\
# IAM Identity Center home region (required if different from deployment region)
export IDC_REGION=eu-west-1

# Elevator admin group name in IAM Identity Center (must match group in IDC)
export ELEVATOR_ADMIN_GROUP=Elevator-Admins

# Elevator auditor group name in IAM Identity Center (must match group in IDC)
export ELEVATOR_AUDITOR_GROUP=Elevator-Auditors

# IAM Identity Center group that can access the Elevator app (authentication only, authZ is in-app)
export ELEVATOR_IDC_ACCESS_GROUP=Developers

# Custom domain for Elevator (optional, e.g., elevator.example.com)
# If set, run ./create-domain-and-cert.sh before deploying to set up DNS and certificate
export ELEVATOR_CUSTOM_DOMAIN=

# Use variables below if you want to develop/modify Elevator
# Environment name (e.g., dev, staging, prod)
export ELEVATOR_ENV=prod

# Allow localhost redirect URLs in Cognito (for local development)
# Set to "true" for dev/test environments, "false" for production
export ELEVATOR_ALLOW_LOCALHOST=false

# Derived values (do not modify)
export ELEVATOR_STACK="ElevatorStack-${ELEVATOR_ENV}"
