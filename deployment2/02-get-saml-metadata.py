#!/usr/bin/env python3
"""
Create IAM Identity Center SAML application and get metadata URL.

Run: source 00-params.sh && python3 02-get-saml-metadata.py

This creates the IDC SAML app and outputs the metadata URL. No CDK deployment
required yet. Copy the URL to SAML_METADATA_URL in 00-params.sh.

boto3 has NO support for Custom SAML 2.0 applications, so this script uses
undocumented SWBService APIs (same as AWS Console).
"""

import os
import sys
import uuid
import boto3
import requests
from requests_aws4auth import AWS4Auth
from botocore.config import Config

# Configuration from environment
REGION = os.environ.get('AWS_REGION', 'us-east-1')
IDC_REGION = os.environ.get('IDC_REGION', REGION)

# Template ID for Custom SAML 2.0 application (discovered via console API inspection)
SAML_TEMPLATE_ID = 'tpl-50e590700beb5208'

GREEN = '\033[0;32m'
YELLOW = '\033[0;33m'
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


def list_application_instances() -> list:
    """List all application instances using SWBService."""
    response = call_swb_api('ListApplicationInstances', {})
    return response.get('applicationInstances', [])


def find_existing_app_by_name(display_name: str) -> dict | None:
    """Find an existing application by display name."""
    apps = list_application_instances()
    for app in apps:
        if app.get('display', {}).get('displayName') == display_name:
            return app
    return None


def get_application_instance(instance_id: str) -> dict:
    """Get full application instance details including metadata URL."""
    response = call_swb_api('GetApplicationInstance', {'instanceId': instance_id})
    return response['applicationInstance']


def configure_attribute_mappings(instance_id: str):
    """Configure SAML attribute mappings for Cognito federation."""
    print(f"{GREEN}Configuring SAML attribute mappings...{CLEAR}")

    call_swb_api('UpdateApplicationInstanceResponseConfiguration', {
        'instanceId': instance_id,
        'responseConfig': {
            'subject': {'source': ['${user:email}']},
            'properties': {'Email': {'source': ['${user:email}']}},
            'ttl': 'PT1H',
        },
    })

    call_swb_api('UpdateApplicationInstanceResponseSchemaConfiguration', {
        'instanceId': instance_id,
        'responseSchemaConfig': {
            'subject': {
                'include': 'REQUIRED',
                'nameIdFormat': 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
            },
            'properties': {
                'Email': {
                    'attrNameFormat': 'urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified',
                    'include': 'YES',
                },
            },
        },
    })


def create_saml_application(display_name: str, description: str) -> str:
    """Create a minimal SAML application (without service provider config).

    Service provider config (ACS URL, audience) will be set later by 04-configure-idc-app.py.
    """
    print(f"{GREEN}Creating SAML application instance...{CLEAR}")
    create_response = call_swb_api('CreateApplicationInstance', {
        'templateId': SAML_TEMPLATE_ID,
        'name': str(uuid.uuid4()),
    })
    instance_id = create_response['applicationInstance']['instanceId']
    print(f"  Instance ID: {instance_id}")

    print(f"{GREEN}Setting display name and description...{CLEAR}")
    call_swb_api('UpdateApplicationInstanceDisplayData', {
        'instanceId': instance_id,
        'displayName': display_name,
        'description': description,
    })

    configure_attribute_mappings(instance_id)

    print(f"{GREEN}Enabling application...{CLEAR}")
    call_swb_api('UpdateApplicationInstanceStatus', {
        'instanceId': instance_id,
        'status': 'ENABLED',
    })

    return instance_id


def main():
    print(f"\n{GREEN}=== Create IAM Identity Center SAML App ==={CLEAR}\n")
    print(f"IDC Region: {IDC_REGION}")
    print()

    app_name = "Elevator"
    existing_app = find_existing_app_by_name(app_name)

    if existing_app:
        print(f"{YELLOW}Application '{app_name}' already exists{CLEAR}")
        instance_id = existing_app['instanceId']
    else:
        instance_id = create_saml_application(
            display_name=app_name,
            description="Temporary Elevated Access Management",
        )
        print(f"{GREEN}Created application{CLEAR}")

    app_instance = get_application_instance(instance_id)
    metadata_url = app_instance['identityProviderConfig']['metadataUrl']

    print(f"\n{GREEN}=== Done ==={CLEAR}\n")
    print(f"Instance ID: {instance_id}")
    print(f"SAML Metadata URL: {metadata_url}")
    print()
    print(f"{GREEN}Next steps:{CLEAR}")
    print(f"1. Add to 00-params.sh:")
    print(f"   export SAML_METADATA_URL={metadata_url}")
    print(f"2. Deploy the stack:")
    print(f"   source 00-params.sh && ./03-deploy.sh")
    print(f"3. Configure IDC app with Cognito settings:")
    print(f"   source 00-params.sh && python3 04-configure-idc-app.py")
    print()

    return 0


if __name__ == '__main__':
    sys.exit(main())
