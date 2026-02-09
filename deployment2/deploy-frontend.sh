#!/usr/bin/env bash
# Build and deploy frontend assets.
# Run this after infrastructure is already deployed (02-deploy.sh).

set -e
source "$(dirname "$0")/00-params.sh"

SCRIPT_DIR="$(realpath "$(dirname "$0")")"
PROJECT_DIR="$(realpath "$SCRIPT_DIR/..")"

# Generate frontend config from stack outputs
echo "Generating frontend config..."
cd "$SCRIPT_DIR"
python3 generate-config.py

# Build frontend
echo ""
echo "Building Frontend..."
cd "$PROJECT_DIR"
npm run build

# Deploy frontend assets to S3 and invalidate CloudFront cache
echo ""
echo "Deploying frontend assets..."
WEBSITE_BUCKET=$(aws cloudformation describe-stacks --stack-name "$ELEVATOR_STACK" --query 'Stacks[0].Outputs[?OutputKey==`WebsiteBucketName`].OutputValue' --output text)
DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name "$ELEVATOR_STACK" --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' --output text)

aws s3 sync "$PROJECT_DIR/build" "s3://$WEBSITE_BUCKET" --delete

INVALIDATION_ID=$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" --query 'Invalidation.Id' --output text)
echo "Waiting for CloudFront invalidation $INVALIDATION_ID..."
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION_ID" --id "$INVALIDATION_ID"

echo ""
echo "=== Frontend deployed! ==="
