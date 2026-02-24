"""
API request/response models for Elevator Lambda backend.
Defines all data structures for API Gateway requests and responses.
"""
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict


# =============================================================================
# API Request Models
# =============================================================================

class CreateRequestInput(BaseModel):
    """Input model for creating a new request"""
    model_config = ConfigDict(extra='allow')

    # Required fields from frontend
    accountId: str
    accountName: str
    roleId: str
    role: str
    justification: str
    ticketNo: str
    duration: str  # Duration in hours (maps to 'time' internally)
    startTime: Optional[str] = None
    # Note: username, userId, email are set server-side from JWT claims


class UpdateRequestInput(BaseModel):
    """Input model for updating a request"""
    model_config = ConfigDict(extra='allow')

    id: str
    status: Optional[str] = None
    approver: Optional[str] = None
    approverId: Optional[str] = None
    revoker: Optional[str] = None
    revokerId: Optional[str] = None
    email: Optional[str] = None
    approvers: Optional[List[str]] = None
    approver_ids: Optional[List[str]] = None
    session_duration: Optional[str] = None
    userId: Optional[str] = None
    approvalRequired: Optional[bool] = None
    allowSelfApproval: Optional[bool] = None
    comment: Optional[str] = None


class CreateEligibilityInput(BaseModel):
    """Input model for creating eligibility"""
    model_config = ConfigDict(extra='allow')

    id: str
    accounts: List[Dict[str, str]]
    ous: List[Dict[str, str]]
    permissions: List[Dict[str, str]]
    approvalRequired: bool
    duration: str
    autoApprovalOnCall: bool  # Auto-approve if user is on-call
    allowSelfApproval: bool  # Allow user to approve their own requests (required)


class UpdateSettingsInput(BaseModel):
    """Input model for updating settings"""
    approval: Optional[bool] = None
    expiry: Optional[int] = None  # Hours until request expires
    duration: Optional[str] = None  # Max duration in hours
    comments: Optional[bool] = None  # Comments required for approval
    sesNotificationsEnabled: Optional[bool] = None
    sesSourceEmail: Optional[str] = None
    sesSourceArn: Optional[str] = None
    snsNotificationsEnabled: Optional[bool] = None
    slackNotificationsEnabled: Optional[bool] = None
    slackToken: Optional[str] = None
    slackAuditNotificationsChannel: Optional[str] = None
    teamAdminGroup: Optional[str] = None
    teamAuditorGroup: Optional[str] = None
    ticketNo: Optional[bool] = None  # Ticket number required


class CreateApproverInput(BaseModel):
    """Input model for creating an approver mapping"""
    id: str  # Account ID or OU ID
    type: Literal["Account", "OU"]
    name: str  # Account or OU name
    groupIds: List[str]  # IDC group IDs
    groupNames: Optional[List[str]] = None


class UpdateApproverInput(BaseModel):
    """Input model for updating an approver mapping"""
    groupIds: List[str]
    groupNames: Optional[List[str]] = None


class ApproverResponse(BaseModel):
    """Response model for approver"""
    id: str
    type: str
    name: str
    groupIds: List[str]
    groupNames: Optional[List[str]] = None


class ApproversListResponse(BaseModel):
    """Response model for listing approvers"""
    items: List[ApproverResponse]


class EligibilityResponse(BaseModel):
    """Response model for eligibility/policy"""
    id: str
    type: Optional[str] = None  # "User" or "Group"
    name: Optional[str] = None
    accounts: List[Dict[str, str]]
    ous: List[Dict[str, str]]
    permissions: List[Dict[str, str]]
    approvalRequired: bool
    duration: str
    autoApprovalOnCall: bool  # Auto-approve if user is on-call (required)
    allowSelfApproval: bool  # Allow user to approve their own requests (required)


class EligibilityListResponse(BaseModel):
    """Response model for listing eligibility policies"""
    items: List[EligibilityResponse]


class UserPolicyRequest(BaseModel):
    """Request model for user policy"""
    userId: str
    groupIds: Optional[List[str]] = Field(default_factory=list)
    username: str


class EntitlementPolicy(BaseModel):
    """Policy in entitlement response"""
    accounts: List[Dict[str, str]]  # List of account dicts (may include accounts from OUs)
    permissions: List[Dict[str, str]]
    approvalRequired: bool
    duration: str
    autoApprovalOnCall: bool  # Auto-approve if user is on-call (required)
    allowSelfApproval: bool  # Allow user to approve their own requests (required)


class EntitlementResponse(BaseModel):
    """Response model for entitlement"""
    id: str
    policy: List[EntitlementPolicy]
    username: str


class EligibilityCheckResult(BaseModel):
    """Result of eligibility check"""
    approval: bool
    autoApprovalOnCall: bool
    allowSelfApproval: bool


# =============================================================================
# API Response Models
# =============================================================================

class APIResponse(BaseModel):
    """Generic API response"""
    statusCode: int
    body: str
    headers: Optional[Dict[str, str]] = Field(default_factory=lambda: {"Content-Type": "application/json"})


class GrantResponse(BaseModel):
    """Response for grant operation"""
    statusCode: int
    grant: Dict[str, Any]
    status: str


class RevokeResponse(BaseModel):
    """Response for revoke operation"""
    statusCode: int
    revoke: Dict[str, Any]
    status: str


class GrantRequestResponse(BaseModel):
    """Response for grant request API endpoint"""
    status: str
    result: Dict[str, Any]
    request: Dict[str, Any]


class RevokeRequestResponse(BaseModel):
    """Response for revoke request API endpoint"""
    status: str
    result: Dict[str, Any]
    request: Dict[str, Any]


class ScheduleResponse(BaseModel):
    """Response for schedule operation"""
    statusCode: int
    status: str
    result: Optional[Dict[str, Any]] = None


# =============================================================================
# Notification Models
# =============================================================================

class NotificationEvent(BaseModel):
    """Event model for notifications"""
    model_config = ConfigDict(extra='allow')

    id: Optional[str] = None
    email: str
    status: str
    accountId: str
    accountName: str
    role: str
    roleId: str
    startTime: str
    time: str
    justification: str
    ticketNo: str
    approvers: Optional[List[str]] = None
    approvalRequired: bool = True
    approver: Optional[str] = None
    ses_notifications_enabled: Optional[bool] = None
    ses_source_email: Optional[str] = None
    ses_source_arn: Optional[str] = None
    sns_notifications_enabled: Optional[bool] = None
    notification_topic_arn: Optional[str] = None
    slack_notifications_enabled: Optional[bool] = None
    elevator_login_url: Optional[str] = None
    grant: Optional[Dict[str, Any]] = None
    revoke: Optional[Dict[str, Any]] = None
    statusError: Optional[str] = None


# =============================================================================
# CloudTrail Models
# =============================================================================

class CloudTrailQueryResult(BaseModel):
    """CloudTrail Lake query result"""
    queryId: str
    status: Literal["RUNNING", "FINISHED", "FAILED", "CANCELLED", "TIMED_OUT"]


# =============================================================================
# Integration Models
# =============================================================================

ALLOWED_INTEGRATION_NAMES = Literal["betterstack"]


class CreateIntegrationInput(BaseModel):
    """Input model for creating an integration"""
    name: ALLOWED_INTEGRATION_NAMES
    params: Dict[str, str]


class UpdateIntegrationInput(BaseModel):
    """Input model for updating an integration"""
    params: Dict[str, str]


class IntegrationResponse(BaseModel):
    """Response model for an integration"""
    name: str
    params: Dict[str, str]


class IntegrationListResponse(BaseModel):
    """Response model for listing integrations"""
    items: List[IntegrationResponse]


class OnCallUser(BaseModel):
    """User currently on-call"""
    email: str
    name: Optional[str] = None


class OnCallResponse(BaseModel):
    """Response model for on-call users"""
    users: List[OnCallUser]
    provider: str
