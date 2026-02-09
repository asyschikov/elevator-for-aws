"""
Tests for the request enrichment code path.

Covers: get_email, get_ou, get_approver_groups_for_id, get_approver_group_ids,
get_approvers, get_approvers_details, get_ps_duration, update_request_details.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


class TestGetEmail:
    """Tests for get_email() - Cognito username-to-email lookup"""

    def test_returns_email_for_existing_user(self, aws_environment):
        import index
        index.settings.auth_team_userpoolid = aws_environment['user_pool_id']

        result = index.get_email('testuser')
        assert result == 'test@example.com'

    def test_returns_none_for_nonexistent_user(self, aws_environment):
        import index
        index.settings.auth_team_userpoolid = aws_environment['user_pool_id']

        result = index.get_email('nonexistent')
        assert result is None


class TestGetOu:
    """Tests for get_ou() - Organizations account-to-OU lookup"""

    def test_returns_ou_for_account(self, aws_environment):
        import index

        ou = index.get_ou(aws_environment['org_account_id'])
        assert ou.Id == aws_environment['ou_id']

    def test_ou_is_pydantic_model_with_attribute_access(self, aws_environment):
        import index

        ou = index.get_ou(aws_environment['org_account_id'])
        # Verify attribute access works (the bug we fixed)
        assert hasattr(ou, 'Id')
        assert isinstance(ou.Id, str)


class TestGetApproverGroupsForId:
    """Tests for get_approver_groups_for_id() - DynamoDB approver lookup"""

    def test_returns_group_ids_when_approver_exists(self, aws_environment):
        import index

        group_id = aws_environment['group_id']
        account_id = aws_environment['org_account_id']

        # Set up approver mapping in DynamoDB
        aws_environment['dynamodb_tables']['approvers'].put_item(Item={
            'id': account_id,
            'type': 'Account',
            'name': 'TestAccount',
            'groupIds': [group_id]
        })

        result = index.get_approver_groups_for_id(account_id)
        assert result == [group_id]

    def test_returns_empty_list_when_no_approver(self, aws_environment):
        import index

        result = index.get_approver_groups_for_id('nonexistent-id')
        assert result == []


class TestGetApproverGroupIds:
    """Tests for get_approver_group_ids() - combined account + OU approver lookup"""

    def test_returns_account_approvers(self, aws_environment):
        import index

        group_id = aws_environment['group_id']
        account_id = aws_environment['org_account_id']

        # Set up approver for account only
        aws_environment['dynamodb_tables']['approvers'].put_item(Item={
            'id': account_id,
            'type': 'Account',
            'name': 'TestAccount',
            'groupIds': [group_id]
        })

        result = index.get_approver_group_ids(account_id)
        assert group_id in result

    def test_returns_ou_approvers(self, aws_environment):
        import index

        group_id = aws_environment['group_id']
        account_id = aws_environment['org_account_id']
        ou_id = aws_environment['ou_id']

        # Set up approver for OU only (not account)
        aws_environment['dynamodb_tables']['approvers'].put_item(Item={
            'id': ou_id,
            'type': 'OU',
            'name': 'TestOU',
            'groupIds': [group_id]
        })

        result = index.get_approver_group_ids(account_id)
        assert group_id in result

    def test_returns_empty_when_no_approvers(self, aws_environment):
        import index

        result = index.get_approver_group_ids(aws_environment['org_account_id'])
        assert result == []


class TestGetApproversDetails:
    """Tests for get_approvers_details() - full approver resolution"""

    def test_resolves_approver_emails(self, aws_environment):
        import index

        group_id = aws_environment['group_id']
        account_id = aws_environment['org_account_id']

        # Set up approver mapping
        aws_environment['dynamodb_tables']['approvers'].put_item(Item={
            'id': account_id,
            'type': 'Account',
            'name': 'TestAccount',
            'groupIds': [group_id]
        })

        result = index.get_approvers_details(account_id)
        assert 'test@example.com' in result.approvers
        assert len(result.approver_ids) > 0

    def test_returns_empty_when_no_approvers(self, aws_environment):
        import index

        result = index.get_approvers_details(aws_environment['org_account_id'])
        assert result.approvers == []
        assert result.approver_ids == []


class TestGetPsDuration:
    """Tests for get_ps_duration() - permission set session duration lookup"""

    def _create_permission_set(self, index):
        """Create permission set using the module's own SSO client"""
        instances = index.sso_admin.list_instances()
        instance_arn = instances['Instances'][0]['InstanceArn']
        ps = index.sso_admin.create_permission_set(
            Name='TestPS',
            InstanceArn=instance_arn,
            SessionDuration='PT8H'
        )
        return ps['PermissionSet']['PermissionSetArn']

    def test_returns_session_duration(self, aws_environment):
        import index

        ps_arn = self._create_permission_set(index)
        result = index.get_ps_duration(ps_arn)
        assert result == 'PT8H'


class TestUpdateRequestDetails:
    """Tests for update_request_details() - full enrichment orchestration"""

    def test_enriches_request_with_all_details(self, aws_environment):
        import index
        index.settings.auth_team_userpoolid = aws_environment['user_pool_id']

        group_id = aws_environment['group_id']
        account_id = aws_environment['org_account_id']

        # Create permission set using the module's own SSO client
        instances = index.sso_admin.list_instances()
        instance_arn = instances['Instances'][0]['InstanceArn']
        ps = index.sso_admin.create_permission_set(
            Name='EnrichTestPS',
            InstanceArn=instance_arn,
            SessionDuration='PT4H'
        )
        permission_set_arn = ps['PermissionSet']['PermissionSetArn']

        # Create a request in DynamoDB
        request_id = 'test-enrichment-request'
        aws_environment['dynamodb_tables']['requests'].put_item(Item={
            'id': request_id,
            'username': 'testuser',
            'accountId': account_id,
            'roleId': permission_set_arn,
            'status': 'pending'
        })

        # Set up approver mapping
        aws_environment['dynamodb_tables']['approvers'].put_item(Item={
            'id': account_id,
            'type': 'Account',
            'name': 'TestAccount',
            'groupIds': [group_id]
        })

        # Run enrichment
        index.update_request_details(request_id, 'testuser', account_id, permission_set_arn)

        # Verify the request was updated
        result = aws_environment['dynamodb_tables']['requests'].get_item(
            Key={'id': request_id}
        )
        item = result['Item']
        assert item['email'] == 'test@example.com'
        assert 'test@example.com' in item['approvers']
        assert item['session_duration'] == 'PT4H'
