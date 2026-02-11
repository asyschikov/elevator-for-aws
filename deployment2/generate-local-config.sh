#!/usr/bin/env bash
# Generate frontend config for local development.
# This fetches the deployed stack outputs and creates src/config.json pointing to localhost.

set -e
source "$(dirname "$0")/00-params.sh"

if [ -z "$ELEVATOR_ENV" ]; then
    echo "Error: ELEVATOR_ENV is required in 00-params.sh"
    exit 1
fi

SCRIPT_DIR="$(realpath "$(dirname "$0")")"
PROJECT_DIR="$(realpath "$SCRIPT_DIR/..")"
CONFIG_FILE="$PROJECT_DIR/src/config.json"

# Get stack outputs
STACK_NAME="ElevatorStack-$ELEVATOR_ENV"

echo "Fetching stack outputs from $STACK_NAME..."

USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)
USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)
OAUTH_DOMAIN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`OAuthDomain`].OutputValue' --output text)
API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)
REGION=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`Region`].OutputValue' --output text)

cat > "$CONFIG_FILE" << EOF
{
  "awsRegion": "$REGION",
  "userPoolId": "$USER_POOL_ID",
  "userPoolClientId": "$USER_POOL_CLIENT_ID",
  "oauthDomain": "$OAUTH_DOMAIN.auth.$REGION.amazoncognito.com",
  "appDomain": "localhost:5173",
  "apiEndpoint": "$API_URL",
  "elevatorLoginUrl": "http://localhost:5173/"
}
EOF

echo "Generated $CONFIG_FILE for local development"
echo ""
cat "$CONFIG_FILE"
echo ""
echo "Run 'npm run dev' to start the local development server"
