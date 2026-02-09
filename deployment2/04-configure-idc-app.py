#!/usr/bin/env python3
"""
Configure IAM Identity Center SAML app with Cognito settings from stack outputs.

Run: source 00-params.sh && python3 04-configure-idc-app.py

Prerequisites:
- IDC app created (02-get-saml-metadata.py)
- Stack deployed (03-deploy.sh)

This script configures the IDC app's service provider settings (ACS URL, audience)
using Cognito outputs from the deployed stack, and assigns the access group.
"""

import os
import sys
import boto3
import requests
from requests_aws4auth import AWS4Auth
from botocore.config import Config

# Configuration from environment
ELEVATOR_STACK = os.environ['ELEVATOR_STACK']
REGION = os.environ.get('AWS_REGION', 'us-east-1')
IDC_REGION = os.environ.get('IDC_REGION', REGION)
IDC_ACCESS_GROUP = os.environ.get('ELEVATOR_IDC_ACCESS_GROUP', 'Developers')

GREEN = '\033[0;32m'
YELLOW = '\033[0;33m'
RED = '\033[0;31m'
CLEAR = '\033[0m'

config = Config(retries={'max_attempts': 3, 'mode': 'adaptive'})
session = boto3.Session(region_name=IDC_REGION)
cf = boto3.Session(region_name=REGION).client('cloudformation')


def get_swb_auth():
    """Get SigV4 auth for SWBService API calls."""
    credentials = session.get_credentials().get_frozen_credentials()
    return AWS4Auth(
        credentials.access_key,
        credentials.secret_key,
        IDC_REGION,
        'sso',
        session_token=credentials.token
    )


def call_swb_api(action: str, payload: dict, endpoint_suffix: str = 'control/') -> dict:
    """Call the undocumented SWBService API."""
    service_prefix = 'SWBService' if endpoint_suffix == 'control/' else 'SWBExternalService'
    endpoint = f'https://sso.{IDC_REGION}.amazonaws.com/{endpoint_suffix}'
    headers = {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': f'{service_prefix}.{action}',
    }

    response = requests.post(endpoint, json=payload, headers=headers, auth=get_swb_auth())

    if response.status_code != 200:
        raise RuntimeError(f"{service_prefix}.{action} failed: {response.text}")

    return response.json()


def get_stack_outputs():
    """Get outputs from the Elevator CloudFormation stack."""
    stack = cf.describe_stacks(StackName=ELEVATOR_STACK)
    return {o['OutputKey']: o['OutputValue'] for o in stack['Stacks'][0]['Outputs']}


def get_sso_instance():
    """Get the SSO instance ARN and Identity Store ID."""
    response = call_swb_api('ListInstances', {}, endpoint_suffix='')
    instances = response.get('Instances', [])
    if not instances:
        raise RuntimeError("No IAM Identity Center instance found")
    instance = instances[0]
    return instance['InstanceArn'], instance['IdentityStoreId'], instance['OwnerAccountId']


def list_application_instances() -> list:
    """List all application instances."""
    response = call_swb_api('ListApplicationInstances', {})
    return response.get('applicationInstances', [])


def find_existing_app_by_name(display_name: str) -> dict | None:
    """Find an existing application by display name."""
    apps = list_application_instances()
    for app in apps:
        if app.get('display', {}).get('displayName') == display_name:
            return app
    return None


def find_group(identity_store_id: str, group_name: str) -> str:
    """Find a group by name in the Identity Store."""
    identity_store = session.client('identitystore', config=config)

    response = identity_store.list_groups(
        IdentityStoreId=identity_store_id,
        Filters=[{'AttributePath': 'DisplayName', 'AttributeValue': group_name}]
    )

    groups = response.get('Groups', [])
    if not groups:
        raise RuntimeError(f"Group '{group_name}' not found in Identity Store")

    return groups[0]['GroupId']


def configure_service_provider(instance_id: str, acs_url: str, audience: str):
    """Configure the SAML service provider settings."""
    print(f"{GREEN}Configuring service provider...{CLEAR}")
    print(f"  ACS URL: {acs_url}")
    print(f"  Audience: {audience}")

    call_swb_api('UpdateApplicationInstanceServiceProviderConfiguration', {
        'instanceId': instance_id,
        'serviceProviderConfig': {
            'audience': audience,
            'consumers': [{
                'location': acs_url,
                'binding': 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
                'defaultValue': False,
            }],
            'requireRequestSignature': False,
        },
    })


def assign_group_to_app(app_arn: str, identity_store_id: str, group_name: str):
    """Assign a group to the application."""
    print(f"{GREEN}Assigning group '{group_name}' to application...{CLEAR}")

    group_id = find_group(identity_store_id, group_name)

    try:
        call_swb_api('CreateApplicationAssignment', {
            'ApplicationArn': app_arn,
            'PrincipalId': group_id,
            'PrincipalType': 'GROUP',
        }, endpoint_suffix='')
        print(f"{GREEN}Assigned group '{group_name}'{CLEAR}")
    except RuntimeError as e:
        if 'ConflictException' in str(e) or 'already exists' in str(e).lower():
            print(f"{YELLOW}Group '{group_name}' already assigned{CLEAR}")
        else:
            raise


def main():
    print(f"\n{GREEN}=== Configure IAM Identity Center SAML App ==={CLEAR}\n")
    print(f"Stack: {ELEVATOR_STACK}")
    print(f"Region: {REGION}")
    print(f"IDC Region: {IDC_REGION}")
    print(f"Access Group: {IDC_ACCESS_GROUP}")
    print()

    # Find the existing app
    app_name = "Elevator"
    existing_app = find_existing_app_by_name(app_name)

    if not existing_app:
        print(f"{RED}Application '{app_name}' not found.{CLEAR}")
        print(f"Run 02-get-saml-metadata.py first to create the app.")
        return 1

    instance_id = existing_app['instanceId']
    print(f"Instance ID: {instance_id}")

    # Get stack outputs for Cognito configuration
    print(f"{GREEN}Getting stack outputs...{CLEAR}")
    outputs = get_stack_outputs()

    user_pool_id = outputs.get('UserPoolId')
    oauth_domain = outputs.get('OAuthDomain')

    if not user_pool_id or not oauth_domain:
        raise RuntimeError("UserPoolId or OAuthDomain not found in stack outputs")

    # Calculate SAML parameters
    acs_url = f"https://{oauth_domain}.auth.{REGION}.amazoncognito.com/saml2/idpresponse"
    audience = f"urn:amazon:cognito:sp:{user_pool_id}"

    # Configure service provider
    configure_service_provider(instance_id, acs_url, audience)

    # Get SSO instance info for group assignment
    instance_arn, identity_store_id, owner_account_id = get_sso_instance()
    sso_instance_id = instance_arn.split('/')[-1]
    app_id = instance_id.replace('ins-', 'apl-')
    app_arn = f"arn:aws:sso::{owner_account_id}:application/{sso_instance_id}/{app_id}"

    # Assign group
    assign_group_to_app(app_arn, identity_store_id, IDC_ACCESS_GROUP)

    print(f"\n{GREEN}=== Configuration Complete ==={CLEAR}\n")
    print(f"The Elevator app is now fully configured for Cognito federation.")
    print()

    return 0


if __name__ == '__main__':
    sys.exit(main())
