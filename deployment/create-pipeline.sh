#!/usr/bin/env bash
# DEPRECATED: superseded by ./bootstrap.sh
#
# The pipeline is now created by the one-time bootstrap, which also persists
# configuration to SSM and sets up the GitHub connection. This wrapper forwards to
# bootstrap.sh so existing muscle memory keeps working.

set -euo pipefail
SCRIPT_DIR="$(realpath "$(dirname "$0")")"
echo "create-pipeline.sh is deprecated — running ./bootstrap.sh instead."
echo ""
exec "$SCRIPT_DIR/bootstrap.sh" "$@"
