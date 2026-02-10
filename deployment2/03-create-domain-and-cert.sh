#!/usr/bin/env bash
# Create DNS hosted zone and ACM certificate for custom domain.
# Run this before deploying the main Elevator stack if using a custom domain.

set -e
source "$(dirname "$0")/00-params.sh"

if [ -z "$ELEVATOR_ENV" ]; then
    echo "Error: ELEVATOR_ENV is required in 00-params.sh"
    exit 1
fi

if [ -z "$ELEVATOR_CUSTOM_DOMAIN" ]; then
    echo "Error: ELEVATOR_CUSTOM_DOMAIN is required in 00-params.sh for custom domain setup"
    exit 1
fi

# Check if we are logged in
aws sts get-caller-identity

SCRIPT_DIR="$(realpath "$(dirname "$0")")"
CDK_DIR="$(realpath "$SCRIPT_DIR/../cdk")"
STACK_NAME="DomainStack-$ELEVATOR_ENV"

echo "=== Setting up Custom Domain: $ELEVATOR_CUSTOM_DOMAIN ==="
echo ""

# Start CDK deployment in background
echo "Starting deployment (this will pause waiting for DNS validation)..."
cd "$CDK_DIR"
npx cdk deploy "$STACK_NAME" --require-approval never &
CDK_PID=$!

# Function to cleanup on exit
cleanup() {
    if kill -0 $CDK_PID 2>/dev/null; then
        echo ""
        echo "Stopping deployment process..."
        kill $CDK_PID 2>/dev/null || true
    fi
}
trap cleanup EXIT

# Poll for hosted zone creation
echo ""
echo "Waiting for hosted zone to be created..."
HOSTED_ZONE_ID=""
while [ -z "$HOSTED_ZONE_ID" ]; do
    sleep 5

    # Check if CDK process is still running
    if ! kill -0 $CDK_PID 2>/dev/null; then
        echo ""
        echo "Error: CDK deployment failed before hosted zone was created."
        wait $CDK_PID
        exit 1
    fi

    # Try to get the hosted zone ID
    HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name \
        --dns-name "$ELEVATOR_CUSTOM_DOMAIN" \
        --query "HostedZones[?Name=='${ELEVATOR_CUSTOM_DOMAIN}.'].Id" \
        --output text 2>/dev/null | sed 's|/hostedzone/||' || true)

    if [ -n "$HOSTED_ZONE_ID" ]; then
        echo "Hosted zone created: $HOSTED_ZONE_ID"
    else
        echo -n "."
    fi
done

# Get NS records
echo ""
echo "Fetching NS records..."
NS_RECORDS=$(aws route53 get-hosted-zone \
    --id "$HOSTED_ZONE_ID" \
    --query "DelegationSet.NameServers" \
    --output text | tr '\t' '\n')

echo ""
echo "============================================================"
echo "ACTION REQUIRED: DNS Delegation"
echo "============================================================"
echo ""
echo "The hosted zone has been created. Configure DNS delegation"
echo "at your domain registrar for '$ELEVATOR_CUSTOM_DOMAIN'."
echo ""
echo "Set the following NS records:"
echo ""
echo "$NS_RECORDS"
echo ""
echo "============================================================"
echo ""
echo "The deployment is waiting for DNS to propagate."
echo "Once you configure the NS records, certificate validation"
echo "will complete automatically."
echo ""

# Wait for user confirmation
while true; do
    read -p "Have you configured the NS records? (yes/no): " response
    case "$response" in
        [Yy][Ee][Ss]|[Yy])
            echo ""
            echo "Waiting for deployment to complete..."
            echo "(Certificate validation may take a few minutes after DNS propagates)"
            echo ""
            break
            ;;
        [Nn][Oo]|[Nn])
            echo "Please configure the NS records. The deployment will proceed"
            echo "automatically once DNS propagates."
            ;;
        *)
            echo "Please answer 'yes' or 'no'."
            ;;
    esac
done

# Clear the trap and wait for CDK to finish
trap - EXIT
wait $CDK_PID
CDK_EXIT_CODE=$?

if [ $CDK_EXIT_CODE -ne 0 ]; then
    echo ""
    echo "Error: CDK deployment failed with exit code $CDK_EXIT_CODE"
    exit $CDK_EXIT_CODE
fi

echo ""
echo "============================================================"
echo "Custom Domain Setup Complete!"
echo "============================================================"
echo ""
echo "Domain: $ELEVATOR_CUSTOM_DOMAIN"
echo ""
echo "You can now deploy the main Elevator stack:"
echo "  ./02-deploy.sh"
echo ""
echo "After deployment, create a CNAME or ALIAS record pointing"
echo "'$ELEVATOR_CUSTOM_DOMAIN' to the CloudFront distribution domain."
echo ""
