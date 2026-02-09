#!/usr/bin/env python3
"""
Generate src/config.json from CDK stack outputs.
The config.json is imported directly by TypeScript files.

Run: source 00-params.sh && python3 generate-config.py
"""

import json
import os
import boto3

ELEVATOR_STACK = os.environ['ELEVATOR_STACK']
REGION = os.environ.get('AWS_REGION', 'us-east-1')
EXTERNAL_DOMAIN = os.environ.get('ELEVATOR_EXTERNAL_DOMAIN', '')

session = boto3.Session(region_name=REGION)
cf = session.client('cloudformation')

# Get stack outputs
stack = cf.describe_stacks(StackName=ELEVATOR_STACK)
outputs = {o['OutputKey']: o['OutputValue'] for o in stack['Stacks'][0]['Outputs']}

app_domain = outputs.get('DistributionDomainName', 'localhost:5173')
oauth_domain = f"{outputs['OAuthDomain']}.auth.{REGION}.amazoncognito.com"

# Use external domain for login URL if configured, otherwise use CloudFront domain
login_domain = EXTERNAL_DOMAIN if EXTERNAL_DOMAIN else app_domain

# Build config
config = {
    "awsRegion": REGION,
    "userPoolId": outputs['UserPoolId'],
    "userPoolClientId": outputs['UserPoolClientId'],
    "oauthDomain": oauth_domain,
    "appDomain": app_domain,
    "apiEndpoint": outputs['ApiUrl'],
    "elevatorLoginUrl": f"https://{login_domain}/",
}

# Write to src/config.json
output_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'config.json')
with open(output_path, 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')

print(f"Generated {output_path}")
print()
print(json.dumps(config, indent=2))
