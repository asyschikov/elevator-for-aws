# Lambda Backend Function

This directory contains the Lambda backend function for the Elevator application.

## Setup with uv

This project uses [uv](https://github.com/astral-sh/uv) for Python package management, which is faster and more reliable than pip/pipenv.

### Prerequisites

Install uv if you haven't already:

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Or using Homebrew
brew install uv

# Or using pip
pip install uv
```

### Development Setup

For local development, create a virtual environment:

```bash
# Create and activate virtual environment
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
uv pip install -r requirements.txt

# Or install from pyproject.toml
uv pip install -e .
```

### Building for Lambda Deployment

When deploying to Lambda, dependencies need to be installed in the same directory as the code (since CDK packages the entire directory).

**Option 1: Using the build script (recommended)**

```bash
./build.sh
```

**Option 2: Manual build**

```bash
# Install dependencies directly into the current directory
uv pip install --system -r requirements.txt --target .
```

**Option 3: Using pyproject.toml**

```bash
uv pip install --system -e . --target .
```

### Updating Dependencies

To add a new dependency:

1. Add it to `pyproject.toml` in the `dependencies` array
2. Update `requirements.txt`:
   ```bash
   uv pip compile pyproject.toml -o requirements.txt
   ```
3. Rebuild for Lambda:
   ```bash
   ./build.sh
   ```

### Project Structure

- `index.py` - Main Lambda handler code
- `pyproject.toml` - Project metadata and dependencies (PEP 621)
- `requirements.txt` - Locked dependencies for Lambda deployment
- `.python-version` - Python version specification (3.11)
- `build.sh` - Build script for Lambda packaging

### Notes

- The CDK stack packages this entire directory using `lambda.Code.fromAsset()`
- Dependencies installed with `--target .` will be included in the Lambda package
- For local development, use a virtual environment (`.venv`) to avoid conflicts
- The `.python-version` file ensures uv uses Python 3.11

