"""
Custom Resource Lambda for managing IAM Identity Center SAML Application.

Handles CloudFormation Create/Update/Delete lifecycle events.
Uses undocumented SWBService APIs (same as AWS Console).
"""

import json
import uuid
import urllib.request
import boto3
import botocore.auth
import botocore.awsrequest
from botocore.config import Config

# Template ID for Custom SAML 2.0 application
SAML_TEMPLATE_ID = 'tpl-50e590700beb5208'


def send_cfn_response(event, context, status, data=None, reason=None, physical_resource_id=None):
    """Send response to CloudFormation."""
    response_body = {
        'Status': status,
        'Reason': reason or f'See CloudWatch Log Stream: {context.log_stream_name}',
        'PhysicalResourceId': physical_resource_id or context.log_stream_name,
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'Data': data or {},
    }

    response_body_json = json.dumps(response_body).encode('utf-8')

    req = urllib.request.Request(
        event['ResponseURL'],
        data=response_body_json,
        headers={'Content-Type': 'application/json'},
        method='PUT',
    )

    urllib.request.urlopen(req)


def get_session(region: str):
    """Get boto3 session for the specified region."""
    return boto3.Session(region_name=region)


def call_swb_api(session, region: str, action: str, payload: dict, endpoint_suffix: str = 'control/') -> dict:
    """Call the undocumented SWBService API using SigV4 signing."""
    service_prefix = 'SWBService' if endpoint_suffix == 'control/' else 'SWBExternalService'
    endpoint = f'https://sso.{region}.amazonaws.com/{endpoint_suffix}'

    headers = {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': f'{service_prefix}.{action}',
    }

    body = json.dumps(payload).encode('utf-8')

    # Create and sign the request
    request = botocore.awsrequest.AWSRequest(method='POST', url=endpoint, headers=headers, data=body)
    credentials = session.get_credentials().get_frozen_credentials()

    signer = botocore.auth.SigV4Auth(credentials, 'sso', region)
    signer.add_auth(request)

    # Make the request
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers=dict(request.headers),
        method='POST',
    )

    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        raise RuntimeError(f"{service_prefix}.{action} failed: {error_body}")


def get_sso_instance(session, region: str):
    """Get the SSO instance ARN and Identity Store ID."""
    response = call_swb_api(session, region, 'ListInstances', {}, endpoint_suffix='')
    instances = response.get('Instances', [])
    if not instances:
        raise RuntimeError("No IAM Identity Center instance found")
    instance = instances[0]
    return instance['InstanceArn'], instance['IdentityStoreId'], instance['OwnerAccountId']


def build_app_arn(instance_id: str, owner_account_id: str, sso_instance_id: str) -> str:
    """Build the application ARN from instance ID."""
    app_id = instance_id.replace('ins-', 'apl-')
    return f"arn:aws:sso::{owner_account_id}:application/{sso_instance_id}/{app_id}"


def find_existing_app_by_name(session, region: str, display_name: str) -> dict | None:
    """Find an existing application by display name."""
    response = call_swb_api(session, region, 'ListApplicationInstances', {})
    apps = response.get('applicationInstances', [])
    for app in apps:
        if app.get('display', {}).get('displayName') == display_name:
            return app
    return None


def get_application_instance(session, region: str, instance_id: str) -> dict:
    """Get full application instance details."""
    response = call_swb_api(session, region, 'GetApplicationInstance', {'instanceId': instance_id})
    return response['applicationInstance']


def find_group(session, identity_store_id: str, group_name: str) -> str:
    """Find a group by name in the Identity Store."""
    identity_store = session.client('identitystore', config=Config(retries={'max_attempts': 3, 'mode': 'adaptive'}))

    response = identity_store.list_groups(
        IdentityStoreId=identity_store_id,
        Filters=[{'AttributePath': 'DisplayName', 'AttributeValue': group_name}]
    )

    groups = response.get('Groups', [])
    if not groups:
        raise RuntimeError(f"Group '{group_name}' not found in Identity Store")

    return groups[0]['GroupId']


def create_idc_app(session, region: str, display_name: str, description: str, acs_url: str, audience: str) -> str:
    """Create a Custom SAML 2.0 application."""
    # Step 1: Create the application instance
    create_response = call_swb_api(session, region, 'CreateApplicationInstance', {
        'templateId': SAML_TEMPLATE_ID,
        'name': str(uuid.uuid4()),
    })
    instance_id = create_response['applicationInstance']['instanceId']

    # Step 2: Set display name and description
    call_swb_api(session, region, 'UpdateApplicationInstanceDisplayData', {
        'instanceId': instance_id,
        'displayName': display_name,
        'description': description,
    })

    # Step 3: Configure service provider
    call_swb_api(session, region, 'UpdateApplicationInstanceServiceProviderConfiguration', {
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

    # Step 4: Configure attribute mappings
    call_swb_api(session, region, 'UpdateApplicationInstanceResponseConfiguration', {
        'instanceId': instance_id,
        'responseConfig': {
            'subject': {'source': ['${user:email}']},
            'properties': {'Email': {'source': ['${user:email}']}},
            'ttl': 'PT1H',
        },
    })

    call_swb_api(session, region, 'UpdateApplicationInstanceResponseSchemaConfiguration', {
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

    # Step 5: Enable the application
    call_swb_api(session, region, 'UpdateApplicationInstanceStatus', {
        'instanceId': instance_id,
        'status': 'ENABLED',
    })

    return instance_id


def update_idc_app(session, region: str, instance_id: str, acs_url: str, audience: str):
    """Update an existing IDC app's service provider configuration."""
    call_swb_api(session, region, 'UpdateApplicationInstanceServiceProviderConfiguration', {
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


def assign_group_to_app(session, region: str, app_arn: str, identity_store_id: str, group_name: str):
    """Assign a group to the application."""
    group_id = find_group(session, identity_store_id, group_name)

    try:
        call_swb_api(session, region, 'CreateApplicationAssignment', {
            'ApplicationArn': app_arn,
            'PrincipalId': group_id,
            'PrincipalType': 'GROUP',
        }, endpoint_suffix='')
    except RuntimeError as e:
        if 'ConflictException' not in str(e) and 'already exists' not in str(e).lower():
            raise


def delete_idc_app(session, region: str, instance_id: str, app_arn: str):
    """Delete an IDC application and all its assignments/profiles."""
    # Delete assignments
    try:
        assignments_response = call_swb_api(session, region, 'ListApplicationAssignments', {
            'ApplicationArn': app_arn,
        }, endpoint_suffix='')
        for assignment in assignments_response.get('ApplicationAssignments', []):
            call_swb_api(session, region, 'DeleteApplicationAssignment', {
                'ApplicationArn': app_arn,
                'PrincipalId': assignment['PrincipalId'],
                'PrincipalType': assignment['PrincipalType'],
            }, endpoint_suffix='')
    except RuntimeError:
        pass  # Ignore errors listing/deleting assignments

    # Delete profiles
    try:
        profiles_response = call_swb_api(session, region, 'ListProfiles', {'instanceId': instance_id})
        for profile in profiles_response.get('applicationProfiles', []):
            call_swb_api(session, region, 'DeleteProfile', {
                'instanceId': instance_id,
                'profileId': profile['profileId'],
            })
    except RuntimeError:
        pass  # Ignore errors listing/deleting profiles

    # Delete the application
    call_swb_api(session, region, 'DeleteApplicationInstance', {'instanceId': instance_id})


def handler(event, context):
    """CloudFormation Custom Resource handler."""
    print(f"Event: {json.dumps(event)}")

    try:
        request_type = event['RequestType']
        properties = event['ResourceProperties']
        print(f"Request type: {request_type}")

        idc_region = properties['idcRegion']
        cognito_region = properties['cognitoRegion']
        user_pool_id = properties['userPoolId']
        oauth_domain = properties['oauthDomain']
        access_group = properties['accessGroup']
        app_name = properties.get('appName', 'Elevator')
        app_description = properties.get('appDescription', 'Temporary Elevated Access Management')
        print(f"IDC region: {idc_region}, Cognito region: {cognito_region}")

        session = get_session(idc_region)
        print("Session created")

        # Calculate Cognito SAML parameters
        acs_url = f"https://{oauth_domain}.auth.{cognito_region}.amazoncognito.com/saml2/idpresponse"
        audience = f"urn:amazon:cognito:sp:{user_pool_id}"

        # Get SSO instance info
        instance_arn, identity_store_id, owner_account_id = get_sso_instance(session, idc_region)
        sso_instance_id = instance_arn.split('/')[-1]

        if request_type == 'Create':
            # Check if app already exists
            existing_app = find_existing_app_by_name(session, idc_region, app_name)
            if existing_app:
                instance_id = existing_app['instanceId']
                # Update existing app with current Cognito settings
                update_idc_app(session, idc_region, instance_id, acs_url, audience)
            else:
                instance_id = create_idc_app(
                    session, idc_region, app_name, app_description, acs_url, audience
                )

            # Construct app ARN and assign group
            app_arn = build_app_arn(instance_id, owner_account_id, sso_instance_id)
            assign_group_to_app(session, idc_region, app_arn, identity_store_id, access_group)

            # Get metadata URL
            app_instance = get_application_instance(session, idc_region, instance_id)
            metadata_url = app_instance['identityProviderConfig']['metadataUrl']
            print(f"Created/updated app: {instance_id}, metadataUrl: {metadata_url}")

            # Return data for cr.Provider pattern
            return {
                'PhysicalResourceId': instance_id,
                'Data': {
                    'instanceId': instance_id,
                    'metadataUrl': metadata_url,
                    'applicationArn': app_arn,
                }
            }

        elif request_type == 'Update':
            instance_id = event['PhysicalResourceId']

            # Update service provider config
            update_idc_app(session, idc_region, instance_id, acs_url, audience)

            # Ensure group is assigned
            app_arn = build_app_arn(instance_id, owner_account_id, sso_instance_id)
            assign_group_to_app(session, idc_region, app_arn, identity_store_id, access_group)

            # Get metadata URL
            app_instance = get_application_instance(session, idc_region, instance_id)
            metadata_url = app_instance['identityProviderConfig']['metadataUrl']
            print(f"Updated app: {instance_id}, metadataUrl: {metadata_url}")

            return {
                'PhysicalResourceId': instance_id,
                'Data': {
                    'instanceId': instance_id,
                    'metadataUrl': metadata_url,
                    'applicationArn': app_arn,
                }
            }

        elif request_type == 'Delete':
            instance_id = event['PhysicalResourceId']

            # Don't delete if physical resource ID is the log stream (failed create)
            if instance_id and instance_id.startswith('ins-'):
                app_arn = build_app_arn(instance_id, owner_account_id, sso_instance_id)

                try:
                    delete_idc_app(session, idc_region, instance_id, app_arn)
                    print(f"Deleted app: {instance_id}")
                except RuntimeError as e:
                    print(f"Warning: Failed to delete IDC app: {e}")

            return {'PhysicalResourceId': instance_id}

    except Exception as e:
        print(f"Error: {e}")
        raise
