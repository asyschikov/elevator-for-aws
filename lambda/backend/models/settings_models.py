"""
Environment settings models for Elevator Lambda backend.
Uses Pydantic Settings for environment variable management.
All fields are required (non-nullable).
Pydantic automatically matches snake_case field names to UPPERCASE environment variables.
"""
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class EnvironmentSettings(BaseSettings):
    """Environment settings loaded from environment variables"""
    model_config = SettingsConfigDict(
        env_file=None,  # Don't load from .env file
        case_sensitive=False,
        extra='ignore',
    )

    # DynamoDB table names - all required
    requests_table: str
    sessions_table: str
    approvers_table: str
    settings_table: str
    eligibility_table: str
    policy_table_name: str
    integrations_table: str

    # AWS configuration - all required
    auth_elevator_userpoolid: str = ''
    account_id: str

    # IAM Identity Center region (if different from Lambda region)
    idc_region: Optional[str] = None

    # AWS resources - all required
    sns_topic_arn: str
    elevator_login_url: str
    event_data_store_arn: str
    revoke_rule_name: str

    # Lambda function ARNs
    revocation_function_arn: str = ''

    # Cognito groups - all required
    elevator_admin_group: str
    elevator_auditor_group: str

