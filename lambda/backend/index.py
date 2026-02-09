# © 2023 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
# This AWS Content is provided subject to the terms of the AWS Customer Agreement available at
# http://aws.amazon.com/agreement or other written agreement between Customer and either
# Amazon Web Services, Inc. or Amazon Web Services EMEA SARL or both.
import json
import uuid
import boto3
from datetime import datetime, timezone, timedelta
from dateutil import parser, tz
from botocore.exceptions import ClientError
from botocore.config import Config
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from typing import Dict, Any, List, Optional
import requests as http_requests

# Boto3 type stubs
from types_boto3_dynamodb import DynamoDBServiceResource
from types_boto3_dynamodb.service_resource import Table
from types_boto3_sso_admin import SSOAdminClient
from types_boto3_events import EventBridgeClient
from types_boto3_organizations import OrganizationsClient
from types_boto3_identitystore import IdentityStoreClient
from types_boto3_cognito_idp import CognitoIdentityProviderClient
from types_boto3_ses import SESClient
from types_boto3_sns import SNSClient
from types_boto3_cloudtrail import CloudTrailClient

# AWS Powertools imports
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver, CORSConfig
from aws_lambda_powertools.event_handler.exceptions import NotFoundError, BadRequestError
from aws_lambda_powertools.utilities.typing import LambdaContext
from aws_lambda_powertools.utilities.data_classes import APIGatewayProxyEventV2

# Pydantic models for type safety
from models.db_models import (
    RequestItem,
    SessionItem,
    SettingsItem,
    EligibilityItem,
)
from models.event_models import (
    CognitoPreTokenGenerationEvent,
)
from models.aws_models import (
    SSOInstance,
    AccountInfo,
    PermissionSetInfo,
    GroupInfo,
    UserInfo,
    OUInfo,
    GroupMembership,
)
from models.api_models import (
    NotificationEvent,
    GrantResponse,
    RevokeResponse,
    CreateRequestInput,
    UpdateRequestInput,
    UpdateSessionInput,
    UserPolicyRequest,
    GrantRequestResponse,
    RevokeRequestResponse,
    EntitlementResponse,
    EntitlementPolicy,
    EligibilityCheckResult,
    UpdateSettingsInput,
    CreateApproverInput,
    UpdateApproverInput,
    ApproverResponse,
    ApproversListResponse,
    CreateEligibilityInput,
    EligibilityResponse,
    EligibilityListResponse,
    CreateIntegrationInput,
    UpdateIntegrationInput,
    IntegrationResponse,
    IntegrationListResponse,
    OnCallUser,
    OnCallResponse,
)
from models.utility_models import (
    ParsedARN,
    NotificationConfig,
    SettingsConfig,
    ApproverDetails,
    CloudTrailLogEntry,
    CloudTrailQueryResponse,
    ManagementPermissionsResponse,
    DynamoDBScanResponse,
    SuccessResponse,
)
from models.settings_models import EnvironmentSettings

# Initialize environment settings
settings = EnvironmentSettings()

# Initialize AWS Powertools
logger = Logger(service="team-backend", level="INFO")

# Initialize HTTP API Gateway resolver with validation enabled
cors = CORSConfig(allow_origin="*", allow_headers=["*"], max_age=86400)
app = APIGatewayHttpResolver(enable_validation=True, cors=cors)

# Initialize AWS clients
dynamodb: DynamoDBServiceResource = boto3.resource('dynamodb')
sso_admin: SSOAdminClient = boto3.client('sso-admin', region_name=settings.idc_region)
events: EventBridgeClient = boto3.client('events')
organizations: OrganizationsClient = boto3.client('organizations')
identitystore: IdentityStoreClient = boto3.client('identitystore', region_name=settings.idc_region)
cognito: CognitoIdentityProviderClient = boto3.client('cognito-idp', config=Config(user_agent_extra="team-idc"))
ses: SESClient = boto3.client('ses')
sns: SNSClient = boto3.client('sns')
session = boto3.Session()

# Initialize DynamoDB tables
requests_table: Table = dynamodb.Table(settings.requests_table)
sessions_table: Table = dynamodb.Table(settings.sessions_table)
approvers_table: Table = dynamodb.Table(settings.approvers_table)
settings_table: Table = dynamodb.Table(settings.settings_table)
eligibility_table: Table = dynamodb.Table(settings.eligibility_table)
policy_table: Table = dynamodb.Table(settings.policy_table_name)
integrations_table: Table = dynamodb.Table(settings.integrations_table)

# Cache SSO instance
_sso_instance: Optional[SSOInstance] = None


def get_sso_instance() -> SSOInstance:
    """Get SSO instance with caching"""
    global _sso_instance
    if _sso_instance is None:
        response = sso_admin.list_instances()
        if not response.get('Instances'):
            raise ValueError("No SSO instances found")
        instance_data = response['Instances'][0]
        # instance_data is a TypedDict (dict), can be passed directly to Pydantic
        _sso_instance = SSOInstance(**instance_data)
    return _sso_instance

# Cache management account ID
_mgmt_account_id: Optional[str] = None


def get_mgmt_account_id() -> str:
    """Get management account ID with caching"""
    global _mgmt_account_id
    if _mgmt_account_id is None:
        response = organizations.describe_organization()
        _mgmt_account_id = response['Organization']['MasterAccountId']
    return _mgmt_account_id


# =============================================================================
# Helper Functions
# =============================================================================

def parse_arn(arn: str) -> ParsedARN:
    """Parse ARN into components"""
    elements = arn.split(":")
    result_data: Dict[str, Optional[str]] = {
        "arn": elements[0],
        "partition": elements[1],
        "service": elements[2],
        "region": elements[3],
        "account": elements[4],
    }
    if len(elements) == 7:
        result_data["resourcetype"], result_data["resource"] = elements[5:]
    elif "/" not in elements[5]:
        result_data["resource"] = elements[5]
        result_data["resourcetype"] = None
    else:
        result_data["resourcetype"], result_data["resource"] = elements[5].split("/")
    return ParsedARN(**result_data)


def update_request_directly(input_data: UpdateRequestInput) -> None:
    """Update request directly in DynamoDB"""
    data_dict = input_data.model_dump(exclude_none=True)
    
    request_id = data_dict.get('id')
    if not request_id:
        return

    update_expr: List[str] = []
    expr_names: Dict[str, str] = {}
    expr_values: Dict[str, Any] = {}

    for idx, (key, value) in enumerate(data_dict.items()):
        if key != 'id':
            update_expr.append(f'#attr{idx} = :val{idx}')
            expr_names[f'#attr{idx}'] = key
            expr_values[f':val{idx}'] = value

    if update_expr:
        requests_table.update_item(
            Key={'id': request_id},
            UpdateExpression='SET ' + ', '.join(update_expr),
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values
        )


# =============================================================================
# Notification Functions
# =============================================================================

def send_ses_notification(
    source_email: str,
    source_arn: Optional[str],
    subject: str,
    message_html: str,
    to_addresses: List[str],
    cc_addresses: List[str]
) -> None:
    """Send email notification via SES"""
    if source_arn:
        parsed = parse_arn(source_arn)
        ses_region = parsed.region
        ses_client = session.client("ses", region_name=ses_region)
        ses_client.send_email(
            Source=source_email,
            SourceArn=source_arn,
            Destination={"ToAddresses": to_addresses, "CcAddresses": cc_addresses},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Html": {"Data": message_html, "Charset": "UTF-8"}},
            },
        )
    else:
        ses_client = session.client("ses")
        ses_client.send_email(
            Source=source_email,
            Destination={"ToAddresses": to_addresses, "CcAddresses": cc_addresses},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Html": {"Data": message_html, "Charset": "UTF-8"}},
            },
        )


def send_sns_notification(notification_topic_arn: str, message: str, subject: str) -> None:
    """Send notification via SNS"""
    sns.publish(
        TopicArn=notification_topic_arn,
        Message=message,
        Subject=subject,
    )


def send_slack_notifications(recipients, message, audit_message, login_url, request_start_time, role, account, duration_hours, justification, ticket):
    """Send Slack notifications"""
    logger.info("Sending Slack notifications", extra={"recipients": recipients, "account": account, "role": role})
    settings_response = settings_table.get_item(Key={"id": "settings"})
    item_settings = settings_response.get('Item') or {}
    slack_token = item_settings.get("slackToken", "")
    slack_audit_notifications_channel = item_settings.get("slackAuditNotificationsChannel", "")
    if not slack_token:
        logger.warning("Slack token not configured, skipping notifications")
        return
    slack_client = WebClient(token=slack_token)

    parsed_date = parser.parse(request_start_time)
    sent_count = 0
    failed_count = 0

    for recipient in recipients:
        try:
            recipient_slack_user = slack_client.users_lookupByEmail(email=recipient)
            recipient_slack_id = recipient_slack_user["user"]["id"]
            recipient_timezone = tz.gettz(name=recipient_slack_user["user"]["tz"])

            localized_date = parsed_date.astimezone(recipient_timezone)
            formatted_date = localized_date.strftime("%B %d, %Y at %I:%M %p %Z")

            message_blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*{message}*"},
                    "accessory": {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Open Elevator"},
                        "url": login_url,
                        "action_id": "button-action",
                    },
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Account:*\n{account}"},
                        {"type": "mrkdwn", "text": f"*Start time:*\n{formatted_date}"},
                        {"type": "mrkdwn", "text": f"*Role:*\n{role}"},
                        {"type": "mrkdwn", "text": f"*Duration:*\n{duration_hours} hours"},
                        {"type": "mrkdwn", "text": f"*Justification:*\n{justification}"},
                        {"type": "mrkdwn", "text": f"*Ticket Number:*\n{ticket}"},
                    ],
                },
            ]

            slack_client.chat_postMessage(
                channel=recipient_slack_id,
                blocks=message_blocks,
                text="AWS Access Request Notification",
            )
            sent_count += 1
            logger.info("Slack notification sent", extra={"recipient": recipient, "slack_id": recipient_slack_id})
        except SlackApiError as e:
            failed_count += 1
            logger.warning("Slack notification failed for recipient", extra={"recipient": recipient, "error": e.response["error"]})

    logger.info("Slack notifications complete", extra={"sent": sent_count, "failed": failed_count, "total": len(recipients)})

    if slack_audit_notifications_channel and audit_message:
        try:
            slack_client.chat_postMessage(
                channel=slack_audit_notifications_channel,
                text="AWS Access Request Audit Notification",
                blocks=[
                    {
                        "type": "section",
                        "text": {"type": "mrkdwn", "text": f"*{audit_message}*"},
                        "accessory": {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "Open Elevator"},
                            "url": login_url,
                            "action_id": "button-action",
                        },
                    },
                    {
                        "type": "section",
                        "fields": [
                            {"type": "mrkdwn", "text": f"*Account:*\n{account}"},
                            {"type": "mrkdwn", "text": f"*Start time:*\n{formatted_date}"},
                            {"type": "mrkdwn", "text": f"*Role:*\n{role}"},
                            {"type": "mrkdwn", "text": f"*Duration:*\n{duration_hours} hours"},
                            {"type": "mrkdwn", "text": f"*Justification:*\n{justification}"},
                            {"type": "mrkdwn", "text": f"*Ticket Number:*\n{ticket}"},
                        ],
                    },
                ],
            )
        except SlackApiError as e:
            logger.warning("Slack audit notification failed", extra={"channel": slack_audit_notifications_channel, "error": e.response["error"]})


def handle_notifications(event: NotificationEvent) -> None:
    """Handle notification sending"""
    notification_event = event

    settings_response = settings_table.get_item(Key={"id": "settings"})
    item_settings = settings_response.get('Item') or {}
    settings_obj = SettingsItem(**item_settings) if item_settings else SettingsItem(
        id="settings",
        sesNotificationsEnabled=False,
        snsNotificationsEnabled=False,
        slackNotificationsEnabled=False
    )
    
    ses_notifications_enabled = notification_event.ses_notifications_enabled if notification_event.ses_notifications_enabled is not None else settings_obj.sesNotificationsEnabled
    ses_source_email = notification_event.ses_source_email or settings_obj.sesSourceEmail or ""
    ses_source_arn = notification_event.ses_source_arn or settings_obj.sesSourceArn or ""
    sns_notifications_enabled = notification_event.sns_notifications_enabled if notification_event.sns_notifications_enabled is not None else settings_obj.snsNotificationsEnabled
    notification_topic_arn = notification_event.notification_topic_arn or settings.sns_topic_arn
    slack_notifications_enabled = notification_event.slack_notifications_enabled if notification_event.slack_notifications_enabled is not None else settings_obj.slackNotificationsEnabled
    
    if not ((ses_notifications_enabled and ses_source_email) or (sns_notifications_enabled and notification_topic_arn) or slack_notifications_enabled):
        return
    
    approval_required = notification_event.approvalRequired
    request_status = notification_event.status
    granted = notification_event.grant and notification_event.grant.get("AccountAssignmentCreationStatus", {}).get("Status", "") == "IN_PROGRESS" if notification_event.grant else False
    ended = notification_event.revoke and notification_event.revoke.get("AccountAssignmentDeletionStatus", {}).get("Status", "") == "IN_PROGRESS" if notification_event.revoke else False
    
    if ended:
        request_status = "ended"
    if (request_status in ["approved", "pending"]) and granted and not ended:
        request_status = "granted"
    if not granted and not approval_required:
        request_status = "scheduled"
    
    requester = notification_event.email
    approvers = notification_event.approvers or []
    account = f'{notification_event.accountName} ({notification_event.accountId})'
    role = notification_event.role
    request_start_time = notification_event.startTime
    duration_hours = notification_event.time
    justification = notification_event.justification or "No justification provided"
    ticket = notification_event.ticketNo or "No ticket provided"
    login_url = notification_event.elevator_login_url or settings.elevator_login_url
    request_id = notification_event.id or ""
    # Build context-aware deep links
    if request_id and login_url:
        if request_status == "pending":
            deep_link = f"{login_url}approvals/approve/{request_id}"
        else:
            deep_link = f"{login_url}requests/view/{request_id}"
    else:
        deep_link = login_url
    sns_message = json.dumps(notification_event.model_dump())
    slack_audit_message = ""

    if request_status == "pending" and approval_required:
        slack_recipients = approvers
        slack_message = f"<mailto:{requester}|{requester}> requests access to AWS, please approve or reject this request in Elevator."
        slack_audit_message = f"<mailto:{requester}|{requester}> has requested access to AWS"
        email_to_addresses = approvers
        email_cc_addresses = [requester]
        subject = f"Access request to AWS account - {account}"
        email_message_html = f'<html><body><p><b>{requester}</b> requests access to AWS, please <b>approve or reject this request</b> in <a href="{deep_link}">Elevator</a>.</p><p><b>Account:</b> {account}<br /><b>Role:</b> {role}<br /><b>Start Time:</b> {request_start_time}<br /><b>Duration:</b> {duration_hours} hours<br /><b>Justification:</b> {justification}<br /><b>Ticket Number:</b> {ticket}<br /></p></body></html>'
    elif request_status == "scheduled":
        if datetime.now(timezone.utc) > parser.parse(request_start_time).astimezone(timezone.utc):
            return
        slack_recipients = [requester]
        slack_message = "Your AWS access session is scheduled."
        email_to_addresses = [requester]
        email_cc_addresses = []
        subject = f"Scheduled access session for {account}"
        email_message_html = f'<html><body><p>Your AWS access session is scheduled, please open <a href="{deep_link}">Elevator</a> to manage requests.</p><p><b>Account:</b> {account}<br /><b>Role:</b> {role}<br /><b>Start Time:</b> {request_start_time}<br /><b>Duration:</b> {duration_hours} hours<br /><b>Justification:</b> {justification}<br /><b>Ticket Number:</b> {ticket}<br /></p></body></html>'
    elif request_status == "expired":
        slack_recipients = [requester]
        slack_message = "Your AWS access request has expired."
        email_to_addresses = [requester]
        email_cc_addresses = approvers if approval_required else []
        subject = f"Expired access request for {account}"
        email_message_html = f'<html><body><p>Your AWS access request has expired, please open <a href="{deep_link}">Elevator</a> to submit a new request.</p><p><b>Account:</b> {account}<br /><b>Role:</b> {role}<br /><b>Start Time:</b> {request_start_time}<br /><b>Duration:</b> {duration_hours} hours<br /><b>Justification:</b> {justification}<br /><b>Ticket Number:</b> {ticket}<br /></p></body></html>'
    elif request_status == "ended":
        slack_recipients = [requester]
        slack_message = "Your AWS access session has ended."
        email_to_addresses = [requester]
        email_cc_addresses = approvers if approval_required else []
        subject = f"AWS access session ended for {account}"
        email_message_html = f'<html><body><p>Your AWS access session has ended, please open <a href="{deep_link}">Elevator</a> to view session activity logs.</p><p><b>Account:</b> {account}<br /><b>Role:</b> {role}<br /><b>Start Time:</b> {request_start_time}<br /><b>Duration:</b> {duration_hours} hours<br /><b>Justification:</b> {justification}<br /><b>Ticket Number:</b> {ticket}<br /></p></body></html>'
    elif request_status == "granted":
        slack_recipients = [requester]
        slack_message = "Your AWS access session has started."
        email_to_addresses = [requester]
        email_cc_addresses = approvers if approval_required else []
        subject = f"AWS access session started for {account}"
        email_message_html = f'<html><body><p>Your AWS access session has started. Open <a href="{deep_link}">Elevator</a> to manage AWS access requests.</p><p><b>Account:</b> {account}<br /><b>Role:</b> {role}<br /><b>Start Time:</b> {request_start_time}<br /><b>Duration:</b> {duration_hours} hours<br /><b>Justification:</b> {justification}<br /><b>Ticket Number:</b> {ticket}<br /></p></body></html>'
    elif request_status == "approved":
        approver_email = notification_event.approver or ""
        slack_recipients = approvers + [requester]
        slack_message = f"AWS access request was approved by {approver_email}."
        email_to_addresses = [requester]
        email_cc_addresses = approvers
        subject = f"AWS access request approved for {account}"
        slack_audit_message = f"AWS access request by <mailto:{requester}|{requester}> was approved by {approver_email}"
        email_message_html = f'<html><body><p>Your AWS access request has been approved by {approver_email}. You will receive a notification when the session has started. Open <a href="{deep_link}">Elevator</a> to manage AWS access requests.</p><p><b>Account:</b> {account}<br /><b>Role:</b> {role}<br /><b>Start Time:</b> {request_start_time}<br /><b>Duration:</b> {duration_hours} hours<br /><b>Justification:</b> {justification}<br /><b>Ticket Number:</b> {ticket}<br /></p></body></html>'
    elif request_status == "rejected":
        approver_email = notification_event.approver or ""
        slack_recipients = approvers + [requester]
        slack_message = "AWS access request was rejected."
        slack_audit_message = f"AWS access request by <mailto:{requester}|{requester}> was rejected by {approver_email}"
        email_to_addresses = [requester]
        email_cc_addresses = approvers
        subject = f"AWS access request rejected for {account}"
        email_message_html = f'<html><body><p>Your AWS access request has been rejected. Open <a href="{deep_link}">Elevator</a> to manage AWS access requests.</p><p><b>Account:</b> {account}<br /><b>Role:</b> {role}<br /><b>Start Time:</b> {request_start_time}<br /><b>Duration:</b> {duration_hours} hours<br /><b>Justification:</b> {justification}<br /><b>Ticket Number:</b> {ticket}<br /></p></body></html>'
    elif request_status == "cancelled":
        slack_recipients = approvers
        slack_message = f"{requester} cancelled this AWS access request."
        email_to_addresses = approvers
        email_cc_addresses = [requester]
        subject = f"AWS access request cancelled for {account}"
        slack_audit_message = f"AWS access request by <mailto:{requester}|{requester}> was cancelled"
        email_message_html = f'<html><body><p>{requester} cancelled an AWS access request. Open <a href="{deep_link}">Elevator</a> to manage AWS access requests.</p><p><b>Account:</b> {account}<br /><b>Role:</b> {role}<br /><b>Start Time:</b> {request_start_time}<br /><b>Duration:</b> {duration_hours} hours<br /><b>Justification:</b> {justification}<br /><b>Ticket Number:</b> {ticket}<br /></p></body></html>'
    elif request_status == "error":
        status_error = notification_event.statusError or ""
        slack_recipients = approvers + [requester] if approvers else [requester]
        slack_message = f"Error handling AWS access for {requester}. Error details: {status_error}"
        email_to_addresses = [ses_source_email] if ses_source_email else [requester]
        email_cc_addresses = approvers + [requester] if approvers else [requester]
        subject = f"Error handling AWS access for {account}"
        email_message_html = f'<html><body><p>Elevator encountered an error handling AWS access for {requester}. Please review the Step Function logs to troubleshoot the error and ensure access is properly granted or revoked. Open <a href="{deep_link}">Elevator</a> to view additional details.</p><p><b>Error Details:</b> {status_error}<br /></p><p><b>Account:</b> {account}<br /><b>Role:</b> {role}<br /><b>Start Time:</b> {request_start_time}<br /><b>Duration:</b> {duration_hours} hours<br /><b>Justification:</b> {justification}<br /><b>Ticket Number:</b> {ticket}<br /></p></body></html>'
    else:
        return
    
    logger.info("Dispatching notifications", extra={
        "request_status": request_status,
        "requester": requester,
        "account": account,
        "ses_enabled": ses_notifications_enabled and bool(ses_source_email),
        "sns_enabled": sns_notifications_enabled and bool(notification_topic_arn),
        "slack_enabled": slack_notifications_enabled,
    })

    if ses_notifications_enabled and ses_source_email:
        send_ses_notification(
            source_email=ses_source_email,
            source_arn=ses_source_arn,
            message_html=email_message_html,
            subject=subject,
            to_addresses=email_to_addresses,
            cc_addresses=email_cc_addresses,
        )

    if sns_notifications_enabled and notification_topic_arn:
        send_sns_notification(
            message=sns_message,
            subject=subject,
            notification_topic_arn=notification_topic_arn,
        )

    if slack_notifications_enabled:
        send_slack_notifications(
            recipients=slack_recipients,
            message=slack_message,
            audit_message=slack_audit_message,
            login_url=deep_link,
            role=role,
            account=account,
            request_start_time=request_start_time,
            duration_hours=duration_hours,
            justification=justification,
            ticket=ticket,
        )


# =============================================================================
# Step Functions Task Handlers
# =============================================================================

def task_grant(event: RequestItem, instance_arn: Optional[str] = None) -> GrantResponse:
    """Handle grant task - create SSO account assignment and schedule revoke"""
    request = event
    request_id = request.id
    logger.info("Processing grant task", extra={"request_id": request_id})

    try:
        sso_instance = get_sso_instance()
        # Use provided instance_arn or get from SSO instance
        if not instance_arn:
            instance_arn = sso_instance.InstanceArn
        permission_set_arn = request.roleId
        principal_id = request.userId
        account_id = request.accountId
        request_id = request.id
        # Duration is in hours, convert to seconds
        duration_hours = int(request.time or request.duration or '1')
        duration_seconds = duration_hours * 3600
        
        response = sso_admin.create_account_assignment(
            InstanceArn=instance_arn,
            TargetId=account_id,
            TargetType='AWS_ACCOUNT',
            PermissionSetArn=permission_set_arn,
            PrincipalType='USER',
            PrincipalId=principal_id
        )
        
        current_time = datetime.now(timezone.utc).isoformat()
        requests_table.update_item(
            Key={'id': request_id},
            UpdateExpression='SET startTime = :time, #status = :status',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':time': current_time, ':status': 'in_progress'}
        )
        
        # Prepare notification event
        notification_dict = request.model_dump()
        notification_dict['status'] = 'granted'
        notification_event = NotificationEvent(**notification_dict)
        handle_notifications(notification_event)
        logger.info("Access granted successfully", extra={"request_id": request_id})

        # Update status to granted in DynamoDB
        requests_table.update_item(
            Key={'id': request_id},
            UpdateExpression='SET #status = :status',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':status': 'granted'}
        )

        # Schedule revoke task using EventBridge
        if duration_seconds > 0:
            logger.info("Scheduling revoke task", extra={"request_id": request_id, "duration_seconds": duration_seconds})
            try:
                revoke_time = datetime.now(timezone.utc) + timedelta(seconds=duration_seconds)
                # Create revoke event data for EventBridge
                revoke_event_data = {
                    'id': request_id,
                    'roleId': permission_set_arn,
                    'userId': principal_id,
                    'accountId': account_id,
                }

                # Create a one-time scheduled rule
                rule_name = f'{settings.revoke_rule_name}-{request_id}'
                events.put_rule(
                    Name=rule_name,
                    ScheduleExpression=f'at({revoke_time.strftime("%Y-%m-%dT%H:%M:%S")})',
                    State='ENABLED',
                    Description=f'Revoke access for request {request_id}'
                )

                # Add Lambda target - use revocation function ARN if available, otherwise fallback
                revocation_arn = settings.revocation_function_arn
                events.put_targets(
                    Rule=rule_name,
                    Targets=[{
                        'Id': '1',
                        'Arn': revocation_arn,
                        'Input': json.dumps(revoke_event_data)
                    }]
                )
            except ClientError as schedule_error:
                # Log the error but don't fail the grant operation
                # This can happen in test environments (moto) that don't support all EventBridge features
                logger.warning("Failed to schedule revoke task", extra={"request_id": request_id, "error": str(schedule_error)})
        
        return GrantResponse(
            statusCode=200,
            grant=response,
            status='success'
        )
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code in ['ThrottlingException', 'ServiceUnavailable', 'InternalServerError']:
            raise
        requests_table.update_item(
            Key={'id': request_id},
            UpdateExpression='SET #status = :status, #error = :error',
            ExpressionAttributeNames={'#status': 'status', '#error': 'error'},
            ExpressionAttributeValues={':status': 'error', ':error': str(e)}
        )
        notification_dict = request.model_dump()
        notification_dict['status'] = 'error'
        notification_dict['statusError'] = str(e)
        notification_event = NotificationEvent(**notification_dict)
        handle_notifications(notification_event)
        raise


def task_revoke(event: RequestItem, instance_arn: Optional[str] = None, result: Optional[bool] = None) -> RevokeResponse:
    """Handle revoke task - delete SSO account assignment"""
    request = event
    request_id = request.id
    logger.info("Processing revoke task", extra={"request_id": request_id})

    try:
        sso_instance = get_sso_instance()
        # Use provided instance_arn or get from SSO instance
        if not instance_arn:
            instance_arn = sso_instance.InstanceArn
        permission_set_arn = request.roleId
        principal_id = request.userId
        account_id = request.accountId
        request_id = request.id
        
        request_response = requests_table.get_item(Key={'id': request_id})
        request_item = request_response.get('Item')
        if request_item:
            request_obj = RequestItem(**request_item)
            if request_obj.status == 'revoked' and result:
                return RevokeResponse(statusCode=200, revoke={}, status='already_revoked')
        
        response = sso_admin.delete_account_assignment(
            InstanceArn=instance_arn,
            TargetId=account_id,
            TargetType='AWS_ACCOUNT',
            PermissionSetArn=permission_set_arn,
            PrincipalType='USER',
            PrincipalId=principal_id
        )
        
        request_response = requests_table.get_item(Key={'id': request_id})
        request_item = request_response.get('Item')
        if request_item:
            request_obj = RequestItem(**request_item)
            if request_obj.status == 'revoked':
                current_time = datetime.now(timezone.utc).isoformat()
                requests_table.update_item(
                    Key={'id': request_id},
                    UpdateExpression='SET endTime = :time',
                    ExpressionAttributeValues={':time': current_time}
                )
            else:
                requests_table.update_item(
                    Key={'id': request_id},
                    UpdateExpression='SET #status = :status',
                    ExpressionAttributeNames={'#status': 'status'},
                    ExpressionAttributeValues={':status': 'revoked'}
                )
        
        # Prepare notification event
        notification_dict = request.model_dump()
        notification_dict['status'] = 'ended'
        notification_event = NotificationEvent(**notification_dict)
        handle_notifications(notification_event)

        return RevokeResponse(
            statusCode=200,
            revoke=response,
            status='success'
        )
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code in ['ThrottlingException', 'ServiceUnavailable', 'InternalServerError']:
            raise
        requests_table.update_item(
            Key={'id': request_id},
            UpdateExpression='SET #status = :status, #error = :error',
            ExpressionAttributeNames={'#status': 'status', '#error': 'error'},
            ExpressionAttributeValues={':status': 'error', ':error': str(e)}
        )
        notification_dict = request.model_dump()
        notification_dict['status'] = 'error'
        notification_dict['statusError'] = str(e)
        notification_event = NotificationEvent(**notification_dict)
        handle_notifications(notification_event)
        raise


# =============================================================================
# API Gateway Query Handlers
# =============================================================================

def handle_get_accounts() -> List[AccountInfo]:
    """Get all accounts"""
    mgmt_account_id = get_mgmt_account_id()
    deployed_in_mgmt = True if settings.account_id == mgmt_account_id else False
    accounts = []
    
    paginator = organizations.get_paginator('list_accounts')
    for page in paginator.paginate():
        for acct in page['Accounts']:
            if not deployed_in_mgmt:
                if acct['Id'] != mgmt_account_id:
                    accounts.append(AccountInfo(name=acct['Name'], id=acct['Id']))
            else:
                accounts.append(AccountInfo(name=acct['Name'], id=acct['Id']))

    return sorted(accounts, key=lambda x: x.name)


def handle_get_ou(account_id: str) -> OUInfo:
    """Get OU for an account"""
    response = organizations.list_parents(ChildId=account_id)
    parent_data = response['Parents'][0]
    return OUInfo(**parent_data)


def handle_get_ous() -> List[OUInfo]:
    """Get all OUs"""
    ous = []
    paginator = organizations.get_paginator('list_organizational_units_for_parent')
    roots = organizations.list_roots()
    root_id = roots['Roots'][0]['Id']
    
    for page in paginator.paginate(ParentId=root_id):
        for ou_data in page['OrganizationalUnits']:
            ous.append(OUInfo(**ou_data))
    
    return ous


def handle_get_permissions() -> List[PermissionSetInfo]:
    """Get permission sets"""
    sso_instance = get_sso_instance()
    instance_arn = sso_instance.InstanceArn
    permission_sets = []
    
    paginator = sso_admin.get_paginator('list_permission_sets')
    for page in paginator.paginate(InstanceArn=instance_arn):
        for ps_arn in page['PermissionSets']:
            ps_detail = sso_admin.describe_permission_set(
                InstanceArn=instance_arn,
                PermissionSetArn=ps_arn
            )
            permission_sets.append(PermissionSetInfo(
                id=ps_arn,
                name=ps_detail['PermissionSet']['Name']
            ))
    
    return permission_sets


def handle_get_idc_groups() -> List[GroupInfo]:
    """Get Identity Center groups"""
    sso_instance = get_sso_instance()
    identity_store_id = sso_instance.IdentityStoreId
    groups = []
    
    paginator = identitystore.get_paginator('list_groups')
    for page in paginator.paginate(IdentityStoreId=identity_store_id):
        for group_data in page['Groups']:
            # group_data is a TypedDict (dict), can be passed directly to Pydantic
            groups.append(GroupInfo(**group_data))
    
    return sorted(groups, key=lambda x: x.DisplayName)


def handle_get_users() -> List[UserInfo]:
    """Get Identity Center users"""
    sso_instance = get_sso_instance()
    identity_store_id = sso_instance.IdentityStoreId
    users = []
    
    paginator = identitystore.get_paginator('list_users')
    for page in paginator.paginate(IdentityStoreId=identity_store_id):
        for user_data in page['Users']:
            # user_data is a TypedDict (dict), can be passed directly to Pydantic
            users.append(UserInfo(**user_data))
    
    return sorted(users, key=lambda x: x.UserName)


def handle_get_entitlement(event: UserPolicyRequest) -> EntitlementResponse:
    """Get entitlement for user"""
    user_id = event.userId
    group_ids = event.groupIds or []
    username = event.username
    request_id = str(uuid.uuid4())
    
    eligibility = []
    max_duration = 0
    
    mgmt_account_id = get_mgmt_account_id()
    deployed_in_mgmt = True if settings.account_id == mgmt_account_id else False
    
    for id_val in [user_id] + group_ids:
        if not id_val:
            continue
        entitlement_response = policy_table.get_item(Key={"id": id_val})
        if not entitlement_response.get('Item'):
            continue
        entitlement_item = EligibilityItem(**entitlement_response['Item'])
        duration = entitlement_item.duration
        if int(duration) > max_duration:
            max_duration = int(duration)
        
        # Build accounts list from policy accounts
        accounts_list = [{"id": acc.id, "name": acc.name} for acc in entitlement_item.accounts]
        
        # Add accounts from OUs
        for ou in entitlement_item.ous:
            ou_accounts = []
            paginator = organizations.get_paginator('list_accounts_for_parent')
            for page in paginator.paginate(ParentId=ou.id):
                for acct in page['Accounts']:
                    if not deployed_in_mgmt:
                        if acct['Id'] != mgmt_account_id:
                            ou_accounts.append({"name": acct['Name'], "id": acct['Id']})
                    else:
                        ou_accounts.append({"name": acct['Name'], "id": acct['Id']})
            accounts_list.extend(ou_accounts)
        
        # Build permissions list
        permissions_list = [{"id": perm.id, "name": perm.name or ""} for perm in entitlement_item.permissions]
        
        policy = EntitlementPolicy(
            accounts=accounts_list,
            permissions=permissions_list,
            approvalRequired=entitlement_item.approvalRequired,
            duration=str(max_duration),
            autoApprovalOnCall=entitlement_item.autoApprovalOnCall
        )
        eligibility.append(policy)
    
    return EntitlementResponse(
        id=request_id,
        policy=eligibility,
        username=username
    )




def handle_get_mgmt_permissions() -> ManagementPermissionsResponse:
    """Get management account permission sets"""
    sso_instance = get_sso_instance()
    instance_arn = sso_instance.InstanceArn
    mgmt_account_id = get_mgmt_account_id()
    
    permission_sets = []
    paginator = sso_admin.get_paginator('list_permission_sets_provisioned_to_account')
    for page in paginator.paginate(
        InstanceArn=instance_arn,
        AccountId=mgmt_account_id
    ):
        permission_sets.extend(page.get('PermissionSets', []))
    
    return ManagementPermissionsResponse(permissions=permission_sets)


def handle_get_logs(query: str = '') -> CloudTrailQueryResponse:
    """Start CloudTrail Lake query"""
    cloudtrail: CloudTrailClient = boto3.client('cloudtrail')
    event_data_store_id = settings.event_data_store_arn.split('/')[-1] if settings.event_data_store_arn else ''

    response = cloudtrail.start_query(
        QueryStatement=query,
        EventDataStore=event_data_store_id
    )

    return CloudTrailQueryResponse(
        queryId=response['QueryId'],
        status='RUNNING'
    )


def handle_query_logs(query_id: str) -> List[CloudTrailLogEntry]:
    """Get CloudTrail Lake query results"""
    cloudtrail: CloudTrailClient = boto3.client('cloudtrail')
    event_data_store_id = settings.event_data_store_arn.split('/')[-1] if settings.event_data_store_arn else ''

    output = []
    paginator = cloudtrail.get_paginator('get_query_results')
    for page in paginator.paginate(
        EventDataStore=event_data_store_id,
        QueryId=query_id
    ):
        for row in page.get('QueryResultRows', []):
            logs = {}
            for log in row:
                for k, v in log.items():
                    logs[k] = v
            output.append(CloudTrailLogEntry(**logs))

    return output


# =============================================================================
# Session Handlers
# =============================================================================

def handle_list_sessions(limit: int = 100, last_key: Optional[str] = None) -> DynamoDBScanResponse:
    """List all sessions"""
    scan_kwargs = {'Limit': limit}
    if last_key:
        scan_kwargs['ExclusiveStartKey'] = {'id': last_key}

    response = sessions_table.scan(**scan_kwargs)
    items = response.get('Items', [])
    last_evaluated_key = response.get('LastEvaluatedKey', {}).get('id')

    return DynamoDBScanResponse(
        items=items,
        lastKey=last_evaluated_key
    )


def handle_get_session(session_id: str) -> SessionItem:
    """Get a session by ID"""
    response = sessions_table.get_item(Key={'id': session_id})
    item = response.get('Item')
    if not item:
        raise NotFoundError(f"Session '{session_id}' not found")
    return SessionItem(**item)


def handle_create_session(session: SessionItem) -> SessionItem:
    """Create a new session"""
    sessions_table.put_item(Item=session.model_dump(exclude_none=True))
    return session


def handle_update_session(session_id: str, updates: Dict[str, Any]) -> SessionItem:
    """Update a session"""
    # Build update expression
    update_parts = []
    expression_names = {}
    expression_values = {}

    for key, value in updates.items():
        if key != 'id':  # Don't update the key
            attr_name = f"#{key}"
            attr_value = f":{key}"
            update_parts.append(f"{attr_name} = {attr_value}")
            expression_names[attr_name] = key
            expression_values[attr_value] = value

    if not update_parts:
        raise BadRequestError("No fields to update")

    update_expression = "SET " + ", ".join(update_parts)

    response = sessions_table.update_item(
        Key={'id': session_id},
        UpdateExpression=update_expression,
        ExpressionAttributeNames=expression_names,
        ExpressionAttributeValues=expression_values,
        ReturnValues='ALL_NEW'
    )

    return SessionItem(**response['Attributes'])


def handle_delete_session(session_id: str) -> SuccessResponse:
    """Delete a session"""
    sessions_table.delete_item(Key={'id': session_id})
    return SuccessResponse(message=f"Session '{session_id}' deleted")


def handle_start_session_logs(session_id: str) -> CloudTrailQueryResponse:
    """Start CloudTrail Lake query for a session and save queryId"""
    # Get session
    response = sessions_table.get_item(Key={'id': session_id})
    item = response.get('Item')
    if not item:
        raise NotFoundError(f"Session '{session_id}' not found")

    session = SessionItem(**item)

    # Get Event Data Store ID
    event_data_store_id = settings.event_data_store_arn.split('/')[-1] if settings.event_data_store_arn else ''
    if not event_data_store_id:
        raise BadRequestError("Event Data Store not configured")

    # Build CloudTrail Lake SQL query
    # Remove 'idc_' prefix from username if present
    username = session.username or ''
    if username.startswith('idc_'):
        username = username[4:]

    query = (
        f"SELECT eventID, eventName, eventSource, eventTime "
        f"FROM {event_data_store_id} "
        f"WHERE eventTime > '{session.startTime}' "
        f"AND eventTime < '{session.endTime}' "
        f"AND lower(useridentity.principalId) LIKE '%:{username.lower()}%' "
        f"AND useridentity.sessionContext.sessionIssuer.arn LIKE '%{session.role}%' "
        f"AND recipientAccountId='{session.accountId}'"
    )

    logger.info("Starting CloudTrail query", extra={"session_id": session_id, "query": query})

    # Start the query
    cloudtrail: CloudTrailClient = boto3.client('cloudtrail')
    cloudtrail_response = cloudtrail.start_query(
        QueryStatement=query,
        EventDataStore=event_data_store_id
    )

    query_id = cloudtrail_response['QueryId']

    # Save queryId to session
    sessions_table.update_item(
        Key={'id': session_id},
        UpdateExpression='SET queryId = :qid',
        ExpressionAttributeValues={':qid': query_id}
    )

    return CloudTrailQueryResponse(
        queryId=query_id,
        status='RUNNING'
    )


def handle_get_user_policy(user_id: str = '', group_ids: Optional[List[str]] = None, username: str = '') -> EntitlementResponse:
    """Get user policy (triggers entitlement)"""
    if group_ids is None:
        group_ids = []
    
    payload = UserPolicyRequest(
        userId=user_id,
        groupIds=group_ids,
        username=username
    )
    
    # Trigger entitlement handler
    return handle_get_entitlement(payload)


# =============================================================================
# DynamoDB Stream Handler (Router Logic)
# =============================================================================

def get_user(username: str) -> str:
    """Get user ID from Identity Center"""
    sso_instance = get_sso_instance()
    identity_store_id = sso_instance.IdentityStoreId
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


def get_email(username):
    """Get email from Cognito"""
    next_page = None
    users_remain = True
    while users_remain:
        kwargs = {
            'UserPoolId': settings.auth_team_userpoolid,
            'Filter': f'username = "{username}"',
            'AttributesToGet': ["email"],
        }
        if next_page:
            kwargs['PaginationToken'] = next_page
        response = cognito.list_users(**kwargs)
        if response.get('Users'):
            for attr in response['Users'][0]['Attributes']:
                if attr['Name'] == 'email':
                    return attr['Value']
        next_page = response.get('PaginationToken')
        users_remain = next_page is not None
    return None


def list_account_for_ou(ou_id: str) -> List[AccountInfo]:
    """List accounts for an OU"""
    mgmt_account_id = get_mgmt_account_id()
    deployed_in_mgmt = True if settings.account_id == mgmt_account_id else False
    accounts = []
    paginator = organizations.get_paginator('list_accounts_for_parent')
    for page in paginator.paginate(ParentId=ou_id):
        for acct in page['Accounts']:
            if not deployed_in_mgmt:
                if acct['Id'] != mgmt_account_id:
                    accounts.append(AccountInfo(name=acct['Name'], id=acct['Id']))
            else:
                accounts.append(AccountInfo(name=acct['Name'], id=acct['Id']))
    return accounts


def get_entitlements(id_val):
    """Get entitlements from eligibility table"""
    response = eligibility_table.get_item(Key={'id': id_val})
    return response


def list_idc_group_membership(user_id: str) -> List[GroupMembership]:
    """List Identity Center group memberships for user"""
    sso_instance = get_sso_instance()
    identity_store_id = sso_instance.IdentityStoreId
    paginator = identitystore.get_paginator('list_group_memberships_for_member')
    all_idc_groups = []
    for page in paginator.paginate(
        IdentityStoreId=identity_store_id,
        MemberId={'UserId': user_id}
    ):
        for membership_data in page['GroupMemberships']:
            all_idc_groups.append(GroupMembership(**membership_data))
    return all_idc_groups


def check_user_on_call(user_email: str) -> bool:
    """Check if user is currently on-call via configured BetterStack integration."""
    try:
        result = integrations_table.get_item(Key={'name': 'betterstack'})
        item = result.get('Item')
        if not item:
            return False
        api_token = item.get('params', {}).get('api_token')
        schedule_id = item.get('params', {}).get('schedule_id')
        if not api_token or not schedule_id:
            return False

        resp = http_requests.get(
            f'https://uptime.betterstack.com/api/v2/on-calls/{schedule_id}',
            headers={'Authorization': f'Bearer {api_token}'},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
        on_call_users = data.get('data', {}).get('relationships', {}).get('on_call_users', {}).get('data', [])
        on_call_emails = [u.get('meta', {}).get('email', '').lower() for u in on_call_users]
        return user_email.lower() in on_call_emails
    except Exception as e:
        logger.warning("On-call check failed", extra={"error": str(e)})
        return False


def get_eligibility(request: RequestItem, user_id: str) -> Optional[EligibilityCheckResult]:
    """Check user eligibility"""
    eligible = False
    approval_required = True
    auto_approval_on_call = False
    group_ids = [group.GroupId for group in list_idc_group_membership(user_id)]

    max_duration_error = True
    for id_val in [user_id] + group_ids:
        if not id_val:
            continue
        entitlement_response = get_entitlements(id_val)
        if not entitlement_response.get('Item'):
            continue
        entitlement_item = EligibilityItem(**entitlement_response['Item'])
        duration = entitlement_item.duration
        if int(request.time) <= int(duration):
            max_duration_error = False
        for account in entitlement_item.accounts:
            if request.accountId == account.id:
                for permission in entitlement_item.permissions:
                    if request.roleId == permission.id:
                        eligible = True
                        if not entitlement_item.approvalRequired:
                            approval_required = False
                        if entitlement_item.autoApprovalOnCall:
                            auto_approval_on_call = True

    if max_duration_error:
        update_request_directly(UpdateRequestInput(id=request.id, status='error'))
        return None

    if eligible:
        return EligibilityCheckResult(approval=approval_required, autoApprovalOnCall=auto_approval_on_call)
    else:
        update_request_directly(UpdateRequestInput(id=request.id, status='error'))
        return None


def get_ou(account_id: str) -> OUInfo:
    """Get OU for account"""
    response = organizations.list_parents(ChildId=account_id)
    return OUInfo(**response['Parents'][0])


def get_approver_groups_for_id(entity_id):
    """List approver group IDs for an account or OU"""
    response = approvers_table.get_item(Key={'id': entity_id})
    if response.get('Item'):
        return response['Item']['groupIds']
    return []


def get_approver_group_ids(account_id):
    """Get approver group IDs for account"""
    approvers = []
    approvers.extend(get_approver_groups_for_id(account_id))
    ou = get_ou(account_id)
    if ou:
        approvers.extend(get_approver_groups_for_id(ou.Id))
    return approvers


def get_approvers(user_id):
    """Get approver details"""
    sso_instance = get_sso_instance()
    identity_store_id = sso_instance.IdentityStoreId
    response = identitystore.describe_user(
        IdentityStoreId=identity_store_id,
        UserId=user_id
    )
    approver_id = "idc_" + response['UserName']
    approver_email = None
    for email in (response.get('Emails') or []):
            if email:
                approver_email = email['Value']
                break
    return {"approver_id": approver_id, "approver": approver_email}


def list_group_membership(group_id):
    """List group memberships"""
    sso_instance = get_sso_instance()
    identity_store_id = sso_instance.IdentityStoreId
    paginator = identitystore.get_paginator('list_group_memberships')
    all_groups = []
    for page in paginator.paginate(
        IdentityStoreId=identity_store_id,
        GroupId=group_id,
    ):
        all_groups.extend(page["GroupMemberships"])
    return all_groups


def get_approvers_details(account_id: str) -> ApproverDetails:
    """Get approver details for account"""
    approver_groups = get_approver_group_ids(account_id)
    approvers = []
    approver_ids = []
    if approver_groups:
        for group in approver_groups:
            approvers_data = [get_approvers(result['MemberId']['UserId'])
                for result in list_group_membership(group)]
            for data in approvers_data:
                if data["approver"] and data["approver"] not in approvers:
                    approvers.append(data["approver"])
                    approver_ids.append(data["approver_id"].lower())
    return ApproverDetails(approvers=approvers, approver_ids=approver_ids)


def get_ps_duration(ps_arn):
    """Get permission set duration"""
    sso_instance = get_sso_instance()
    instance_arn = sso_instance.InstanceArn
    response = sso_admin.describe_permission_set(
        InstanceArn=instance_arn,
        PermissionSetArn=ps_arn
    )
    return response['PermissionSet']['SessionDuration']


def update_request_details(request_id: str, username: str, account_id: str, role_id: str) -> None:
    """Update request details"""
    email = get_email(username)
    approver_details = get_approvers_details(account_id)
    approver_ids = approver_details.approver_ids
    approvers = approver_details.approvers
    session_duration = get_ps_duration(role_id)
    
    input_data = UpdateRequestInput(
        id=request_id,
        email=email,
        approvers=approvers,
        approver_ids=approver_ids,
        session_duration=session_duration
    )
    
    update_request_directly(input_data)


def update_approver_details(request_id, username):
    """Update approver details"""
    approver = get_email(username)
    input_data = UpdateRequestInput(
        id=request_id,
        approver=approver
    )
    update_request_directly(input_data)


def update_revoker_details(request_id, username):
    """Update revoker details"""
    revoker = get_email(username)
    input_data = UpdateRequestInput(
        id=request_id,
        revoker=revoker
    )
    update_request_directly(input_data)


# TODO: Remove
def check_settings() -> SettingsConfig:
    """Get settings"""
    settings = settings_table.get_item(Key={'id': 'settings'})
    item_settings = settings.get('Item')
    if item_settings:
        settings_obj = SettingsItem(**item_settings)
    else:
        settings_obj = SettingsItem(id="settings")

    approval_required = settings_obj.approval if settings_obj.approval is not None else True
    expiry = int(settings_obj.expiry or 3) * 60 * 60
    max_duration = settings_obj.duration or "9"

    notification_config = NotificationConfig(
        ses_notifications_enabled=settings_obj.sesNotificationsEnabled or False,
        sns_notifications_enabled=settings_obj.snsNotificationsEnabled or False,
        slack_notifications_enabled=settings_obj.slackNotificationsEnabled or False,
        ses_source_email=settings_obj.sesSourceEmail or "",
        ses_source_arn=settings_obj.sesSourceArn or "",
        notification_topic_arn=settings.sns_topic_arn,
        elevator_login_url=settings.elevator_login_url,
    )

    return SettingsConfig(
        approval_required=approval_required,
        expiry=expiry,
        max_duration=max_duration,
        notification_config=notification_config,
    )




def ensure_request_details_complete(request: RequestItem) -> RequestItem:
    """Ensure request has all required details filled in (email, approvers, etc.)"""
    request_obj = request

    request_id = request_obj.id
    username = request_obj.username
    status = request_obj.status

    # Fill in missing email if status is pending
    if status == "pending" and not request_obj.email:
        update_request_details(request_id, username, request_obj.accountId, request_obj.roleId)
        # Re-fetch to get updated email
        updated_response = requests_table.get_item(Key={'id': request_id})
        updated = updated_response.get('Item') or {}
        request_obj = RequestItem(**updated)

    # Fill in missing approver if status is approved/rejected
    if status in ["approved", "rejected"] and not request_obj.approver and request_obj.approverId:
        update_approver_details(request_id, request_obj.approverId)
        updated_response = requests_table.get_item(Key={'id': request_id})
        updated = updated_response.get('Item') or {}
        request_obj = RequestItem(**updated)

    # Fill in missing revoker if status is revoked
    if status == "revoked" and not request_obj.revoker and request_obj.revokerId:
        update_revoker_details(request_id, request_obj.revokerId)
        updated_response = requests_table.get_item(Key={'id': request_id})
        updated = updated_response.get('Item') or {}
        request_obj = RequestItem(**updated)

    return request_obj




# =============================================================================
# HTTP API Gateway Routes using Powertools
# =============================================================================

# Map resources to DynamoDB tables for generic CRUD operations
table_map = {
    'requests': requests_table,
    'sessions': sessions_table,
    'approvers': approvers_table,
    'settings': settings_table,
    'eligibility': eligibility_table,
}

# =============================================================================
# Requests CRUD Routes (with business logic)
# =============================================================================

@app.get("/requests")
def list_requests(limit: Optional[str] = None, lastKey: Optional[str] = None) -> DynamoDBScanResponse:
    """List all requests"""
    table = requests_table

    if limit and lastKey:
        import urllib.parse
        result = table.scan(
            Limit=int(limit),
            ExclusiveStartKey=json.loads(urllib.parse.unquote(lastKey))
        )
    elif limit:
        result = table.scan(Limit=int(limit))
    elif lastKey:
        import urllib.parse
        result = table.scan(
            ExclusiveStartKey=json.loads(urllib.parse.unquote(lastKey))
        )
    else:
        result = table.scan()

    return DynamoDBScanResponse(
        items=result.get('Items', []),
        lastKey=result.get('LastEvaluatedKey')
    )

@app.get("/requests/<request_id>")
def get_request(request_id: str) -> RequestItem:
    """Get a single request by ID"""
    response = requests_table.get_item(Key={'id': request_id})
    item = response.get('Item')

    if not item:
        raise NotFoundError(f"Request '{request_id}' not found")

    return RequestItem(**item)

@app.post("/requests")
def create_request(body: CreateRequestInput) -> RequestItem:
    """Create a new request and process synchronously"""
    data = body.model_dump(exclude_none=True)

    if not data.get('id'):
        data['id'] = str(uuid.uuid4())

    # Set creation timestamp
    data['createdAt'] = datetime.now(timezone.utc).isoformat()

    # Set default startTime if not provided
    if not data.get('startTime'):
        data['startTime'] = datetime.now(timezone.utc).isoformat()

    # Always set user info from JWT claims (never trust client-provided values)
    try:
        claims = app.current_event.request_context.authorizer.jwt_claim  # type: ignore[union-attr]
        data['email'] = claims.get("email", "")
        data['username'] = claims.get("cognito:username") or claims.get("email", "")
        data['userId'] = claims.get("userId", "")
    except Exception as e:
        logger.warning("Could not extract JWT claims", extra={"error": str(e)})

    # Set default status
    if not data.get('status'):
        data['status'] = 'pending'

    # Map 'duration' (frontend field, hours) to 'time' (model field)
    if not data.get('time') and data.get('duration'):
        data['time'] = data['duration']

    requests_table.put_item(Item=data)

    # Apply business logic from old teamRouter
    try:
        request = RequestItem(**data)
        request_id = request.id
        username = request.username
        status = request.status

        # Check if request needs enrichment (approvers, email, session_duration)
        if status == "pending" and (not request.email or not request.approvers):
            logger.info("Enriching new request", extra={"request_id": request_id})
            # Enrich with email, approvers, session_duration
            update_request_details(request_id, username, request.accountId, request.roleId)

            # Re-fetch enriched request
            enriched_response = requests_table.get_item(Key={'id': request_id})
            request_data = enriched_response.get('Item') or data
            request = RequestItem(**request_data)

        # Get settings
        settings_response = settings_table.get_item(Key={'id': 'settings'})
        item_settings = settings_response.get('Item') or {}
        settings_obj = SettingsItem(**item_settings) if item_settings else SettingsItem(id="settings")

        approval_required = settings_obj.approval if settings_obj.approval is not None else True
        max_duration = settings_obj.duration or "9"

        # Validate max duration
        if int(request.time) > int(max_duration):
            logger.error("Request duration exceeds max", extra={"request_id": request_id, "requested": request.time, "max": max_duration})
            update_request_directly(UpdateRequestInput(id=request_id, status='error'))
            raise BadRequestError(f"Request duration {request.time} exceeds maximum {max_duration}")

        # Check eligibility
        if status == "pending":
            # Use userId from JWT claims if available, otherwise look up from IDC
            user_id = request.userId
            if not user_id:
                # Strip federated provider prefix (e.g. "IDC_user@example.com" -> "user@example.com")
                clean_username = username.split("_", 1)[1] if '_' in username else username
                try:
                    user_id = get_user(clean_username)
                except Exception as e:
                    logger.error("Failed to get user ID", extra={"username": clean_username, "error": str(e)})
                    update_request_directly(UpdateRequestInput(id=request_id, status='error'))
                    raise BadRequestError(f"Failed to get user ID for {clean_username}")

                # Update request with userId
                update_request_directly(UpdateRequestInput(id=request_id, userId=user_id))
                request.userId = user_id

            # Check eligibility
            eligibility_result = get_eligibility(request, user_id)
            if not eligibility_result:
                logger.error("Eligibility check failed", extra={"request_id": request_id})
                raise BadRequestError("Request not eligible: check account, role, and duration permissions")

            # Update approval_required based on eligibility
            if eligibility_result.approval:
                approval_required = eligibility_result.approval
                update_request_directly(UpdateRequestInput(id=request_id, approvalRequired=approval_required))

            # Auto-approve if user is on-call and policy allows it
            if approval_required and eligibility_result.autoApprovalOnCall and check_user_on_call(request.email):
                    approval_required = False
                    update_request_directly(UpdateRequestInput(id=request_id, approvalRequired=False, comment='Auto-approved: user is on-call'))
                    logger.info("User is on-call, auto-approving", extra={"request_id": request_id, "email": request.email})
                    # Send approval notification for on-call auto-approval
                    latest_response = requests_table.get_item(Key={'id': request_id})
                    latest_request = RequestItem(**latest_response['Item'])
                    notification_dict = latest_request.model_dump()
                    notification_dict['status'] = 'approved'
                    notification_dict['approver'] = 'On-call auto-approval'
                    notification_event = NotificationEvent(**notification_dict)
                    handle_notifications(notification_event)

            # If no approval required, automatically trigger grant
            if not approval_required:
                logger.info("No approval required, granting immediately", extra={"request_id": request_id})
                # Re-fetch to get latest data
                latest_response = requests_table.get_item(Key={'id': request_id})
                latest_request = RequestItem(**latest_response['Item'])
                task_grant(latest_request)
            else:
                # Send pending notification to approvers
                # Re-fetch to get latest data (approvers, session_duration, etc.)
                latest_response = requests_table.get_item(Key={'id': request_id})
                latest_request = RequestItem(**latest_response['Item'])
                logger.info("Approval required, notifying approvers", extra={"request_id": request_id, "approvers": latest_request.approvers})
                notification_dict = latest_request.model_dump()
                notification_dict['status'] = 'pending'
                notification_dict['approvalRequired'] = approval_required
                notification_event = NotificationEvent(**notification_dict)
                handle_notifications(notification_event)

        # Return updated request
        final_response = requests_table.get_item(Key={'id': request_id})
        final_item = final_response.get('Item') or data
        return RequestItem(**final_item)

    except Exception as e:
        logger.error("Error processing request", extra={"request_id": data.get('id'), "error": str(e)})
        if isinstance(e, BadRequestError):
            raise
        # For unexpected errors, mark as error and re-raise
        if data.get('id'):
            update_request_directly(UpdateRequestInput(id=data['id'], status='error'))
        raise BadRequestError(f"Error processing request: {str(e)}")

@app.put("/requests/<request_id>")
def update_request(request_id: str, body: UpdateRequestInput) -> RequestItem:
    """Update an existing request and process synchronously"""
    data = body.model_dump(exclude_none=True)

    # Prepend "Manually approved" to comment when approving
    if data.get('status') == 'approved':
        comment = data.get('comment', '')
        if comment:
            data['comment'] = f"Manually approved. {comment}"
        else:
            data['comment'] = "Manually approved"

    update_expr = []
    expr_names = {}
    expr_values = {}

    for idx, (key, value) in enumerate(data.items()):
        if key != 'id':
            update_expr.append(f'#attr{idx} = :val{idx}')
            expr_names[f'#attr{idx}'] = key
            expr_values[f':val{idx}'] = value

    result = requests_table.update_item(
        Key={'id': request_id},
        UpdateExpression='SET ' + ', '.join(update_expr),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues='ALL_NEW'
    )

    updated_item = result.get('Attributes', {})

    # Apply workflow logic from old teamRouter
    try:
        request = RequestItem(**updated_item)
        status = request.status

        # Enrich with approver/revoker details if needed
        if status in ["approved", "rejected"] and not request.approver and request.approverId:
            logger.info("Enriching with approver details", extra={"request_id": request_id})
            update_approver_details(request_id, request.approverId)
            # Re-fetch
            updated_response = requests_table.get_item(Key={'id': request_id})
            updated_item = updated_response.get('Item')
            request = RequestItem(**updated_item)

        if status == "revoked" and not request.revoker and request.revokerId:
            logger.info("Enriching with revoker details", extra={"request_id": request_id})
            update_revoker_details(request_id, request.revokerId)
            # Re-fetch
            updated_response = requests_table.get_item(Key={'id': request_id})
            updated_item = updated_response.get('Item')
            request = RequestItem(**updated_item)

        # Get settings
        settings_response = settings_table.get_item(Key={'id': 'settings'})
        item_settings = settings_response.get('Item') or {}
        settings_obj = SettingsItem(**item_settings) if item_settings else SettingsItem(id="settings")
        approval_required = settings_obj.approval if settings_obj.approval is not None else True

        # Handle workflow based on status
        if status == "approved" and approval_required:
            # Validate approver != requester (prevent self-approval)
            if request.email == request.approver:
                logger.error("Self-approval not allowed", extra={"request_id": request_id})
                update_request_directly(UpdateRequestInput(id=request_id, status='error'))
                raise BadRequestError("Self-approval not allowed")

            # Check if startTime is in the future
            if request.startTime:
                start_datetime = parser.parse(request.startTime).astimezone(timezone.utc)
                current_datetime = datetime.now(timezone.utc)

                if current_datetime < start_datetime:
                    # Schedule for future
                    logger.info("Scheduling future grant", extra={"request_id": request_id, "startTime": request.startTime})
                    # TODO: Add EventBridge scheduling for future grants (similar to revoke scheduling)
                    # For now, send scheduled notification
                    notification_dict = request.model_dump()
                    notification_dict['status'] = 'scheduled'
                    notification_event = NotificationEvent(**notification_dict)
                    handle_notifications(notification_event)
                else:
                    # Grant immediately
                    logger.info("Granting immediately after approval", extra={"request_id": request_id})
                    task_grant(request)
            else:
                # No startTime, grant immediately
                logger.info("Granting immediately after approval", extra={"request_id": request_id})
                task_grant(request)

        elif status == "rejected" and approval_required:
            # Validate approver != requester
            if request.email == request.approver:
                logger.error("Self-rejection not allowed", extra={"request_id": request_id})
                update_request_directly(UpdateRequestInput(id=request_id, status='error'))
                raise BadRequestError("Self-rejection not allowed")

            # Send rejection notification
            logger.info("Sending rejection notification", extra={"request_id": request_id})
            notification_dict = request.model_dump()
            notification_dict['status'] = 'rejected'
            notification_event = NotificationEvent(**notification_dict)
            handle_notifications(notification_event)

        elif status == "cancelled":
            # Send cancellation notification
            logger.info("Sending cancellation notification", extra={"request_id": request_id})
            notification_dict = request.model_dump()
            notification_dict['status'] = 'cancelled'
            notification_event = NotificationEvent(**notification_dict)
            handle_notifications(notification_event)

        elif status == "revoked":
            # Trigger revoke task
            logger.info("Revoking access", extra={"request_id": request_id})
            task_revoke(request)

        # Return final updated request
        final_response = requests_table.get_item(Key={'id': request_id})
        final_item = final_response.get('Item') or updated_item
        return RequestItem(**final_item)

    except Exception as e:
        logger.error("Error processing request update", extra={"request_id": request_id, "error": str(e)})
        if isinstance(e, BadRequestError):
            raise
        # For unexpected errors, mark as error and re-raise
        update_request_directly(UpdateRequestInput(id=request_id, status='error'))
        raise BadRequestError(f"Error processing request update: {str(e)}")

@app.delete("/requests/<request_id>")
def delete_request(request_id: str) -> None:
    """Delete a request"""
    requests_table.delete_item(Key={'id': request_id})

# =============================================================================
# Settings Routes
# =============================================================================

@app.get("/settings")
def get_settings() -> SettingsItem:
    """Get application settings"""
    response = settings_table.get_item(Key={'id': 'settings'})
    item = response.get('Item')

    if not item:
        # Return default settings
        return SettingsItem(id="settings")

    return SettingsItem(**item)


@app.put("/settings")
def update_settings(body: UpdateSettingsInput) -> SettingsItem:
    """Update application settings"""
    update_data = body.model_dump(exclude_none=True)

    if not update_data:
        response = settings_table.get_item(Key={'id': 'settings'})
        item = response.get('Item')
        return SettingsItem(**(item or {'id': 'settings'}))

    update_expr = []
    expr_names = {}
    expr_values = {}

    for idx, (key, value) in enumerate(update_data.items()):
        update_expr.append(f'#attr{idx} = :val{idx}')
        expr_names[f'#attr{idx}'] = key
        expr_values[f':val{idx}'] = value

    result = settings_table.update_item(
        Key={'id': 'settings'},
        UpdateExpression='SET ' + ', '.join(update_expr),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues='ALL_NEW'
    )

    return SettingsItem(**result.get('Attributes', {'id': 'settings'}))


# =============================================================================
# Approvers Routes
# =============================================================================

@app.get("/approvers")
def list_approvers() -> ApproversListResponse:
    """List all approver mappings"""
    result = approvers_table.scan()
    items = result.get('Items', [])

    approvers = []
    for item in items:
        approvers.append(ApproverResponse(
            id=item.get('id', ''),
            type=item.get('type', 'Account'),
            name=item.get('name', ''),
            groupIds=item.get('groupIds', []),
            groupNames=item.get('groupNames')
        ))

    return ApproversListResponse(items=approvers)


@app.get("/approvers/<approver_id>")
def get_approver(approver_id: str) -> ApproverResponse:
    """Get a single approver mapping by ID"""
    response = approvers_table.get_item(Key={'id': approver_id})
    item = response.get('Item')

    if not item:
        raise NotFoundError(f"Approver '{approver_id}' not found")

    return ApproverResponse(
        id=item.get('id', ''),
        type=item.get('type', 'Account'),
        name=item.get('name', ''),
        groupIds=item.get('groupIds', []),
        groupNames=item.get('groupNames')
    )


@app.post("/approvers")
def create_approver(body: CreateApproverInput) -> ApproverResponse:
    """Create a new approver mapping"""
    item = body.model_dump()
    approvers_table.put_item(Item=item)

    return ApproverResponse(
        id=item['id'],
        type=item['type'],
        name=item['name'],
        groupIds=item['groupIds'],
        groupNames=item.get('groupNames')
    )


@app.put("/approvers/<approver_id>")
def update_approver(approver_id: str, body: UpdateApproverInput) -> ApproverResponse:
    """Update an approver mapping"""
    update_data = body.model_dump(exclude_none=True)

    update_expr = []
    expr_names = {}
    expr_values = {}

    for idx, (key, value) in enumerate(update_data.items()):
        update_expr.append(f'#attr{idx} = :val{idx}')
        expr_names[f'#attr{idx}'] = key
        expr_values[f':val{idx}'] = value

    result = approvers_table.update_item(
        Key={'id': approver_id},
        UpdateExpression='SET ' + ', '.join(update_expr),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues='ALL_NEW'
    )

    item = result.get('Attributes', {})
    return ApproverResponse(
        id=item.get('id', approver_id),
        type=item.get('type', 'Account'),
        name=item.get('name', ''),
        groupIds=item.get('groupIds', []),
        groupNames=item.get('groupNames')
    )


@app.delete("/approvers/<approver_id>")
def delete_approver(approver_id: str) -> SuccessResponse:
    """Delete an approver mapping"""
    approvers_table.delete_item(Key={'id': approver_id})
    return SuccessResponse(success=True, message=f"Approver {approver_id} deleted")


# =============================================================================
# Integration Routes
# =============================================================================

@app.get("/integrations")
def list_integrations() -> IntegrationListResponse:
    """List all integrations"""
    result = integrations_table.scan()
    items = result.get('Items', [])

    integrations = []
    for item in items:
        integrations.append(IntegrationResponse(
            name=item.get('name', ''),
            params=item.get('params', {}),
        ))

    return IntegrationListResponse(items=integrations)


@app.post("/integrations")
def create_integration(body: CreateIntegrationInput) -> IntegrationResponse:
    """Create a new integration"""
    item = body.model_dump()
    integrations_table.put_item(Item=item)

    return IntegrationResponse(
        name=item['name'],
        params=item['params'],
    )


@app.put("/integrations/<integration_name>")
def update_integration(integration_name: str, body: UpdateIntegrationInput) -> IntegrationResponse:
    """Update an integration"""
    update_data = body.model_dump(exclude_none=True)

    update_expr = []
    expr_names = {}
    expr_values = {}

    for idx, (key, value) in enumerate(update_data.items()):
        update_expr.append(f'#attr{idx} = :val{idx}')
        expr_names[f'#attr{idx}'] = key
        expr_values[f':val{idx}'] = value

    result = integrations_table.update_item(
        Key={'name': integration_name},
        UpdateExpression='SET ' + ', '.join(update_expr),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues='ALL_NEW'
    )

    item = result.get('Attributes', {})
    return IntegrationResponse(
        name=item.get('name', integration_name),
        params=item.get('params', {}),
    )


@app.delete("/integrations/<integration_name>")
def delete_integration(integration_name: str) -> SuccessResponse:
    """Delete an integration"""
    integrations_table.delete_item(Key={'name': integration_name})
    return SuccessResponse(success=True, message=f"Integration {integration_name} deleted")


@app.get("/on-call")
def get_on_call_users() -> OnCallResponse:
    """Get list of users currently on-call from configured provider."""
    result = integrations_table.get_item(Key={'name': 'betterstack'})
    item = result.get('Item')
    if not item:
        raise NotFoundError("No on-call integration configured")

    params = item.get('params', {})
    api_token = params.get('api_token')
    schedule_id = params.get('schedule_id')
    if not api_token or not schedule_id:
        raise NotFoundError("On-call integration not properly configured")

    try:
        resp = http_requests.get(
            f'https://uptime.betterstack.com/api/v2/on-calls/{schedule_id}',
            headers={'Authorization': f'Bearer {api_token}'},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
        on_call_data = data.get('data', {}).get('relationships', {}).get('on_call_users', {}).get('data', [])
        users = [
            OnCallUser(
                email=u.get('meta', {}).get('email', ''),
                name=u.get('meta', {}).get('name')
            )
            for u in on_call_data
            if u.get('meta', {}).get('email')
        ]
        return OnCallResponse(users=users, provider='betterstack')
    except http_requests.exceptions.RequestException as e:
        logger.error("Failed to fetch on-call users", extra={"error": str(e)})
        raise BadRequestError(f"Failed to fetch on-call users: {str(e)}")


# =============================================================================
# Eligibility/Policy Routes
# =============================================================================

@app.get("/eligibility")
def list_eligibility() -> EligibilityListResponse:
    """List all eligibility policies"""
    result = eligibility_table.scan()
    items = result.get('Items', [])

    policies = []
    for item in items:
        policies.append(EligibilityResponse(
            id=item.get('id', ''),
            type=item.get('type'),
            name=item.get('name'),
            accounts=item.get('accounts', []),
            ous=item.get('ous', []),
            permissions=item.get('permissions', []),
            approvalRequired=item.get('approvalRequired', True),
            duration=item.get('duration', '9'),
            autoApprovalOnCall=item.get('autoApprovalOnCall', False)
        ))

    return EligibilityListResponse(items=policies)


@app.get("/eligibility/<policy_id>")
def get_eligibility_policy(policy_id: str) -> EligibilityResponse:
    """Get a single eligibility policy by ID"""
    response = eligibility_table.get_item(Key={'id': policy_id})
    item = response.get('Item')

    if not item:
        raise NotFoundError(f"Eligibility policy '{policy_id}' not found")

    return EligibilityResponse(
        id=item.get('id', ''),
        type=item.get('type'),
        name=item.get('name'),
        accounts=item.get('accounts', []),
        ous=item.get('ous', []),
        permissions=item.get('permissions', []),
        approvalRequired=item.get('approvalRequired', True),
        duration=item.get('duration', '9'),
        autoApprovalOnCall=item.get('autoApprovalOnCall', False)
    )


@app.post("/eligibility")
def create_eligibility_policy(body: CreateEligibilityInput) -> EligibilityResponse:
    """Create a new eligibility policy"""
    item = body.model_dump()
    eligibility_table.put_item(Item=item)

    return EligibilityResponse(
        id=item['id'],
        type=item.get('type'),
        name=item.get('name'),
        accounts=item.get('accounts', []),
        ous=item.get('ous', []),
        permissions=item.get('permissions', []),
        approvalRequired=item.get('approvalRequired', True),
        duration=item.get('duration', '9'),
        autoApprovalOnCall=item.get('autoApprovalOnCall', False)
    )


@app.put("/eligibility/<policy_id>")
def update_eligibility_policy(policy_id: str, body: CreateEligibilityInput) -> EligibilityResponse:
    """Update an eligibility policy"""
    update_data = body.model_dump(exclude_none=True)

    # Remove id from update data since it's in the key
    update_data.pop('id', None)

    update_expr = []
    expr_names = {}
    expr_values = {}

    for idx, (key, value) in enumerate(update_data.items()):
        update_expr.append(f'#attr{idx} = :val{idx}')
        expr_names[f'#attr{idx}'] = key
        expr_values[f':val{idx}'] = value

    result = eligibility_table.update_item(
        Key={'id': policy_id},
        UpdateExpression='SET ' + ', '.join(update_expr),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues='ALL_NEW'
    )

    item = result.get('Attributes', {})
    return EligibilityResponse(
        id=item.get('id', policy_id),
        type=item.get('type'),
        name=item.get('name'),
        accounts=item.get('accounts', []),
        ous=item.get('ous', []),
        permissions=item.get('permissions', []),
        approvalRequired=item.get('approvalRequired', True),
        duration=item.get('duration', '9'),
        autoApprovalOnCall=item.get('autoApprovalOnCall', False)
    )


@app.delete("/eligibility/<policy_id>")
def delete_eligibility_policy(policy_id: str) -> SuccessResponse:
    """Delete an eligibility policy"""
    eligibility_table.delete_item(Key={'id': policy_id})
    return SuccessResponse(success=True, message=f"Eligibility policy {policy_id} deleted")

# Query endpoints
@app.get("/accounts")
def list_accounts() -> List[AccountInfo]:
    """List all accounts"""
    return handle_get_accounts()

@app.get("/ous")
def list_ous() -> List[OUInfo]:
    """List all OUs"""
    return handle_get_ous()

@app.get("/ou/<account_id>")
def get_ou_by_account_id(account_id: str) -> OUInfo:
    """Get OU by account ID"""
    return handle_get_ou(account_id)

@app.get("/permissions")
def list_permissions() -> List[PermissionSetInfo]:
    """List permission sets"""
    return handle_get_permissions()

@app.get("/mgmt-permissions")
def get_mgmt_permissions() -> ManagementPermissionsResponse:
    """Get management account permissions"""
    return handle_get_mgmt_permissions()

@app.get("/idc-groups")
def list_idc_groups() -> List[GroupInfo]:
    """List Identity Center groups"""
    return handle_get_idc_groups()

@app.get("/users")
def list_users() -> List[UserInfo]:
    """List Identity Center users"""
    return handle_get_users()

@app.get("/logs")
def list_logs(queryId: Optional[str] = None, query: Optional[str] = None) -> CloudTrailQueryResponse | List[CloudTrailLogEntry]:
    """List or query logs"""
    if queryId:
        return handle_query_logs(queryId)
    else:
        return handle_get_logs(query or '')

# Session endpoints
@app.get("/sessions")
def list_sessions(limit: int = 100, lastKey: Optional[str] = None) -> DynamoDBScanResponse:
    """List all sessions"""
    return handle_list_sessions(limit, lastKey)

@app.get("/sessions/<session_id>")
def get_session(session_id: str) -> SessionItem:
    """Get a session by ID"""
    return handle_get_session(session_id)

@app.post("/sessions")
def create_session(body: SessionItem) -> SessionItem:
    """Create a new session"""
    return handle_create_session(body)

@app.put("/sessions/<session_id>")
def update_session(session_id: str, body: UpdateSessionInput) -> SessionItem:
    """Update a session"""
    return handle_update_session(session_id, body.model_dump(exclude_none=True))

@app.delete("/sessions/<session_id>")
def delete_session(session_id: str) -> SuccessResponse:
    """Delete a session"""
    return handle_delete_session(session_id)

@app.post("/sessions/<session_id>/logs")
def start_session_logs(session_id: str) -> CloudTrailQueryResponse:
    """Start CloudTrail Lake query for a session"""
    return handle_start_session_logs(session_id)

@app.get("/user-policy")
def get_user_policy(userId: Optional[str] = None, groupIds: Optional[str] = None, username: Optional[str] = None) -> EntitlementResponse:
    """Get user policy"""
    user_id = userId or ''
    group_ids = groupIds.split(',') if groupIds else []
    username = username or ''
    
    return handle_get_user_policy(user_id, group_ids, username)

@app.get("/groups/members")
def list_groups() -> List[GroupInfo]:
    """List group members"""
    return handle_get_idc_groups()

@app.post("/policy")
def publish_policy(body: UserPolicyRequest) -> EntitlementResponse:
    """Publish policy"""
    return handle_get_user_policy(body.userId, body.groupIds or [], body.username)

# First-class workflow endpoints
@app.post("/requests/<request_id>/grant")
def grant_request(request_id: str) -> GrantRequestResponse:
    """Grant access for a request (create SSO account assignment)"""
    logger.info("Granting access via API", extra={"request_id": request_id})

    # Get the request from DynamoDB
    response = requests_table.get_item(Key={'id': request_id})
    request = response.get('Item')

    if not request:
        raise NotFoundError(f"Request '{request_id}' not found")

    # Prepare request object
    request_obj = RequestItem(**request)
    sso_instance = get_sso_instance()

    try:
        # Call grant task with instance ARN as separate parameter
        result = task_grant(request_obj, instance_arn=sso_instance.InstanceArn)

        # Get updated request
        updated_response = requests_table.get_item(Key={'id': request_id})
        updated_request = updated_response.get('Item')

        return GrantRequestResponse(
            status='granted',
            result=result.model_dump(),
            request=updated_request or {}
        )
    except Exception as e:
        logger.error("Error granting access", extra={"request_id": request_id, "error": str(e)})
        raise BadRequestError(f"Error granting access: {str(e)}")


@app.post("/requests/<request_id>/revoke")
def revoke_request(request_id: str) -> RevokeRequestResponse:
    """Revoke access for a request (delete SSO account assignment)"""
    logger.info("Revoking access via API", extra={"request_id": request_id})

    # Get the request from DynamoDB
    response = requests_table.get_item(Key={'id': request_id})
    request = response.get('Item')

    if not request:
        raise NotFoundError(f"Request '{request_id}' not found")

    # Prepare request object
    request_obj = RequestItem(**request)
    sso_instance = get_sso_instance()

    try:
        # Call revoke task with instance ARN as separate parameter
        result = task_revoke(request_obj, instance_arn=sso_instance.InstanceArn)

        # Get updated request
        updated_response = requests_table.get_item(Key={'id': request_id})
        updated_request = updated_response.get('Item')

        return RevokeRequestResponse(
            status='revoked',
            result=result.model_dump(),
            request=updated_request or {}
        )
    except Exception as e:
        logger.error("Error revoking access", extra={"request_id": request_id, "error": str(e)})
        raise BadRequestError(f"Error revoking access: {str(e)}")


# =============================================================================
# Cognito Pre-Token Generation Handler
# =============================================================================

def handle_pre_token_generation(event: CognitoPreTokenGenerationEvent | Dict[str, Any]) -> CognitoPreTokenGenerationEvent | Dict[str, Any]:
    """Handle Cognito pre-token generation"""
    # Convert to CognitoPreTokenGenerationEvent if it's a dict
    if isinstance(event, dict):
        cognito_event = CognitoPreTokenGenerationEvent(**event)
    else:
        cognito_event = event
    
    elevator_admin_group = settings.elevator_admin_group
    elevator_auditor_group = settings.elevator_auditor_group
    
    settings_response = settings_table.get_item(Key={"id": "settings"})
    item_settings = settings_response.get('Item') or {}
    if item_settings:
        settings_obj = SettingsItem(**item_settings)
        elevator_admin_group = settings_obj.teamAdminGroup or elevator_admin_group
        elevator_auditor_group = settings_obj.teamAuditorGroup or elevator_auditor_group

    sso_instance = get_sso_instance()
    identity_store_id = sso_instance.IdentityStoreId

    user = cognito_event.userName.split("_", 1)[1]
    user_id = get_user(user)
    if not user_id:
        return event if isinstance(event, dict) else event.model_dump()

    admin_group_id = None
    auditor_group_id = None

    admin_group_response = identitystore.get_group_id(
        IdentityStoreId=identity_store_id,
        AlternateIdentifier={
            'UniqueAttribute': {
                'AttributePath': 'DisplayName',
                'AttributeValue': elevator_admin_group
            }
        }
    )
    admin_group_id = admin_group_response['GroupId']

    auditor_group_response = identitystore.get_group_id(
        IdentityStoreId=identity_store_id,
        AlternateIdentifier={
            'UniqueAttribute': {
                'AttributePath': 'DisplayName',
                'AttributeValue': elevator_auditor_group
            }
        }
    )
    auditor_group_id = auditor_group_response['GroupId']
    
    groups = []
    group_ids = []
    
    group_data = list_idc_group_membership(user_id)
    for group in group_data:
        group_ids.append(group.GroupId)
        if group.GroupId == admin_group_id:
            groups.append("Admin")
        elif group.GroupId == auditor_group_id:
            groups.append("Auditors")
    
    response_data = {
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
    
    if isinstance(event, dict):
        event["response"] = response_data
        return event
    else:
        cognito_event.response = response_data
        return cognito_event.model_dump()


# =============================================================================
# Handler Functions for Different Event Sources
# =============================================================================

# Backend Handler - HTTP API Gateway REST API
@logger.inject_lambda_context(correlation_id_path="requestContext.requestId")
def backend_handler(
    event: Dict[str, Any],
    context: LambdaContext
) -> Dict[str, Any]:
    """
    Backend handler for HTTP API Gateway REST API requests.
    """
    typed_event = APIGatewayProxyEventV2(event)
    logger.info("Processing HTTP API Gateway request", extra={
        "method": typed_event.request_context.http.method,
        "path": typed_event.request_context.http.path,
    })

    return app.resolve(event, context)


# Revocation Handler - EventBridge scheduled revocation events
@logger.inject_lambda_context
def revocation_handler(
    event: Dict[str, Any],
    context: LambdaContext
) -> Dict[str, Any]:
    """
    Revocation handler for EventBridge scheduled revocation events.
    Handles revocation tasks triggered by EventBridge rules.
    """
    logger.info("Processing revocation event", extra={"event_keys": list(event.keys())})

    # EventBridge events have 'detail' field, extract the actual event
    event_data = event.get('detail', event)

    # Convert to RequestItem - EventBridge event might only have minimal fields
    # We need to fetch the full request from DynamoDB
    request_id = event_data.get('id')
    if not request_id:
        raise ValueError("Request ID is required in revocation event")
    
    # Fetch the full request from DynamoDB
    request_response = requests_table.get_item(Key={'id': request_id})
    request_item = request_response.get('Item')
    if not request_item:
        raise ValueError(f"Request '{request_id}' not found")
    
    request = RequestItem(**request_item)
    
    # Extract instance_arn from event_data if provided, otherwise will be fetched in task_revoke
    instance_arn = event_data.get('instanceARN')
    
    result = task_revoke(request, instance_arn=instance_arn)
    return result.model_dump()


# Pre-Token Handler - Cognito Pre-Token Generation Trigger
@logger.inject_lambda_context
def pre_token_handler(
    event: Dict[str, Any],
    context: LambdaContext
) -> Dict[str, Any]:
    """
    Pre-token generation handler for Cognito triggers.
    Handles PreTokenGeneration_Authentication trigger source.
    """
    trigger_source = event.get('triggerSource', '')
    logger.info("Processing Cognito pre-token generation", extra={"trigger_source": trigger_source})

    if trigger_source == 'PreTokenGeneration_Authentication':
        result = handle_pre_token_generation(event)
        return result if isinstance(result, dict) else result.model_dump()

    # Return event unchanged for other trigger sources
    return event

