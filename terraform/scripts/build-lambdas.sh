#!/usr/bin/env bash
# Build the Lambda deployment directories that Terraform zips (data.archive_file).
# Installs dependencies with uv into terraform/build/<name>/ targeting the Lambda
# platform, then copies the source. Run this before `terraform apply`.
#
#   ./scripts/build-lambdas.sh
#
# Env:
#   ELEVATOR_LAMBDA_ARCH   x86_64 (default) | arm64   — must match var.lambda_architecture
#   ELEVATOR_PY_VERSION    3.14 (default)

set -euo pipefail
TF_DIR="$(realpath "$(dirname "$0")/..")"
REPO_DIR="$(realpath "$TF_DIR/..")"
BUILD_DIR="$TF_DIR/build"

ARCH="${ELEVATOR_LAMBDA_ARCH:-x86_64}"
PY="${ELEVATOR_PY_VERSION:-3.14}"
case "$ARCH" in
  x86_64) PLATFORM="x86_64-manylinux2014" ;;
  arm64)  PLATFORM="aarch64-manylinux2014" ;;
  *) echo "Unknown ELEVATOR_LAMBDA_ARCH=$ARCH (use x86_64 or arm64)"; exit 1 ;;
esac

command -v uv >/dev/null || { echo "uv is required (https://docs.astral.sh/uv/)"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

copy_source() { # <src-dir> <dst-dir>  — copy .py source, excluding venvs/caches/tests
  tar -C "$1" \
    --exclude='.venv' --exclude='__pycache__' --exclude='.mypy_cache' \
    --exclude='.pytest_cache' --exclude='tests' --exclude='*.egg-info' \
    --exclude='uv.lock' --exclude='pyproject.toml' --exclude='requirements.txt' \
    --exclude='.claude' \
    -cf - . | tar -C "$2" -xf -
}

echo "=== Building backend (arch=$ARCH, python=$PY) ==="
rm -rf "$BUILD_DIR/backend"
mkdir -p "$BUILD_DIR/backend"
# Resolve dependencies from the backend's uv.lock (excluding dev + the project itself).
( cd "$REPO_DIR/lambda/backend" && uv export --frozen --no-dev --no-emit-project -o "$TMP/backend-req.txt" )
uv pip install \
  --python-version "$PY" --python-platform "$PLATFORM" \
  --target "$BUILD_DIR/backend" \
  -r "$TMP/backend-req.txt"
copy_source "$REPO_DIR/lambda/backend" "$BUILD_DIR/backend"

echo "=== Building pretoken (arch=$ARCH, python=$PY) ==="
rm -rf "$BUILD_DIR/pretoken"
mkdir -p "$BUILD_DIR/pretoken"
uv pip install \
  --python-version "$PY" --python-platform "$PLATFORM" \
  --target "$BUILD_DIR/pretoken" \
  -r "$REPO_DIR/lambda/pretoken/requirements.txt"
copy_source "$REPO_DIR/lambda/pretoken" "$BUILD_DIR/pretoken"

echo ""
echo "Built:"
echo "  $BUILD_DIR/backend   ($(du -sh "$BUILD_DIR/backend" | cut -f1))"
echo "  $BUILD_DIR/pretoken  ($(du -sh "$BUILD_DIR/pretoken" | cut -f1))"
echo "Now run: terraform apply"
