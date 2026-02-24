"""
Pytest configuration and fixtures for Elevator backend tests.
"""
import os
import json
import pytest
from unittest.mock import MagicMock
from moto import mock_aws
from boto3 import client, resource
from aws_lambda_powertools.utilities.typing import LambdaContext

# Set environment variables before any imports that depend on them
os.environ.setdefault('AWS_DEFAULT_REGION', 'us-east-1')
os.environ.setdefault('AWS_REGION', 'us-east-1')
os.environ.setdefault('REQUESTS_TABLE', 'test-requests')
os.environ.setdefault('APPROVERS_TABLE', 'test-approvers')
os.environ.setdefault('SETTINGS_TABLE', 'test-settings')
os.environ.setdefault('ELIGIBILITY_TABLE', 'test-eligibility')
os.environ.setdefault('POLICY_TABLE_NAME', 'test-policy')
os.environ.setdefault('AUTH_ELEVATOR_USERPOOLID', 'us-east-1_test123')
os.environ.setdefault('REGION', 'us-east-1')
os.environ.setdefault('ACCOUNT_ID', '123456789012')
os.environ.setdefault('SNS_TOPIC_ARN', 'arn:aws:sns:us-east-1:123456789012:test-topic')
os.environ.setdefault('ELEVATOR_LOGIN_URL', 'https://test.example.com/')
os.environ.setdefault('EVENT_DATA_STORE_ARN', 'arn:aws:cloudtrail:us-east-1:123456789012:eventdatastore/test')
os.environ.setdefault('REVOKE_RULE_NAME', 'test-revoke-rule')
os.environ.setdefault('REVOCATION_FUNCTION_ARN', 'arn:aws:lambda:us-east-1:123456789012:function:test-revoke')
os.environ.setdefault('SCHEDULER_ROLE_ARN', 'arn:aws:iam::123456789012:role/test-scheduler-role')
os.environ.setdefault('ELEVATOR_ADMIN_GROUP', 'Admin')
os.environ.setdefault('ELEVATOR_AUDITOR_GROUP', 'Auditors')
os.environ.setdefault('INTEGRATIONS_TABLE', 'test-integrations')


@pytest.fixture(scope="function")
def lambda_context():
    """Create a mock Lambda context"""
    context = MagicMock(spec=LambdaContext)
    context.function_name = "test-function"
    context.function_version = "$LATEST"
    context.invoked_function_arn = "arn:aws:lambda:us-east-1:123456789012:function:test-function"
    context.memory_limit_in_mb = 512
    context.aws_request_id = "test-request-id"
    return context


@pytest.fixture(autouse=True)
def _clear_module_caches():
    """Clear module-level caches between tests to prevent stale data across mock_aws contexts"""
    import sys
    if 'index' in sys.modules:
        import index
        index._sso_instance = None
        index._mgmt_account_id = None


@pytest.fixture(scope="function")
def aws_environment():
    """Set up complete AWS environment with moto"""
    with mock_aws():
        # Initialize clients
        dynamodb = resource('dynamodb', region_name='us-east-1')
        sso = client('sso-admin', region_name='us-east-1')
        idc = client('identitystore', region_name='us-east-1')
        orgs = client('organizations', region_name='us-east-1')

        # Create DynamoDB tables
        tables = {
            'requests': dynamodb.create_table(
                TableName='test-requests',
                KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
                AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
                BillingMode='PAY_PER_REQUEST'
            ),
            'approvers': dynamodb.create_table(
                TableName='test-approvers',
                KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
                AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
                BillingMode='PAY_PER_REQUEST'
            ),
            'settings': dynamodb.create_table(
                TableName='test-settings',
                KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
                AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
                BillingMode='PAY_PER_REQUEST'
            ),
            'eligibility': dynamodb.create_table(
                TableName='test-eligibility',
                KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
                AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
                BillingMode='PAY_PER_REQUEST'
            ),
            'policy': dynamodb.create_table(
                TableName='test-policy',
                KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
                AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
                BillingMode='PAY_PER_REQUEST'
            ),
            'integrations': dynamodb.create_table(
                TableName='test-integrations',
                KeySchema=[{'AttributeName': 'name', 'KeyType': 'HASH'}],
                AttributeDefinitions=[{'AttributeName': 'name', 'AttributeType': 'S'}],
                BillingMode='PAY_PER_REQUEST'
            ),
        }

        # Add test data to settings table
        tables['settings'].put_item(Item={
            'id': 'settings',
            'approval': True,
            'slackToken': 'test-token',
            'slackAuditNotificationsChannel': '#test-channel'
        })

        # Create organization
        org = orgs.create_organization(FeatureSet='ALL')
        org_id = org['Organization']['Id']
        mgmt_account_id = org['Organization']['MasterAccountId']

        # List roots to get root ID
        roots = orgs.list_roots()
        root_id = roots['Roots'][0]['Id'] if roots.get('Roots') else 'r-root'

        # Create OU
        ou = orgs.create_organizational_unit(
            ParentId=root_id,
            Name='TestOU'
        )
        ou_id = ou['OrganizationalUnit']['Id']

        # Create account and move it into the OU
        account = orgs.create_account(
            Email='test@example.com',
            AccountName='TestAccount'
        )
        org_account_id = account['CreateAccountStatus']['AccountId']
        orgs.move_account(
            AccountId=org_account_id,
            SourceParentId=root_id,
            DestinationParentId=ou_id
        )

        # Create Cognito user pool and user
        cognito = client('cognito-idp', region_name='us-east-1')
        pool_response = cognito.create_user_pool(PoolName='test-pool')
        user_pool_id = pool_response['UserPool']['Id']

        cognito.admin_create_user(
            UserPoolId=user_pool_id,
            Username='testuser',
            UserAttributes=[
                {'Name': 'email', 'Value': 'test@example.com'},
                {'Name': 'email_verified', 'Value': 'true'}
            ],
            MessageAction='SUPPRESS'
        )

        # Set up SSO Admin
        instances = sso.list_instances()
        instance_arn = instances['Instances'][0]['InstanceArn']
        identity_store_id = instances['Instances'][0]['IdentityStoreId']

        # Create permission set
        permission_set_response = sso.create_permission_set(
            Name='TestPermissionSet',
            Description='Test permission set for e2e tests',
            InstanceArn=instance_arn,
            SessionDuration='PT8H'
        )
        permission_set_arn = permission_set_response['PermissionSet']['PermissionSetArn']

        # Create test user in Identity Store
        user_response = idc.create_user(
            IdentityStoreId=identity_store_id,
            UserName='test@example.com',
            DisplayName='Test User',
            Name={
                'GivenName': 'Test',
                'FamilyName': 'User'
            },
            Emails=[
                {
                    'Value': 'test@example.com',
                    'Type': 'work',
                    'Primary': True
                }
            ]
        )
        user_id = user_response['UserId']

        # Create test group in Identity Store
        group_response = idc.create_group(
            IdentityStoreId=identity_store_id,
            DisplayName='TestGroup',
            Description='Test group for e2e tests'
        )
        group_id = group_response['GroupId']

        # Add user to group
        idc.create_group_membership(
            IdentityStoreId=identity_store_id,
            GroupId=group_id,
            MemberId={'UserId': user_id}
        )

        yield {
            'dynamodb_tables': tables,
            'sso_admin': sso,
            'identity_store': idc,
            'organizations': orgs,
            'instance_arn': instance_arn,
            'identity_store_id': identity_store_id,
            'permission_set_arn': permission_set_arn,
            'permission_set_name': 'TestPermissionSet',
            'user_id': user_id,
            'user_name': 'test@example.com',
            'group_id': group_id,
            'group_name': 'TestGroup',
            'organization_id': org_id,
            'root_id': root_id,
            'ou_id': ou_id,
            'org_account_id': org_account_id,
            'mgmt_account_id': mgmt_account_id,
            'user_pool_id': user_pool_id,
            'cognito': cognito
        }


# Convenience fixtures that extract specific parts of aws_environment
@pytest.fixture(scope="function")
def dynamodb_tables(aws_environment):
    """Extract DynamoDB tables from aws_environment"""
    return aws_environment['dynamodb_tables']


@pytest.fixture(scope="function")
def api_gateway_event():
    """Create a mock API Gateway HTTP API event"""
    def _create_event(method, path, body=None, query_params=None, path_params=None, jwt_claims=None):
        # Build query string
        query_string = '&'.join([f'{k}={v}' for k, v in (query_params or {}).items()]) if query_params else ''

        # Default JWT claims for authenticated user
        default_jwt_claims = {
            'email': 'test@example.com',
            'cognito:username': 'testuser',
            'userId': 'test-user-id-12345',
            'sub': 'test-sub-12345',
        }
        claims = {**default_jwt_claims, **(jwt_claims or {})}

        event = {
            'version': '2.0',
            'routeKey': f'{method} {path}',
            'rawPath': path,
            'rawQueryString': query_string,
            'headers': {
                'content-type': 'application/json',
                'host': 'test-api.execute-api.us-east-1.amazonaws.com'
            },
            'requestContext': {
                'accountId': '123456789012',
                'apiId': 'test-api-id',
                'requestId': 'test-request-id',
                'routeKey': f'{method} {path}',
                'stage': '$default',
                'time': '01/Jan/2024:00:00:00 +0000',
                'timeEpoch': 1704067200000,
                'http': {
                    'method': method,
                    'path': path,
                    'protocol': 'HTTP/1.1',
                    'sourceIp': '127.0.0.1',
                    'userAgent': 'test-agent'
                },
                'authorizer': {
                    'jwt': {
                        'claims': claims,
                        'scopes': None
                    }
                }
            },
            'pathParameters': path_params or {},
            'queryStringParameters': query_params or {},
            'body': json.dumps(body) if body else None,
            'isBase64Encoded': False
        }
        return event
    return _create_event

