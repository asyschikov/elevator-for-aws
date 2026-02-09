"""
AWS service models for Elevator Lambda backend.
Defines all data structures for AWS service responses.
"""
from typing import Optional, Dict, List
from pydantic import BaseModel


class SSOInstance(BaseModel):
    """AWS SSO Instance model"""
    InstanceArn: str
    IdentityStoreId: str


class AccountInfo(BaseModel):
    """AWS Account information"""
    name: str
    id: str


class PermissionSetInfo(BaseModel):
    """Permission Set information"""
    id: str
    name: str


class GroupInfo(BaseModel):
    """Identity Center Group information"""
    GroupId: str
    DisplayName: str


class UserInfo(BaseModel):
    """Identity Center User information"""
    UserId: str
    UserName: str


class OUInfo(BaseModel):
    """Organizational Unit information"""
    Id: str
    Name: Optional[str] = None


class GroupMembership(BaseModel):
    """Identity Center group membership"""
    IdentityStoreId: str
    MembershipId: str
    GroupId: str
    MemberId: Dict[str, str]  # {"UserId": "..."} or {"GroupId": "..."}
