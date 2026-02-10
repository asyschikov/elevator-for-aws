#!/usr/bin/env bash
# Create a CodePipeline for automated Elevator deployments.
# The pipeline will automatically deploy when changes are pushed to the configured branch.

set -e
source "$(dirname "$0")/00-params.sh"

if [ -z "$ELEVATOR_ENV" ]; then
    echo "Error: ELEVATOR_ENV is required in 00-params.sh"
    exit 1
fi

# Get repo info from git if not set
if [ -z "$ELEVATOR_REPO_OWNER" ] || [ -z "$ELEVATOR_REPO_NAME" ]; then
    REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -n "$REMOTE_URL" ]; then
        # Parse GitHub URL (supports both HTTPS and SSH formats)
        if [[ "$REMOTE_URL" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
            ELEVATOR_REPO_OWNER="${ELEVATOR_REPO_OWNER:-${BASH_REMATCH[1]}}"
            ELEVATOR_REPO_NAME="${ELEVATOR_REPO_NAME:-${BASH_REMATCH[2]}}"
        fi
    fi
fi

if [ -z "$ELEVATOR_REPO_OWNER" ] || [ -z "$ELEVATOR_REPO_NAME" ]; then
    echo "Error: Could not determine repository. Set ELEVATOR_REPO_OWNER and ELEVATOR_REPO_NAME in 00-params.sh"
    exit 1
fi

# Get current branch if not set
if [ -z "$ELEVATOR_BRANCH" ]; then
    ELEVATOR_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
fi

export ELEVATOR_REPO_OWNER
export ELEVATOR_REPO_NAME
export ELEVATOR_BRANCH

# Check if we are logged in
aws sts get-caller-identity

SCRIPT_DIR="$(realpath "$(dirname "$0")")"
CDK_DIR="$(realpath "$SCRIPT_DIR/../cdk")"

echo "=== Creating Elevator Pipeline ==="
echo ""
echo "Repository: $ELEVATOR_REPO_OWNER/$ELEVATOR_REPO_NAME"
echo "Branch: $ELEVATOR_BRANCH"
echo "Environment: $ELEVATOR_ENV"
echo ""

# Deploy pipeline stack
cd "$CDK_DIR"
npx cdk deploy "ElevatorPipeline-$ELEVATOR_ENV" --require-approval never

echo ""
echo "=== Pipeline Created! ==="
echo ""
echo "IMPORTANT: You must approve the GitHub connection in the AWS Console."
echo "The pipeline will not work until the connection is approved."
echo ""
echo "After approval, the pipeline will automatically deploy Elevator"
echo "whenever changes are pushed to the '$ELEVATOR_BRANCH' branch."
echo ""
