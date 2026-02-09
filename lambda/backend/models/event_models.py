"""
Event models for Elevator Lambda backend.
Defines data structures for Lambda event sources.
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict


# =============================================================================
# Cognito Models
# =============================================================================

class CognitoPreTokenGenerationEvent(BaseModel):
    """Cognito Pre-Token Generation event"""
    model_config = ConfigDict(extra='allow')

    version: str
    triggerSource: str
    region: str
    userPoolId: str
    userName: str
    request: Dict[str, Any]
    response: Optional[Dict[str, Any]] = None
