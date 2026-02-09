"""
Utility models for Elevator Lambda backend.
Defines data structures for internal utilities and helper functions.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict


class ParsedARN(BaseModel):
    """Parsed ARN components"""
    arn: str
    partition: str
    service: str
    region: Optional[str]
    account: Optional[str]
    resourcetype: Optional[str] = None
    resource: Optional[str] = None


class NotificationConfig(BaseModel):
    """Notification configuration"""
    ses_notifications_enabled: bool = False
    sns_notifications_enabled: bool = False
    slack_notifications_enabled: bool = False
    ses_source_email: Optional[str] = None
    ses_source_arn: Optional[str] = None
    notification_topic_arn: Optional[str] = None
    elevator_login_url: Optional[str] = None


class SettingsConfig(BaseModel):
    """Settings configuration"""
    approval_required: bool = True
    expiry: int  # Seconds
    max_duration: str  # Hours
    notification_config: NotificationConfig


class ApproverDetails(BaseModel):
    """Approver details"""
    approvers: List[str]
    approver_ids: List[str]


class SlackMessageBlock(BaseModel):
    """Slack message block"""
    type: str
    text: Optional[Dict[str, str]] = None
    fields: Optional[List[Dict[str, str]]] = None
    accessory: Optional[Dict[str, Any]] = None


class CloudTrailLogEntry(BaseModel):
    """CloudTrail log entry"""
    model_config = ConfigDict(extra="allow")
    
    # Common fields - allow extra for flexibility
    pass


class CloudTrailQueryResponse(BaseModel):
    """CloudTrail query response"""
    queryId: str
    status: str


class ManagementPermissionsResponse(BaseModel):
    """Management account permissions response"""
    permissions: List[str]


class DynamoDBScanResponse(BaseModel):
    """DynamoDB scan response"""
    items: List[Dict[str, Any]]
    lastKey: Optional[Dict[str, Any]] = None


class SuccessResponse(BaseModel):
    """Generic success response"""
    success: bool = True
    message: Optional[str] = None

