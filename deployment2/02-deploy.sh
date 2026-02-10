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

echo "=== Deploying Elevator Application (env: $ELEVATOR_ENV) ==="
echo ""

# Deploy infrastructure (includes IDC SAML app via Custom Resource)
echo "Deploying infrastructure..."
cd "$CDK_DIR"
npx cdk deploy "$ELEVATOR_STACK" --method=direct --require-approval never

# Build and deploy frontend
"$SCRIPT_DIR/deploy-frontend.sh"

echo ""
echo "=== Deployment Complete! ==="
echo ""
echo "Elevator is ready. The IDC SAML application was created automatically."
