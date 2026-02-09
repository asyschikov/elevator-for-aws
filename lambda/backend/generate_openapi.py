#!/usr/bin/env python3
"""
Generate OpenAPI specification from AWS Lambda Powertools routes.

Usage:
    python generate_openapi.py
"""

import json
import os

# Set minimal environment variables to avoid errors during import
os.environ.setdefault('AWS_DEFAULT_REGION', 'us-east-1')
os.environ.setdefault('AWS_REGION', 'us-east-1')
os.environ.setdefault('REQUESTS_TABLE', 'dummy')
os.environ.setdefault('SESSIONS_TABLE', 'dummy')
os.environ.setdefault('APPROVERS_TABLE', 'dummy')
os.environ.setdefault('SETTINGS_TABLE', 'dummy')
os.environ.setdefault('ELIGIBILITY_TABLE', 'dummy')
os.environ.setdefault('POLICY_TABLE_NAME', 'dummy')
os.environ.setdefault('AUTH_ELEVATOR_USERPOOLID', 'dummy')
os.environ.setdefault('ACCOUNT_ID', '123456789012')
os.environ.setdefault('SNS_TOPIC_ARN', 'arn:aws:sns:us-east-1:123456789012:dummy')
os.environ.setdefault('ELEVATOR_LOGIN_URL', 'https://dummy.example.com/')
os.environ.setdefault('EVENT_DATA_STORE_ARN', 'arn:aws:cloudtrail:us-east-1:123456789012:eventdatastore/dummy')
os.environ.setdefault('REVOKE_RULE_NAME', 'dummy')
os.environ.setdefault('REVOCATION_FUNCTION_ARN', 'arn:aws:lambda:us-east-1:123456789012:function:dummy')
os.environ.setdefault('INTEGRATIONS_TABLE', 'dummy')
os.environ.setdefault('ELEVATOR_ADMIN_GROUP', 'dummy')
os.environ.setdefault('ELEVATOR_AUDITOR_GROUP', 'dummy')

# Import the app instance from index.py
import index

app = index.app

# Generate OpenAPI schema using Powertools
openapi_json = app.get_openapi_json_schema(
    title="Elevator Backend API",
    version="1.0.0",
    description="Elevator (Temporary Elevated Access Management) Backend API for managing AWS IAM Identity Center access requests"
)

# Parse and print pretty JSON
openapi_schema = json.loads(openapi_json)
print(json.dumps(openapi_schema, indent=2))
