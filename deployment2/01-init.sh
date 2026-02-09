#!/usr/bin/env bash
# Initialize delegated admin permissions for Elevator deployment.
# Only needed when deploying Elevator to a member account (not the org management account).
# Requires ORG_MASTER_PROFILE and ELEVATOR_ACCOUNT to be set in 00-params.sh.

set -e
source "$(dirname "$0")/00-params.sh"

if [ -z "$ORG_MASTER_PROFILE" ] || [ -z "$ELEVATOR_ACCOUNT" ]; then
    echo "Skipping: ORG_MASTER_PROFILE and ELEVATOR_ACCOUNT are not set."
    echo "This script is only needed when deploying Elevator to a member account."
    echo "If deploying to the org management account, you can skip this step."
    exit 0
fi

export AWS_PROFILE=$ORG_MASTER_PROFILE

echo "=== Initializing Elevator Delegated Admin Permissions ==="
echo "Using profile: $AWS_PROFILE"
echo "Elevator account: $ELEVATOR_ACCOUNT"
echo ""

# Check if already configured (don't fail if already set up)
set +e

# Enable trusted access and delegated admin for Account Management
echo "Configuring Account Management..."
aws organizations enable-aws-service-access \
    --service-principal account.amazonaws.com \
    --region $AWS_REGION 2>/dev/null

existing=$(aws organizations list-delegated-administrators \
    --service-principal account.amazonaws.com \
    --region $AWS_REGION \
    --query "DelegatedAdministrators[?Id=='$ELEVATOR_ACCOUNT'].Id" \
    --output text 2>/dev/null)

if [ -z "$existing" ]; then
    aws organizations register-delegated-administrator \
        --account-id $ELEVATOR_ACCOUNT \
        --service-principal account.amazonaws.com \
        --region $AWS_REGION
    echo "  ✓ $ELEVATOR_ACCOUNT configured as delegated admin for AWS Account Management"
else
    echo "  ✓ $ELEVATOR_ACCOUNT already configured as delegated admin for AWS Account Management"
fi

# Enable trusted access and delegated admin for CloudTrail
echo "Configuring CloudTrail..."
aws organizations enable-aws-service-access \
    --service-principal cloudtrail.amazonaws.com \
    --region $AWS_REGION 2>/dev/null

aws iam create-service-linked-role \
    --aws-service-name cloudtrail.amazonaws.com \
    --region $AWS_REGION 2>/dev/null

existing=$(aws organizations list-delegated-administrators \
    --service-principal cloudtrail.amazonaws.com \
    --region $AWS_REGION \
    --query "DelegatedAdministrators[?Id=='$ELEVATOR_ACCOUNT'].Id" \
    --output text 2>/dev/null)

if [ -z "$existing" ]; then
    aws organizations register-delegated-administrator \
        --account-id $ELEVATOR_ACCOUNT \
        --service-principal cloudtrail.amazonaws.com \
        --region $AWS_REGION
    echo "  ✓ $ELEVATOR_ACCOUNT configured as delegated admin for CloudTrail"
else
    echo "  ✓ $ELEVATOR_ACCOUNT already configured as delegated admin for CloudTrail"
fi

# Enable trusted access and delegated admin for IAM Identity Center
echo "Configuring IAM Identity Center..."
aws organizations enable-aws-service-access \
    --service-principal sso.amazonaws.com \
    --region $AWS_REGION 2>/dev/null

existing=$(aws organizations list-delegated-administrators \
    --service-principal sso.amazonaws.com \
    --region $AWS_REGION \
    --query "DelegatedAdministrators[?Id=='$ELEVATOR_ACCOUNT'].Id" \
    --output text 2>/dev/null)

if [ -z "$existing" ]; then
    aws organizations register-delegated-administrator \
        --account-id $ELEVATOR_ACCOUNT \
        --service-principal sso.amazonaws.com \
        --region $AWS_REGION
    echo "  ✓ $ELEVATOR_ACCOUNT configured as delegated admin for IAM Identity Center"
else
    echo "  ✓ $ELEVATOR_ACCOUNT already configured as delegated admin for IAM Identity Center"
fi

echo ""
echo "=== Initialization complete! ==="
