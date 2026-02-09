# © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
# This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
# http://aws.amazon.com/agreement or other written agreement between Customer and either
# Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
"""
Pre-Token Generation Lambda handler for Cognito.
This is a separate Lambda to avoid circular dependencies with the main backend.
"""
import os
import boto3
from typing import Dict, Any, List, Optional

from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext

# Boto3 type stubs
from types_boto3_sso_admin import SSOAdminClient
from types_boto3_identitystore import IdentityStoreClient
from types_boto3_dynamodb import DynamoDBServiceResource
from types_boto3_dynamodb.service_resource import Table

# Initialize logger
logger = Logger(service="elevator-pretoken", level="INFO")

# Environment variables with defaults
SETTINGS_TABLE = os.environ.get('SETTINGS_TABLE', '')
ELEVATOR_ADMIN_GROUP = os.environ.get('ELEVATOR_ADMIN_GROUP', 'Admin')
ELEVATOR_AUDITOR_GROUP = os.environ.get('ELEVATOR_AUDITOR_GROUP', 'Auditors')
IDC_REGION = os.environ.get('IDC_REGION') or None

# Initialize AWS clients
sso_admin: SSOAdminClient = boto3.client('sso-admin', region_name=IDC_REGION)
identitystore: IdentityStoreClient = boto3.client('identitystore', region_name=IDC_REGION)
dynamodb: DynamoDBServiceResource = boto3.resource('dynamodb')

# Cache SSO instance
_sso_instance: Optional[Dict[str, Any]] = None


def get_sso_instance() -> Dict[str, Any]:
    """Get SSO instance with caching"""
    global _sso_instance
    if _sso_instance is None:
        response = sso_admin.list_instances()
        if not response.get('Instances'):
            raise ValueError("No SSO instances found")
        _sso_instance = response['Instances'][0]
    return _sso_instance


def get_user_id(identity_store_id: str, username: str) -> str:
    """Get user ID from Identity Center"""
    response = identitystore.get_user_id(
        IdentityStoreId=identity_store_id,
        AlternateIdentifier={
            'UniqueAttribute': {
                'AttributePath': 'userName',
                'AttributeValue': username
            },
        }
    )
    return response['UserId']


def list_idc_group_membership(identity_store_id: str, user_id: str) -> List[Dict[str, Any]]:
    """List Identity Center group memberships for user"""
    paginator = identitystore.get_paginator('list_group_memberships_for_member')
    all_groups = []
    for page in paginator.paginate(
        IdentityStoreId=identity_store_id,
        MemberId={'UserId': user_id}
    ):
        all_groups.extend(page['GroupMemberships'])
    return all_groups


def get_group_id(identity_store_id: str, group_name: str) -> Optional[str]:
    """Get group ID by display name"""
    try:
        response = identitystore.get_group_id(
            IdentityStoreId=identity_store_id,
            AlternateIdentifier={
                'UniqueAttribute': {
                    'AttributePath': 'DisplayName',
                    'AttributeValue': group_name
                }
            }
        )
        return response['GroupId']
    except identitystore.exceptions.ResourceNotFoundException:
        logger.warning(f"Group '{group_name}' not found in Identity Store")
        return None


@logger.inject_lambda_context
def handler(event: Dict[str, Any], context: LambdaContext) -> Dict[str, Any]:
    """
    Pre-token generation handler for Cognito triggers.
    Adds custom claims (userId, groupIds, groups) to the ID token.
    """
    trigger_source = event.get('triggerSource', '')
    logger.info("Processing Cognito pre-token generation", extra={"trigger_source": trigger_source})

    if not trigger_source.startswith(('TokenGeneration_', 'PreTokenGeneration_')):
        # Return event unchanged for non-token-generation trigger sources
        return event

    try:
        # Get SSO instance
        sso_instance = get_sso_instance()
        identity_store_id = sso_instance['IdentityStoreId']

        # Get group names from settings table or use defaults
        elevator_admin_group = ELEVATOR_ADMIN_GROUP
        elevator_auditor_group = ELEVATOR_AUDITOR_GROUP

        if SETTINGS_TABLE:
            settings_table: Table = dynamodb.Table(SETTINGS_TABLE)
            settings_response = settings_table.get_item(Key={"id": "settings"})
            item_settings = settings_response.get('Item') or {}
            if item_settings:
                elevator_admin_group = item_settings.get('teamAdminGroup') or elevator_admin_group
                elevator_auditor_group = item_settings.get('teamAuditorGroup') or elevator_auditor_group

        # Extract username from Cognito event (format: provider_username)
        user_name = event['userName']
        # For federated users, the format is "provider_username"
        if '_' in user_name:
            user = user_name.split("_", 1)[1]
        else:
            user = user_name

        # Get user ID from Identity Center
        user_id = get_user_id(identity_store_id, user)
        if not user_id:
            logger.warning(f"User '{user}' not found in Identity Center")
            return event

        # Get Admin and Auditor group IDs
        admin_group_id = get_group_id(identity_store_id, elevator_admin_group)
        auditor_group_id = get_group_id(identity_store_id, elevator_auditor_group)

        # Get user's group memberships
        groups = []
        group_ids = []

        group_memberships = list_idc_group_membership(identity_store_id, user_id)
        for membership in group_memberships:
            group_id = membership.get('GroupId')
            if group_id:
                group_ids.append(group_id)
                if group_id == admin_group_id:
                    groups.append("Admin")
                elif group_id == auditor_group_id:
                    groups.append("Auditors")

        # Add custom claims to the token
        event["response"] = {
            "claimsOverrideDetails": {
                "claimsToAddOrOverride": {
                    "userId": user_id,
                    "groupIds": ",".join(group_ids),
                    "groups": ",".join(groups)
                },
                "groupOverrideDetails": {
                    "groupsToOverride": groups,
                },
            }
        }

        logger.info("Pre-token generation complete", extra={
            "user_id": user_id,
            "groups": groups,
            "group_count": len(group_ids)
        })

        return event

    except Exception as e:
        logger.error(f"Error in pre-token generation: {str(e)}")
        # Return event unchanged on error to allow authentication to proceed
        return event
