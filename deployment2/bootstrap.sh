#!/usr/bin/env bash
# One-time bootstrap for the Elevator CI/CD pipeline.
#
# Run this once from your terminal. It persists everything the pipeline needs into
# AWS (SSM Parameter Store + a GitHub CodeConnections connection), then deploys the
# self-mutating, multi-stage CodePipeline that builds and deploys Elevator from
# GitHub. After this, the pipeline is the deployer — pushes to the configured branch
# trigger a run, and prod deploys require a manual approval.
#
# Safe to re-run: SSM puts are upserts, an existing connection is reused, and the
# pipeline stack is updated in place.
#
# Prerequisites:
#   - deployment2/00-params.sh filled in (copy from 00-params-template.sh)
#   - AWS credentials configured (AWS_PROFILE / env vars) for the target account
#   - For a custom domain: run ./02-create-domain-and-cert.sh once beforehand

set -euo pipefail
SCRIPT_DIR="$(realpath "$(dirname "$0")")"
CDK_DIR="$(realpath "$SCRIPT_DIR/../cdk")"

# shellcheck source=/dev/null
source "$SCRIPT_DIR/00-params.sh"
: "${ELEVATOR_ENV:?ELEVATOR_ENV is required in 00-params.sh}"

# --- Resolve repo owner/name/branch (from params, else the git remote) ---
if [ -z "${ELEVATOR_REPO_OWNER:-}" ] || [ -z "${ELEVATOR_REPO_NAME:-}" ]; then
  REMOTE_URL=$(git -C "$SCRIPT_DIR" remote get-url origin 2>/dev/null || echo "")
  if [[ "$REMOTE_URL" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    ELEVATOR_REPO_OWNER="${ELEVATOR_REPO_OWNER:-${BASH_REMATCH[1]}}"
    ELEVATOR_REPO_NAME="${ELEVATOR_REPO_NAME:-${BASH_REMATCH[2]}}"
  fi
fi
ELEVATOR_BRANCH="${ELEVATOR_BRANCH:-$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"
: "${ELEVATOR_REPO_OWNER:?Could not determine repo owner; set ELEVATOR_REPO_OWNER in 00-params.sh}"
: "${ELEVATOR_REPO_NAME:?Could not determine repo name; set ELEVATOR_REPO_NAME in 00-params.sh}"

# --- AWS identity / region ---
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region || true)}}"
: "${REGION:?Set a region via AWS_REGION, AWS_DEFAULT_REGION, or 'aws configure'}"
export CDK_DEFAULT_ACCOUNT="$ACCOUNT_ID"
export CDK_DEFAULT_REGION="$REGION"

echo "=== Elevator pipeline bootstrap ==="
echo "  Account:  $ACCOUNT_ID"
echo "  Region:   $REGION"
echo "  Repo:     $ELEVATOR_REPO_OWNER/$ELEVATOR_REPO_NAME @ $ELEVATOR_BRANCH"
echo "  Prod env: $ELEVATOR_ENV${ELEVATOR_NONPROD_ENV:+   Non-prod env: $ELEVATOR_NONPROD_ENV}"
echo ""

# --- CDK bootstrap (idempotent) ---
if ! aws cloudformation describe-stacks --stack-name CDKToolkit >/dev/null 2>&1; then
  echo "CDK is not bootstrapped in this account/region — bootstrapping ..."
  (cd "$CDK_DIR" && npm ci && npx cdk bootstrap "aws://$ACCOUNT_ID/$REGION")
fi

# --- Persist application config to SSM ---
"$SCRIPT_DIR/config-put.sh" "$ELEVATOR_ENV"
if [ -n "${ELEVATOR_NONPROD_ENV:-}" ]; then
  echo ""
  echo "NOTE: a non-prod stage is enabled (ELEVATOR_NONPROD_ENV=$ELEVATOR_NONPROD_ENV)."
  echo "      Populate its config with:  ./config-put.sh $ELEVATOR_NONPROD_ENV"
  echo "      (using a 00-params.sh tailored to that environment)."
fi

# The config now lives in SSM. Unset the app-config vars so that the upcoming
# `cdk deploy` synthesizes ONLY the pipeline stack — with these unset, bin/cdk.ts
# skips ElevatorStack, avoiding Docker-based Lambda bundling during bootstrap.
unset ELEVATOR_ADMIN_GROUP ELEVATOR_AUDITOR_GROUP ELEVATOR_IDC_ACCESS_GROUP

# --- Create / reuse the GitHub CodeConnections connection ---
CONN_NAME="elevator-github-$ELEVATOR_ENV"
CONN_ARN=$(aws codestar-connections list-connections \
  --query "Connections[?ConnectionName=='$CONN_NAME'].ConnectionArn | [0]" \
  --output text 2>/dev/null || echo "None")
if [ "$CONN_ARN" = "None" ] || [ -z "$CONN_ARN" ]; then
  echo "Creating GitHub connection '$CONN_NAME' ..."
  CONN_ARN=$(aws codestar-connections create-connection \
    --provider-type GitHub --connection-name "$CONN_NAME" \
    --query ConnectionArn --output text)
fi

# --- Store pipeline shape in SSM (source of truth / record) ---
ssm_put() { aws ssm put-parameter --name "$1" --type String --overwrite --value "$2" >/dev/null; }
ssm_put "/elevator/$ELEVATOR_ENV/pipeline/connectionArn" "$CONN_ARN"
ssm_put "/elevator/$ELEVATOR_ENV/pipeline/repoOwner"     "$ELEVATOR_REPO_OWNER"
ssm_put "/elevator/$ELEVATOR_ENV/pipeline/repoName"      "$ELEVATOR_REPO_NAME"
ssm_put "/elevator/$ELEVATOR_ENV/pipeline/branch"        "$ELEVATOR_BRANCH"
echo "Stored pipeline settings and connection ARN in SSM (/elevator/$ELEVATOR_ENV/pipeline/*)."

# --- Deploy (or update) the pipeline ---
echo ""
echo "Deploying pipeline stack ElevatorPipeline-$ELEVATOR_ENV ..."
export ELEVATOR_REPO_OWNER ELEVATOR_REPO_NAME ELEVATOR_BRANCH
(cd "$CDK_DIR" && npm ci && npx cdk deploy "ElevatorPipeline-$ELEVATOR_ENV" --require-approval never)

# --- Connection approval (the one manual, one-time step) ---
STATUS=$(aws codestar-connections get-connection --connection-arn "$CONN_ARN" \
  --query Connection.ConnectionStatus --output text)
echo ""
if [ "$STATUS" != "AVAILABLE" ]; then
  cat <<EOF
================================================================================
ACTION REQUIRED — approve the GitHub connection (current status: $STATUS)
  1. Open: https://$REGION.console.aws.amazon.com/codesuite/settings/connections
  2. Select connection: $CONN_NAME
  3. Click "Update pending connection" and authorize access to
     $ELEVATOR_REPO_OWNER/$ELEVATOR_REPO_NAME
The pipeline will not fetch source until this is AVAILABLE. This is a one-time step.
================================================================================
EOF
  # Optional: wait for approval (Ctrl-C to stop — re-running bootstrap is safe).
  printf "Waiting for approval (Ctrl-C to skip) "
  while [ "$STATUS" != "AVAILABLE" ]; do
    sleep 10; printf "."
    STATUS=$(aws codestar-connections get-connection --connection-arn "$CONN_ARN" \
      --query Connection.ConnectionStatus --output text)
  done
  echo ""
fi
echo "GitHub connection is AVAILABLE."

echo ""
echo "=== Bootstrap complete ==="
echo "  Pipeline: elevator-$ELEVATOR_ENV"
echo "  Trigger:  push to '$ELEVATOR_BRANCH' (prod deploy requires manual approval)"
echo "  Config:   change any value with ./config-put.sh $ELEVATOR_ENV (no pipeline redeploy)"
