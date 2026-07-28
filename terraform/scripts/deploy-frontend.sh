#!/usr/bin/env bash
# Build and deploy the Elevator frontend using Terraform outputs.
# Run after `terraform apply` (from anywhere).
#
#   ./scripts/deploy-frontend.sh

set -euo pipefail
TF_DIR="$(realpath "$(dirname "$0")/..")"
REPO_DIR="$(realpath "$TF_DIR/..")"

echo "Writing src/config.json from Terraform outputs ..."
terraform -chdir="$TF_DIR" output -json frontend_config > "$REPO_DIR/src/config.json"

echo "Building frontend ..."
( cd "$REPO_DIR" && npm ci && npm run build )

BUCKET="$(terraform -chdir="$TF_DIR" output -raw website_bucket_name)"
DIST="$(terraform -chdir="$TF_DIR" output -raw distribution_id)"

echo "Uploading to s3://$BUCKET and invalidating CloudFront ..."
aws s3 sync "$REPO_DIR/build" "s3://$BUCKET" --delete
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null

echo "Done. URL: $(terraform -chdir="$TF_DIR" output -raw website_url)"
