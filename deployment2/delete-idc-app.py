#!/usr/bin/env python3
"""
Delete an IAM Identity Center SAML application.

Run: source 00-params.sh && python3 06-delete-idc-app.py [app-name]

Default app name is "Elevator" if not specified.
"""

import os
import sys
import boto3
import requests
from requests_aws4auth import AWS4Auth
from botocore.config import Config

# Configuration from environment
REGION = os.environ.get('AWS_REGION', 'us-east-1')
IDC_REGION = os.environ.get('IDC_REGION', REGION)

GREEN = '\033[0;32m'
YELLOW = '\033[0;33m'
RED = '\033[0;31m'
CLEAR = '\033[0m'

config = Config(retries={'max_attempts': 3, 'mode': 'adaptive'})
session = boto3.Session(region_name=IDC_REGION)


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


def delete_application(app_name: str):
    """Delete an application by name, removing all assignments first."""
    print(f"\n{GREEN}=== Delete IAM Identity Center Application ==={CLEAR}\n")
    print(f"App name: {app_name}")
    print(f"IDC Region: {IDC_REGION}")
    print()

    # Find the app
    app = find_existing_app_by_name(app_name)
    if not app:
        print(f"{YELLOW}Application '{app_name}' not found{CLEAR}")
        return 1

    instance_id = app['instanceId']
    print(f"Instance ID: {instance_id}")

    # Get SSO instance info to construct app ARN
    instance_arn, identity_store_id, owner_account_id = get_sso_instance()
    sso_instance_id = instance_arn.split('/')[-1]
    app_id = instance_id.replace('ins-', 'apl-')
    app_arn = f"arn:aws:sso::{owner_account_id}:application/{sso_instance_id}/{app_id}"
    print(f"Application ARN: {app_arn}")
    print()

    # Step 1: List and delete all application assignments (via SWBExternalService)
    print(f"{GREEN}Listing application assignments...{CLEAR}")
    try:
        assignments_response = call_swb_api('ListApplicationAssignments', {
            'ApplicationArn': app_arn,
        }, endpoint_suffix='')
        assignments = assignments_response.get('ApplicationAssignments', [])
        print(f"Found {len(assignments)} assignments")

        for assignment in assignments:
            principal_id = assignment['PrincipalId']
            principal_type = assignment['PrincipalType']
            print(f"  Deleting {principal_type} assignment: {principal_id}")
            call_swb_api('DeleteApplicationAssignment', {
                'ApplicationArn': app_arn,
                'PrincipalId': principal_id,
                'PrincipalType': principal_type,
            }, endpoint_suffix='')
    except RuntimeError as e:
        print(f"{YELLOW}Warning listing assignments: {e}{CLEAR}")

    # Step 2: List and delete all profiles (via SWBService)
    print(f"{GREEN}Listing profiles...{CLEAR}")
    try:
        profiles_response = call_swb_api('ListProfiles', {'instanceId': instance_id})
        # Note: response key is 'applicationProfiles', not 'profiles'
        profiles = profiles_response.get('applicationProfiles', [])
        print(f"Found {len(profiles)} profiles")

        for profile in profiles:
            profile_id = profile['profileId']
            print(f"  Deleting profile: {profile_id}")
            call_swb_api('DeleteProfile', {
                'instanceId': instance_id,
                'profileId': profile_id,
            })
    except RuntimeError as e:
        print(f"{YELLOW}Warning listing profiles: {e}{CLEAR}")

    # Step 3: Delete the application instance
    print(f"{GREEN}Deleting application instance...{CLEAR}")
    try:
        call_swb_api('DeleteApplicationInstance', {'instanceId': instance_id})
        print(f"{GREEN}Deleted successfully{CLEAR}")
    except RuntimeError as e:
        print(f"{RED}Failed to delete: {e}{CLEAR}")
        return 1

    print(f"\n{GREEN}=== Done ==={CLEAR}\n")
    return 0


def main():
    app_name = sys.argv[1] if len(sys.argv) > 1 else 'Elevator'
    return delete_application(app_name)


if __name__ == '__main__':
    sys.exit(main())
