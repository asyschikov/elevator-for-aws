#!/usr/bin/env bash
# One-time bootstrap for the Elevator Terraform CI/CD pipeline.
#
# Persists config into AWS (SSM), creates the GitHub CodeConnections connection,
# and applies the self-mutating, multi-stage CodePipeline that deploys Elevator
# (via Terraform) from GitHub. After this, pushes to the branch trigger a run and
# prod deploys require a manual approval.
#
# Safe to re-run: SSM puts are upserts, an existing connection is reused, and the
# pipeline is updated in place.
#
# Prerequisites:
#   - terraform/bootstrap already applied (the state bucket exists)
#   - params.sh filled in (copy from params.sh.example)
#   - AWS credentials configured for the target account

set -euo pipefail
SCRIPT_DIR="$(realpath "$(dirname "$0")")"

# shellcheck source=/dev/null
source "$SCRIPT_DIR/params.sh"
: "${ELEVATOR_ENV:?ELEVATOR_ENV is required in params.sh}"
: "${ELEVATOR_STATE_BUCKET:?ELEVATOR_STATE_BUCKET is required in params.sh (run terraform/bootstrap first)}"

# --- Resolve repo owner/name/branch (from params, else the git remote) ---
if [ -z "${ELEVATOR_REPO_OWNER:-}" ] || [ -z "${ELEVATOR_REPO_NAME:-}" ]; then
  REMOTE_URL=$(git -C "$SCRIPT_DIR" remote get-url origin 2>/dev/null || echo "")
  if [[ "$REMOTE_URL" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    ELEVATOR_REPO_OWNER="${ELEVATOR_REPO_OWNER:-${BASH_REMATCH[1]}}"
    ELEVATOR_REPO_NAME="${ELEVATOR_REPO_NAME:-${BASH_REMATCH[2]}}"
  fi
fi
ELEVATOR_BRANCH="${ELEVATOR_BRANCH:-$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"
: "${ELEVATOR_REPO_OWNER:?Could not determine repo owner; set ELEVATOR_REPO_OWNER in params.sh}"
: "${ELEVATOR_REPO_NAME:?Could not determine repo name; set ELEVATOR_REPO_NAME in params.sh}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="${AWS_REGION:?Set AWS_REGION in params.sh}"

echo "=== Elevator Terraform pipeline bootstrap ==="
echo "  Account:  $ACCOUNT_ID"
echo "  Region:   $REGION"
echo "  Repo:     $ELEVATOR_REPO_OWNER/$ELEVATOR_REPO_NAME @ $ELEVATOR_BRANCH"
echo "  Prod env: $ELEVATOR_ENV${ELEVATOR_NONPROD_ENV:+   Non-prod env: $ELEVATOR_NONPROD_ENV}"
echo "  State:    s3://$ELEVATOR_STATE_BUCKET"
echo ""

# --- Verify the state bucket exists ---
if ! aws s3api head-bucket --bucket "$ELEVATOR_STATE_BUCKET" 2>/dev/null; then
  echo "State bucket '$ELEVATOR_STATE_BUCKET' not found."
  echo "Run terraform/bootstrap first:  (cd ../bootstrap && terraform init && terraform apply -var region=$REGION)"
  exit 1
fi

# --- Persist application config to SSM ---
"$SCRIPT_DIR/config-put.sh" "$ELEVATOR_ENV"
if [ -n "${ELEVATOR_NONPROD_ENV:-}" ]; then
  echo ""
  echo "NOTE: non-prod stage enabled (ELEVATOR_NONPROD_ENV=$ELEVATOR_NONPROD_ENV)."
  echo "      Populate its config with:  ./config-put.sh $ELEVATOR_NONPROD_ENV"
fi

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

ssm_put() { aws ssm put-parameter --name "$1" --type String --overwrite --value "$2" >/dev/null; }
ssm_put "/elevator/$ELEVATOR_ENV/pipeline/connectionArn" "$CONN_ARN"
ssm_put "/elevator/$ELEVATOR_ENV/pipeline/repoOwner"     "$ELEVATOR_REPO_OWNER"
ssm_put "/elevator/$ELEVATOR_ENV/pipeline/repoName"      "$ELEVATOR_REPO_NAME"
ssm_put "/elevator/$ELEVATOR_ENV/pipeline/branch"        "$ELEVATOR_BRANCH"
echo "Stored pipeline settings and connection ARN in SSM."

# --- Apply the pipeline configuration ---
echo ""
echo "Applying pipeline (terraform) ..."
export TF_VAR_env_name="$ELEVATOR_ENV"
export TF_VAR_aws_region="$REGION"
export TF_VAR_repo_owner="$ELEVATOR_REPO_OWNER"
export TF_VAR_repo_name="$ELEVATOR_REPO_NAME"
export TF_VAR_branch="$ELEVATOR_BRANCH"
export TF_VAR_state_bucket="$ELEVATOR_STATE_BUCKET"
[ -n "${ELEVATOR_NONPROD_ENV:-}" ] && export TF_VAR_nonprod_env="$ELEVATOR_NONPROD_ENV"

terraform -chdir="$SCRIPT_DIR" init -input=false \
  -backend-config="bucket=$ELEVATOR_STATE_BUCKET" \
  -backend-config="key=elevator/$ELEVATOR_ENV/pipeline.tfstate" \
  -backend-config="region=$REGION" \
  -backend-config="encrypt=true" \
  -backend-config="use_lockfile=true"
terraform -chdir="$SCRIPT_DIR" apply -input=false -auto-approve

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
This is a one-time step; the pipeline will not fetch source until it is AVAILABLE.
================================================================================
EOF
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
echo "  Pipeline: elevator-tf-$ELEVATOR_ENV"
echo "  Trigger:  push to '$ELEVATOR_BRANCH' (prod deploy requires manual approval)"
echo "  Config:   change any value with ./config-put.sh $ELEVATOR_ENV (no pipeline redeploy)"
