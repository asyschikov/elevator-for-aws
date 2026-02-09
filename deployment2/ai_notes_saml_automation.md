# IAM Identity Center Undocumented API Notes

This document describes undocumented AWS APIs discovered through browser network inspection that can be used to fully automate IAM Identity Center SAML application management.

## Background

AWS IAM Identity Center (formerly AWS SSO) provides a web console for managing SAML applications, but the public boto3 `sso-admin` APIs have significant limitations:
- `create_application()` creates OIDC apps, not proper SAML apps
- No API to retrieve SAML metadata URL
- Cannot configure SAML-specific settings (ACS URL, audience, etc.)

Through browser network inspection using Playwright, we discovered the internal APIs the console uses.

## API Overview

### Endpoints

| Endpoint | Service Prefix | Purpose |
|----------|---------------|---------|
| `https://sso.{region}.amazonaws.com/control/` | `SWBService` | Application instance management |
| `https://sso.{region}.amazonaws.com/` | `SWBExternalService` | External APIs (mirrors boto3) |

### Authentication

All APIs use standard AWS SigV4 signing with:
- **Service name**: `sso`
- **Region**: The IAM Identity Center home region

### Request Format

```
POST {endpoint}
Content-Type: application/x-amz-json-1.1
X-Amz-Target: {ServicePrefix}.{Action}

{JSON payload}
```

## Complete SAML Application Creation Flow

The console uses these APIs in sequence to create a Custom SAML 2.0 application:

### Step 1: CreateApplicationInstance

Creates the application with the SAML template.

```
POST https://sso.{region}.amazonaws.com/control/
X-Amz-Target: SWBService.CreateApplicationInstance

{
  "templateId": "tpl-50e590700beb5208",
  "name": "uuid-for-internal-tracking"
}
```

**Response:**
```json
{
  "applicationInstance": {
    "instanceId": "ins-XXXXXXXXXX",
    ...
  }
}
```

**Key values:**
- `templateId`: `tpl-50e590700beb5208` is the template for Custom SAML 2.0 applications
- `name`: A UUID used internally (not displayed to users)
- Returns `instanceId` in format `ins-XXXXX`

### Step 2: UpdateApplicationInstanceDisplayData

Sets the display name and description.

```
POST https://sso.{region}.amazonaws.com/control/
X-Amz-Target: SWBService.UpdateApplicationInstanceDisplayData

{
  "instanceId": "ins-XXXXXXXXXX",
  "displayName": "Elevator",
  "description": "Temporary Elevated Access Management"
}
```

### Step 3: UpdateApplicationInstanceServiceProviderConfiguration

Configures the SAML service provider settings (ACS URL and audience).

```
POST https://sso.{region}.amazonaws.com/control/
X-Amz-Target: SWBService.UpdateApplicationInstanceServiceProviderConfiguration

{
  "instanceId": "ins-XXXXXXXXXX",
  "serviceProviderConfig": {
    "audience": "urn:amazon:cognito:sp:us-east-1_XXXXXXXX",
    "consumers": [{
      "location": "https://your-domain.auth.us-east-1.amazoncognito.com/saml2/idpresponse",
      "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
      "defaultValue": false
    }],
    "requireRequestSignature": false
  }
}
```

### Step 4: Configure SAML Attribute Mappings

Configure attribute mappings for Cognito federation. This requires TWO separate API calls.

#### Step 4a: UpdateApplicationInstanceResponseConfiguration

Sets the attribute values (what data to send in SAML response) and session TTL.

```
POST https://sso.{region}.amazonaws.com/control/
X-Amz-Target: SWBService.UpdateApplicationInstanceResponseConfiguration

{
  "instanceId": "ins-XXXXXXXXXX",
  "responseConfig": {
    "subject": {
      "source": ["${user:email}"]
    },
    "properties": {
      "Email": {
        "source": ["${user:email}"]
      }
    },
    "ttl": "PT1H"
  }
}
```

#### Step 4b: UpdateApplicationInstanceResponseSchemaConfiguration

Sets the attribute schema (format and inclusion settings).

```
POST https://sso.{region}.amazonaws.com/control/
X-Amz-Target: SWBService.UpdateApplicationInstanceResponseSchemaConfiguration

{
  "instanceId": "ins-XXXXXXXXXX",
  "responseSchemaConfig": {
    "subject": {
      "include": "REQUIRED",
      "nameIdFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
    },
    "properties": {
      "Email": {
        "attrNameFormat": "urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified",
        "include": "YES"
      }
    }
  }
}
```

**Note:** Cognito requires the `Email` attribute (capital E, singular) mapped to `${user:email}`. Using `emails` (lowercase, plural) will cause authentication to fail with "Invalid user attributes: emails: The attribute emails is required".

### Step 5: UpdateApplicationInstanceStatus

Enables the application.

```
POST https://sso.{region}.amazonaws.com/control/
X-Amz-Target: SWBService.UpdateApplicationInstanceStatus

{
  "instanceId": "ins-XXXXXXXXXX",
  "status": "ENABLED"
}
```

### Step 6: GetApplicationInstance

Retrieves full application details including the SAML metadata URL.

```
POST https://sso.{region}.amazonaws.com/control/
X-Amz-Target: SWBService.GetApplicationInstance

{
  "instanceId": "ins-XXXXXXXXXX"
}
```

**Response:**
```json
{
  "applicationInstance": {
    "instanceId": "ins-XXXXXXXXXX",
    "display": {
      "displayName": "Elevator",
      "description": "Temporary Elevated Access Management"
    },
    "identityProviderConfig": {
      "metadataUrl": "https://portal.sso.eu-west-1.amazonaws.com/saml/metadata/MTEzNDk...",
      "issuerUrl": "https://portal.sso.eu-west-1.amazonaws.com/saml/assertion/MTEzNDk...",
      "remoteLoginUrl": "https://portal.sso.eu-west-1.amazonaws.com/saml/assertion/MTEzNDk...",
      "remoteLogoutUrl": "https://portal.sso.eu-west-1.amazonaws.com/saml/logout/MTEzNDk..."
    },
    "serviceProviderConfig": {
      "audience": "urn:amazon:cognito:sp:us-east-1_XXXXXXXX",
      "consumers": [...]
    },
    "status": "ENABLED",
    "template": {
      "sSOProtocol": "SAML",
      "templateId": "tpl-50e590700beb5208"
    }
  }
}
```

## Instance ID Conversion

The `instanceId` parameter relates to the application ARN:

```
Application ARN: arn:aws:sso::113496420080:application/ssoins-6804720b33153235/apl-68044c9cb4b51402
                                                                               ^^^^
Instance ID:     ins-68044c9cb4b51402
                 ^^^^
```

**Rule**: Replace `apl-` prefix with `ins-`

## Python Implementation

### Dependencies

```bash
uv pip install requests requests-aws4auth boto3 --system
```

### Complete Example

```python
import uuid
import boto3
import requests
from requests_aws4auth import AWS4Auth

def get_swb_auth(region: str):
    """Get SigV4 auth for SWBService API calls."""
    session = boto3.Session(region_name=region)
    credentials = session.get_credentials().get_frozen_credentials()
    return AWS4Auth(
        credentials.access_key,
        credentials.secret_key,
        region,
        'sso',
        session_token=credentials.token
    )


def call_swb_api(region: str, action: str, payload: dict) -> dict:
    """Call the undocumented SWBService API."""
    endpoint = f'https://sso.{region}.amazonaws.com/control/'
    headers = {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': f'SWBService.{action}',
    }
    response = requests.post(
        endpoint, json=payload, headers=headers, auth=get_swb_auth(region)
    )
    response.raise_for_status()
    return response.json()


def create_saml_application(
    region: str,
    display_name: str,
    description: str,
    acs_url: str,
    audience: str
) -> dict:
    """Create a Custom SAML 2.0 application.

    Returns dict with instanceId and metadataUrl.
    """
    # Step 1: Create application instance
    create_resp = call_swb_api(region, 'CreateApplicationInstance', {
        'templateId': 'tpl-50e590700beb5208',  # Custom SAML 2.0 template
        'name': str(uuid.uuid4()),
    })
    instance_id = create_resp['applicationInstance']['instanceId']

    # Step 2: Set display data
    call_swb_api(region, 'UpdateApplicationInstanceDisplayData', {
        'instanceId': instance_id,
        'displayName': display_name,
        'description': description,
    })

    # Step 3: Configure service provider
    call_swb_api(region, 'UpdateApplicationInstanceServiceProviderConfiguration', {
        'instanceId': instance_id,
        'serviceProviderConfig': {
            'audience': audience,
            'consumers': [{
                'location': acs_url,
                'binding': 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
                'defaultValue': False,
            }],
            'requireRequestSignature': False,
        },
    })

    # Step 4a: Configure attribute values
    call_swb_api(region, 'UpdateApplicationInstanceResponseConfiguration', {
        'instanceId': instance_id,
        'responseConfig': {
            'subject': {'source': ['${user:email}']},
            'properties': {'Email': {'source': ['${user:email}']}},
            'ttl': 'PT1H',
        },
    })

    # Step 4b: Configure attribute schema
    call_swb_api(region, 'UpdateApplicationInstanceResponseSchemaConfiguration', {
        'instanceId': instance_id,
        'responseSchemaConfig': {
            'subject': {
                'include': 'REQUIRED',
                'nameIdFormat': 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
            },
            'properties': {
                'Email': {
                    'attrNameFormat': 'urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified',
                    'include': 'YES',
                },
            },
        },
    })

    # Step 5: Enable the application
    call_swb_api(region, 'UpdateApplicationInstanceStatus', {
        'instanceId': instance_id,
        'status': 'ENABLED',
    })

    # Step 6: Get the metadata URL
    app_instance = call_swb_api(region, 'GetApplicationInstance', {
        'instanceId': instance_id,
    })['applicationInstance']

    return {
        'instanceId': instance_id,
        'metadataUrl': app_instance['identityProviderConfig']['metadataUrl'],
        'displayName': app_instance['display']['displayName'],
    }


# Usage
result = create_saml_application(
    region='eu-west-1',
    display_name='My SAML App',
    description='My application description',
    acs_url='https://my-domain.auth.us-east-1.amazoncognito.com/saml2/idpresponse',
    audience='urn:amazon:cognito:sp:us-east-1_XXXXXXXX',
)
print(f"Created app: {result['instanceId']}")
print(f"Metadata URL: {result['metadataUrl']}")
```

## Application Deletion Flow

To delete an application, you must first delete assignments and profiles:

### Step 1: ListApplicationAssignments (SWBExternalService)

List all group/user assignments for the application.

```
POST https://sso.{region}.amazonaws.com/
X-Amz-Target: SWBExternalService.ListApplicationAssignments

{
  "ApplicationArn": "arn:aws:sso::{account}:application/{sso-instance-id}/{app-id}"
}
```

**Response:**
```json
{
  "ApplicationAssignments": [
    {
      "ApplicationArn": "arn:aws:sso::...",
      "PrincipalId": "62e57434-40e1-70ab-8d99-3983a9e8fa53",
      "PrincipalType": "GROUP"
    }
  ]
}
```

### Step 2: DeleteApplicationAssignment (SWBExternalService)

Delete each assignment.

```
POST https://sso.{region}.amazonaws.com/
X-Amz-Target: SWBExternalService.DeleteApplicationAssignment

{
  "ApplicationArn": "arn:aws:sso::{account}:application/{sso-instance-id}/{app-id}",
  "PrincipalId": "62e57434-40e1-70ab-8d99-3983a9e8fa53",
  "PrincipalType": "GROUP"
}
```

### Step 3: ListProfiles

Get all profiles associated with the application.

```
POST https://sso.{region}.amazonaws.com/control/
X-Amz-Target: SWBService.ListProfiles

{
  "instanceId": "ins-XXXXXXXXXX"
}
```

**Response:**
```json
{
  "applicationProfiles": [
    {
      "name": "Default",
      "profileId": "p-XXXXXXXXXX",
      "status": "ENABLED"
    }
  ]
}
```

**Note:** The response key is `applicationProfiles`, not `profiles`.

### Step 4: DeleteProfile

Delete each profile returned from ListProfiles.

```
POST https://sso.{region}.amazonaws.com/control/
X-Amz-Target: SWBService.DeleteProfile

{
  "profileId": "p-XXXXXXXXXX",
  "instanceId": "ins-XXXXXXXXXX"
}
```

### Step 5: DeleteApplicationInstance

After all assignments and profiles are deleted, delete the application instance.

```
POST https://sso.{region}.amazonaws.com/control/
X-Amz-Target: SWBService.DeleteApplicationInstance

{
  "instanceId": "ins-XXXXXXXXXX"
}
```

## Other Discovered APIs

| X-Amz-Target | Purpose |
|--------------|---------|
| `SWBService.ListApplicationTemplates` | List available application templates |
| `SWBService.ListApplicationInstances` | List all application instances |
| `SWBService.ListApplicationInstanceCertificates` | List SAML certificates for an app |
| `SWBService.ListProfiles` | List profiles (assignments) for an app |
| `SWBService.DeleteProfile` | Delete a profile (assignment) |
| `SWBService.DeleteApplicationInstance` | Delete an application instance |
| `SWBService.DescribeRegisteredRegions` | List registered regions |
| `SWBService.ListDirectoryAssociations` | List directory associations |
| `SWBService.UpdateApplicationInstanceResponseConfiguration` | Set SAML attribute values |
| `SWBService.UpdateApplicationInstanceResponseSchemaConfiguration` | Set SAML attribute schema/format |
| `SWBExternalService.ListInstances` | List SSO instances (mirrors boto3) |
| `SWBExternalService.DescribeApplication` | Describe application (mirrors boto3) |
| `SWBExternalService.ListApplicationAssignments` | List app assignments (mirrors boto3) |
| `SWBExternalService.CreateApplicationAssignment` | Assign user/group to app |
| `SWBExternalService.DeleteApplicationAssignment` | Remove user/group from app |

## Known Template IDs

| Template ID | Application Type |
|-------------|-----------------|
| `tpl-50e590700beb5208` | Custom SAML 2.0 application |

## Metadata URL Encoding

The metadata URL contains a base64-encoded identifier:

```
https://portal.sso.{region}.amazonaws.com/saml/metadata/{encoded_id}
```

The encoded ID decodes to: `{owner_account_id}_ins-{app_id_suffix}`

Example:
- Encoded: `MTEzNDk2NDIwMDgwX2lucy02ODA0NGM5Y2I0YjUxNDAy`
- Decoded: `113496420080_ins-68044c9cb4b51402`

## Discovery Method

These APIs were discovered using Playwright browser automation:

1. Navigate to IAM Identity Center console
2. Set up request interception with `page.route()`
3. Go through the "Add application" wizard
4. Capture all requests to `sso.*.amazonaws.com`
5. Extract `X-Amz-Target` headers and request payloads
6. Replay requests with Python using `requests` + `requests-aws4auth`

```python
# Playwright request interception setup
intercepted_requests = []

await page.route('**/sso.*.amazonaws.com/**', async route, request => {
    intercepted_requests.append({
        'url': request.url,
        'xAmzTarget': request.headers.get('x-amz-target'),
        'postData': request.post_data,
    })
    await route.continue_()
})
```

## Caveats

1. **Undocumented API**: These APIs are not officially supported and could change without notice
2. **No SLA**: AWS provides no guarantees for internal APIs
3. **Region-specific**: The `sso.{region}.amazonaws.com` endpoint must match your IAM Identity Center home region

## References

- [boto3 sso-admin documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/sso-admin.html)
- [requests-aws4auth](https://pypi.org/project/requests-aws4auth/)
