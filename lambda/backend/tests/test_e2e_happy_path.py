"""
End-to-end happy path tests for Elevator backend API.

These tests focus on the happy path scenarios for main API endpoints.
"""
import json
import sys
from pathlib import Path

# Add parent directory to path to import index
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import index (environment variables are set in conftest.py)
# Note: index will be imported within test fixtures where mock_aws() is active
from aws_lambda_powertools.utilities.data_classes import APIGatewayProxyEventV2


class TestHappyPath:
    """End-to-end happy path test"""

    def test_full_happy_path(self, aws_environment, lambda_context, api_gateway_event):
        """
        Test the complete happy path:
        1. Create eligibility policy
        2. Create request
        3. Approve request
        4. Grant access
        """
        # Import index INSIDE the test, after mock_aws() is active
        # This ensures boto3 clients are mocked when index module loads
        import index
        index.settings.auth_team_userpoolid = aws_environment['user_pool_id']

        # Extract data from aws_environment
        dynamodb_tables = aws_environment['dynamodb_tables']
        user_id = aws_environment['user_id']
        account_id = aws_environment['org_account_id']
        permission_set_arn = aws_environment['permission_set_arn']
        permission_set_name = aws_environment['permission_set_name']

        # Step 1: Create eligibility policy
        eligibility_policy = {
            'id': user_id,
            'accounts': [
                {'id': account_id, 'name': 'TestAccount'}
            ],
            'ous': [],
            'permissions': [
                {'id': permission_set_arn, 'name': permission_set_name}
            ],
            'approvalRequired': True,
            'duration': '8'
        }

        event_dict = api_gateway_event(
            'POST',
            '/eligibility',
            body=eligibility_policy,
            path_params={'resource': 'eligibility'}
        )
        event = APIGatewayProxyEventV2(event_dict)
        response = index.backend_handler(event, lambda_context)

        assert response['statusCode'] == 200
        policy_body = json.loads(response['body'])
        assert policy_body['id'] == user_id

        # Verify policy was stored
        stored_policy = dynamodb_tables['eligibility'].get_item(Key={'id': user_id})
        assert stored_policy.get('Item') is not None

        # Step 2: Create request (username, userId, email come from JWT claims)
        request_data = {
            'accountId': account_id,
            'accountName': 'TestAccount',
            'roleId': permission_set_arn,
            'role': permission_set_name,
            'duration': '8',
            'justification': 'Testing end-to-end flow',
            'ticketNo': 'TICKET-E2E-001',
        }

        # JWT claims must include the user_id that matches the eligibility policy
        jwt_claims = {
            'email': 'test@example.com',
            'cognito:username': 'testuser',
            'userId': user_id,
        }

        event_dict = api_gateway_event(
            'POST',
            '/requests',
            body=request_data,
            path_params={'resource': 'requests'},
            jwt_claims=jwt_claims
        )
        event = APIGatewayProxyEventV2(event_dict)
        response = index.backend_handler(event, lambda_context)
        
        assert response['statusCode'] == 200
        request_body = json.loads(response['body'])
        request_id = request_body['id']
        assert request_id is not None
        assert request_body['status'] == 'pending'
        
        # Verify request was stored
        stored_request = dynamodb_tables['requests'].get_item(Key={'id': request_id})
        assert stored_request.get('Item') is not None
        assert stored_request['Item']['status'] == 'pending'
        
        # Step 3: Approve request
        update_data = {
            'id': request_id,
            'status': 'approved',
            'approver': 'approver@example.com',
            'approverId': 'u-approver123'
        }
        
        event_dict = api_gateway_event(
            'PUT',
            f'/requests/{request_id}',
            body=update_data,
            path_params={'resource': 'requests', 'resource_id': request_id}
        )
        event = APIGatewayProxyEventV2(event_dict)
        response = index.backend_handler(event, lambda_context)
        
        assert response['statusCode'] == 200
        approved_body = json.loads(response['body'])
        # When approval triggers immediate grant, access is granted immediately
        assert approved_body['status'] == 'granted'
        assert approved_body['approver'] == 'approver@example.com'

        # Verify request was updated - status is granted since grant task completed
        updated_request = dynamodb_tables['requests'].get_item(Key={'id': request_id})
        assert updated_request['Item']['status'] == 'granted'
        
        # Step 4: Grant access
        event_dict = api_gateway_event(
            'POST',
            f'/requests/{request_id}/grant',
            path_params={'request_id': request_id}
        )
        event = APIGatewayProxyEventV2(event_dict)
        response = index.backend_handler(event, lambda_context)
        
        assert response['statusCode'] == 200
        grant_body = json.loads(response['body'])
        assert grant_body['status'] == 'granted'
        assert 'result' in grant_body
        assert 'request' in grant_body
        
        # Verify request status was updated to granted
        final_request = dynamodb_tables['requests'].get_item(Key={'id': request_id})
        assert final_request['Item']['status'] == 'granted'
