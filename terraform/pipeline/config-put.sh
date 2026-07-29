#!/usr/bin/env bash
# Write Elevator application config for one environment into SSM Parameter Store.
# The pipeline's deploy stage reads these at run time (mapped to TF_VAR_*), so
# changing a value here and re-running takes effect on the next pipeline run.
#
# Usage: ./config-put.sh <env>        # values read from params.sh
#
# Safe to re-run; every put is an upsert.

set -euo pipefail
SCRIPT_DIR="$(realpath "$(dirname "$0")")"

ENV_NAME="${1:-${ELEVATOR_ENV:-}}"
: "${ENV_NAME:?Usage: config-put.sh <env>}"

if [ -z "${ELEVATOR_ADMIN_GROUP:-}" ]; then
  # shellcheck source=/dev/null
  source "$SCRIPT_DIR/params.sh"
fi

put() { # <KEY> <value>  — skips empty values (SSM String cannot be empty)
  [ -n "${2:-}" ] || { echo "  skip /elevator/$ENV_NAME/config/$1 (empty)"; return 0; }
  aws ssm put-parameter \
    --name "/elevator/$ENV_NAME/config/$1" \
    --type String --overwrite --value "$2" >/dev/null
  echo "  set  /elevator/$ENV_NAME/config/$1"
}

echo "Writing application config for env '$ENV_NAME' to SSM Parameter Store ..."
put ELEVATOR_ADMIN_GROUP      "${ELEVATOR_ADMIN_GROUP:-}"
put ELEVATOR_AUDITOR_GROUP    "${ELEVATOR_AUDITOR_GROUP:-}"
put ELEVATOR_IDC_ACCESS_GROUP "${ELEVATOR_IDC_ACCESS_GROUP:-}"
put IDC_REGION                "${IDC_REGION:-}"
put ELEVATOR_CUSTOM_DOMAIN    "${ELEVATOR_CUSTOM_DOMAIN:-}"
put ELEVATOR_ALLOW_LOCALHOST  "${ELEVATOR_ALLOW_LOCALHOST:-}"
echo "Done."
