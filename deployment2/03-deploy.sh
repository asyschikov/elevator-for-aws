#!/usr/bin/env bash
# Deploy Elevator application using CDK.
# Run this script using credentials for the Elevator account.

set -e
source "$(dirname "$0")/00-params.sh"

if [ -z "$ELEVATOR_ENV" ]; then
    echo "Error: ELEVATOR_ENV is required in 00-params.sh"
    exit 1
fi

if [ -z "$AWS_PROFILE" ]; then
    echo "Error: AWS_PROFILE is required in 00-params.sh"
    exit 1
fi

# Check if we are logged in
aws sts get-caller-identity

SCRIPT_DIR="$(realpath "$(dirname "$0")")"
CDK_DIR="$(realpath "$SCRIPT_DIR/../cdk")"
PROJECT_DIR="$(realpath "$SCRIPT_DIR/..")"

CDK_CONTEXT="-c envName=$ELEVATOR_ENV -c elevatorAdminGroup=$ELEVATOR_ADMIN_GROUP -c elevatorAuditorGroup=$ELEVATOR_AUDITOR_GROUP"
if [ -n "$IDC_REGION" ]; then
    CDK_CONTEXT="$CDK_CONTEXT -c idcRegion=$IDC_REGION"
fi
if [ -n "$ELEVATOR_EXTERNAL_DOMAIN" ]; then
    CDK_CONTEXT="$CDK_CONTEXT -c externalDomain=$ELEVATOR_EXTERNAL_DOMAIN"
fi
if [ -n "$SAML_METADATA_URL" ]; then
    CDK_CONTEXT="$CDK_CONTEXT -c samlMetadataUrl=$SAML_METADATA_URL"
fi

echo "=== Deploying Elevator Application (env: $ELEVATOR_ENV) ==="
echo ""

# Deploy infrastructure
echo "Deploying infrastructure..."
cd "$CDK_DIR"
npx cdk deploy "$ELEVATOR_STACK" $CDK_CONTEXT --require-approval never

# Build and deploy frontend
"$SCRIPT_DIR/deploy-frontend.sh"

echo ""
echo "=== Deployment Complete! ==="
echo ""
if [ -z "$SAML_METADATA_URL" ]; then
    echo "WARNING: SAML_METADATA_URL not set. Cognito SAML provider was not created."
    echo ""
    echo "To enable SAML federation, run the deployment steps in order:"
    echo "  1. python3 02-get-saml-metadata.py  (create IDC app)"
    echo "  2. Add SAML_METADATA_URL to 00-params.sh"
    echo "  3. ./03-deploy.sh  (re-deploy with SAML)"
    echo "  4. python3 04-configure-idc-app.py  (configure IDC app)"
else
    echo "SAML provider configured: $SAML_METADATA_URL"
    echo ""
    echo "Next step:"
    echo "  python3 04-configure-idc-app.py"
fi
