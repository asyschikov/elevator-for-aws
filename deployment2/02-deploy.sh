#!/usr/bin/env bash
# Deploy Elevator application using CDK.
# This is a single-step deployment that creates everything including the IDC SAML app.

set -e
source "$(dirname "$0")/00-params.sh"

if [ -z "$ELEVATOR_ENV" ]; then
    echo "Error: ELEVATOR_ENV is required in 00-params.sh"
    exit 1
fi

# Check if we are logged in
aws sts get-caller-identity

SCRIPT_DIR="$(realpath "$(dirname "$0")")"
CDK_DIR="$(realpath "$SCRIPT_DIR/../cdk")"

CDK_CONTEXT="-c envName=$ELEVATOR_ENV -c elevatorAdminGroup=$ELEVATOR_ADMIN_GROUP -c elevatorAuditorGroup=$ELEVATOR_AUDITOR_GROUP -c idcAccessGroup=$ELEVATOR_IDC_ACCESS_GROUP"
if [ -n "$IDC_REGION" ]; then
    CDK_CONTEXT="$CDK_CONTEXT -c idcRegion=$IDC_REGION"
fi
if [ -n "$ELEVATOR_CUSTOM_DOMAIN" ]; then
    CDK_CONTEXT="$CDK_CONTEXT -c customDomain=$ELEVATOR_CUSTOM_DOMAIN"
fi
if [ "$ELEVATOR_ALLOW_LOCALHOST" = "true" ]; then
    CDK_CONTEXT="$CDK_CONTEXT -c allowLocalhost=true"
fi

echo "=== Deploying Elevator Application (env: $ELEVATOR_ENV) ==="
echo ""

# Deploy infrastructure (includes IDC SAML app via Custom Resource)
echo "Deploying infrastructure..."
cd "$CDK_DIR"
npx cdk deploy "$ELEVATOR_STACK" $CDK_CONTEXT --method=direct --require-approval never

# Build and deploy frontend
"$SCRIPT_DIR/deploy-frontend.sh"

echo ""
echo "=== Deployment Complete! ==="
echo ""
echo "Elevator is ready. The IDC SAML application was created automatically."
