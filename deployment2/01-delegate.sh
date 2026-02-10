#!/usr/bin/env bash
# Initialize delegated admin permissions for Elevator deployment.
# Only needed when deploying Elevator to a member account (not the org management account).
#
# Usage: ./01-init.sh <elevator-account-id>
#
# Prerequisites:
# - AWS credentials configured for the Organization management account
# - The elevator account must be a member of the organization

set -e

ELEVATOR_ACCOUNT=$1

if [ -z "$ELEVATOR_ACCOUNT" ]; then
    echo "Usage: ./01-init.sh <elevator-account-id>"
    echo ""
    echo "This script configures delegated admin permissions for the Elevator account."
    echo "Run this from the Organization management account."
    exit 1
fi

# Get current account ID
CURRENT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

if [ -z "$CURRENT_ACCOUNT" ]; then
    echo "Error: Failed to get current account ID. Check your AWS credentials."
    exit 1
fi

echo "Current account: $CURRENT_ACCOUNT"
echo "Elevator account: $ELEVATOR_ACCOUNT"

# Ensure we're not running from the elevator account itself
if [ "$CURRENT_ACCOUNT" == "$ELEVATOR_ACCOUNT" ]; then
    echo ""
    echo "Error: You are currently authenticated to the Elevator account ($ELEVATOR_ACCOUNT)."
    echo "This script must be run from the Organization management account."
    exit 1
fi

echo ""
echo "=== Initializing Elevator Delegated Admin Permissions ==="
echo ""

# Check if already configured (don't fail if already set up)
set +e

# Enable trusted access and delegated admin for Account Management
echo "Configuring Account Management..."
aws organizations enable-aws-service-access \
    --service-principal account.amazonaws.com 2>/dev/null

existing=$(aws organizations list-delegated-administrators \
    --service-principal account.amazonaws.com \
    --query "DelegatedAdministrators[?Id=='$ELEVATOR_ACCOUNT'].Id" \
    --output text 2>/dev/null)

if [ -z "$existing" ]; then
    aws organizations register-delegated-administrator \
        --account-id $ELEVATOR_ACCOUNT \
        --service-principal account.amazonaws.com
    echo "  ✓ $ELEVATOR_ACCOUNT configured as delegated admin for AWS Account Management"
else
    echo "  ✓ $ELEVATOR_ACCOUNT already configured as delegated admin for AWS Account Management"
fi

# Enable trusted access and delegated admin for CloudTrail
echo "Configuring CloudTrail..."
aws organizations enable-aws-service-access \
    --service-principal cloudtrail.amazonaws.com 2>/dev/null

aws iam create-service-linked-role \
    --aws-service-name cloudtrail.amazonaws.com 2>/dev/null

existing=$(aws organizations list-delegated-administrators \
    --service-principal cloudtrail.amazonaws.com \
    --query "DelegatedAdministrators[?Id=='$ELEVATOR_ACCOUNT'].Id" \
    --output text 2>/dev/null)

if [ -z "$existing" ]; then
    aws organizations register-delegated-administrator \
        --account-id $ELEVATOR_ACCOUNT \
        --service-principal cloudtrail.amazonaws.com
    echo "  ✓ $ELEVATOR_ACCOUNT configured as delegated admin for CloudTrail"
else
    echo "  ✓ $ELEVATOR_ACCOUNT already configured as delegated admin for CloudTrail"
fi

# Enable trusted access and delegated admin for IAM Identity Center
echo "Configuring IAM Identity Center..."
aws organizations enable-aws-service-access \
    --service-principal sso.amazonaws.com 2>/dev/null

existing=$(aws organizations list-delegated-administrators \
    --service-principal sso.amazonaws.com \
    --query "DelegatedAdministrators[?Id=='$ELEVATOR_ACCOUNT'].Id" \
    --output text 2>/dev/null)

if [ -z "$existing" ]; then
    aws organizations register-delegated-administrator \
        --account-id $ELEVATOR_ACCOUNT \
        --service-principal sso.amazonaws.com
    echo "  ✓ $ELEVATOR_ACCOUNT configured as delegated admin for IAM Identity Center"
else
    echo "  ✓ $ELEVATOR_ACCOUNT already configured as delegated admin for IAM Identity Center"
fi

echo ""
echo "=== Initialization complete! ==="
echo ""
echo "You can now deploy Elevator to account $ELEVATOR_ACCOUNT."
