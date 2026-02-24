"""
DynamoDB models for Elevator Lambda backend.
Defines all data structures for DynamoDB tables with strict type validation.
"""
from typing import Optional, List, Dict, Literal
from pydantic import BaseModel, Field, ConfigDict


class RequestItem(BaseModel):
    """DynamoDB request item model"""
    model_config = ConfigDict(extra='allow')

    id: str
    email: str
    username: str
    accountId: str
    accountName: str
    roleId: str
    role: str
    userId: Optional[str] = None  # Optional for backward compatibility with old records
    status: Literal[
        "pending", "approved", "rejected", "scheduled",
        "in_progress", "granted", "revoked", "cancelled", "expired", "error", "ended"
    ]
    sessionStatus: Optional[Literal["not-started", "in-progress", "finished"]] = None
    time: Optional[str] = None  # Duration in hours (optional for old records)
    duration: Optional[str] = None  # Duration in seconds
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    justification: Optional[str] = None  # Optional for backward compatibility
    ticketNo: Optional[str] = None  # Optional for backward compatibility
    approvalRequired: bool = True
    allowSelfApproval: Optional[bool] = None  # Optional for backward compatibility with old records
    approvers: Optional[List[str]] = None
    approver_ids: Optional[List[str]] = None
    approver: Optional[str] = None
    approverId: Optional[str] = None
    revoker: Optional[str] = None
    revokerId: Optional[str] = None
    session_duration: Optional[str] = None
    error: Optional[str] = None
    queryId: Optional[str] = None  # CloudTrail Lake query ID


class ApproverItem(BaseModel):
    """DynamoDB approver item model"""
    model_config = ConfigDict(extra='allow')

    id: str  # Account ID or OU ID
    groupIds: List[str]  # IDC group IDs


class SettingsItem(BaseModel):
    """DynamoDB settings item model"""
    model_config = ConfigDict(extra='allow')

    id: Literal["settings"]
    approval: Optional[bool] = True
    expiry: Optional[int] = 3  # Hours until request expires
    duration: Optional[str] = "9"  # Max duration in hours
    comments: Optional[bool] = True  # Comments required for approval
    sesNotificationsEnabled: Optional[bool] = False
    sesSourceEmail: Optional[str] = None
    sesSourceArn: Optional[str] = None
    snsNotificationsEnabled: Optional[bool] = False
    slackNotificationsEnabled: Optional[bool] = False
    slackToken: Optional[str] = None
    slackAuditNotificationsChannel: Optional[str] = None
    teamAdminGroup: Optional[str] = None
    teamAuditorGroup: Optional[str] = None
    ticketNo: Optional[bool] = True  # Ticket number required


class EligibilityPolicyAccount(BaseModel):
    """Account in eligibility policy"""
    id: str
    name: str


class EligibilityPolicyOU(BaseModel):
    """OU in eligibility policy"""
    id: str
    name: Optional[str] = None


class EligibilityPolicyPermission(BaseModel):
    """Permission in eligibility policy"""
    id: str
    name: Optional[str] = None


class EligibilityItem(BaseModel):
    """DynamoDB eligibility/policy item model"""
    model_config = ConfigDict(extra='allow')

    id: str  # User ID or Group ID
    accounts: List[EligibilityPolicyAccount]
    ous: List[EligibilityPolicyOU]
    permissions: List[EligibilityPolicyPermission]
    approvalRequired: bool
    duration: str  # Max duration in hours
    autoApprovalOnCall: bool  # Auto-approve if user is on-call (required)
    allowSelfApproval: bool  # Allow user to approve their own requests (required)


class IntegrationItem(BaseModel):
    """DynamoDB integration item model"""
    model_config = ConfigDict(extra='allow')

    name: str
    params: Dict[str, str] = Field(default_factory=dict)
