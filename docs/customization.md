# Elevator — Customization Guide

Two kinds of customization:

- **Runtime configuration** — done by admins in the app UI, stored in DynamoDB. No
  code change or redeploy.
- **Code customization** — new behavior (e.g. a new integration), which you build,
  regenerate types for, and deploy.

## Runtime configuration (no deploy)

Signed in as an admin (a member of `ELEVATOR_ADMIN_GROUP`), you can configure:

| Area | Where | What |
|------|-------|------|
| **Eligibility** | Admin → Eligible | Who (user/IdC group) may request which accounts + permission sets, max **duration**, whether **approval is required**, **self-approval**, and **auto-approval when on-call**. Stored in `elevator-eligibility-<env>`. |
| **Approvers** | Admin → Approvers | Who approves requests for which scope. Stored in `elevator-approvers-<env>`. |
| **Settings** | Admin → Settings | Notification channels (SNS / SES / Slack), admin & auditor groups, etc. Stored in `elevator-settings-<env>`. |
| **Integrations** | Admin → Integrations | Config for third-party integrations (e.g. on-call). Stored in `elevator-integrations-<env>`. |

Session duration limits, approval requirements, and auto-approval-on-call are all
**eligibility-policy** properties — change them in *Eligible*, not in code.

## How integrations work

An integration is a single DynamoDB record in `elevator-integrations-<env>`:

```json
{ "name": "betterstack", "params": { "api_token": "...", "schedule_id": "..." } }
```

- **CRUD API:** `GET/POST/PUT/DELETE /integrations` (backend, `lambda/backend/index.py`).
- **Allowed names** are gated by a type in `lambda/backend/models/api_models.py`:
  ```python
  ALLOWED_INTEGRATION_NAMES = Literal["betterstack"]
  ```
- **Admin UI** is driven by a registry in `src/components/Admin/Integrations.tsx`
  (`KNOWN_INTEGRATIONS`) — each entry declares the fields an admin fills in.
- **Feature code** reads the record and calls the external service. The built-in
  example is on-call: `check_user_on_call()` reads the `betterstack` record's `params`
  and queries the BetterStack API. On-call drives **auto-approval**: a request is
  auto-approved when the policy sets `autoApprovalOnCall` **and** the requester is
  currently on-call.

## Worked example: add a PagerDuty on-call integration

Goal: let deployments use **PagerDuty** as the on-call source instead of BetterStack.
Five steps: backend model → backend logic → frontend UI → regenerate types → deploy.

### 1. Allow the new integration name (backend)

`lambda/backend/models/api_models.py`:

```python
# before
ALLOWED_INTEGRATION_NAMES = Literal["betterstack"]
# after
ALLOWED_INTEGRATION_NAMES = Literal["betterstack", "pagerduty"]
```

This lets `POST /integrations` accept `{"name": "pagerduty", "params": {...}}`.

### 2. Implement the provider logic (backend)

In `lambda/backend/index.py`, add a PagerDuty check alongside the existing
`check_user_on_call`, then make on-call provider-aware. Reuse the existing helpers
(`integrations_table`, `http_requests`, `logger`):

```python
def _pagerduty_on_call_emails(params: dict) -> list[str]:
    api_token = params.get("api_token")
    schedule_id = params.get("schedule_id")
    if not api_token or not schedule_id:
        return []
    resp = http_requests.get(
        f"https://api.pagerduty.com/schedules/{schedule_id}/users",
        headers={"Authorization": f"Token token={api_token}",
                 "Accept": "application/vnd.pagerduty+json;version=2"},
        params={"since": "now", "until": "now"},
        timeout=5,
    )
    resp.raise_for_status()
    return [u.get("email", "").lower() for u in resp.json().get("users", [])]


def check_user_on_call(user_email: str) -> bool:
    """Return True if the user is on-call in whichever provider is configured."""
    try:
        # Prefer PagerDuty if configured, else fall back to BetterStack.
        pd = integrations_table.get_item(Key={"name": "pagerduty"}).get("Item")
        if pd:
            return user_email.lower() in _pagerduty_on_call_emails(pd.get("params", {}))
        # ... existing BetterStack logic unchanged ...
    except Exception as e:
        logger.warning("On-call check failed", extra={"error": str(e)})
        return False
```

Because auto-approval already calls `check_user_on_call(request.email)`, no other flow
needs to change. (If you also expose on-call users via `GET /on-call`, generalize that
endpoint the same way.)

### 3. Add it to the admin UI (frontend)

`src/components/Admin/Integrations.tsx` — add an entry to `KNOWN_INTEGRATIONS` so
admins can enter the credentials:

```ts
const KNOWN_INTEGRATIONS = [
  { name: "betterstack" as const, label: "BetterStack", /* ... */ },
  {
    name: "pagerduty" as const,
    label: "PagerDuty",
    description: "On-call schedule integration with PagerDuty",
    fields: [
      { key: "api_token", label: "API Token", sensitive: true },
      { key: "schedule_id", label: "Schedule ID", sensitive: false },
    ],
  },
];
```

Sensitive fields are masked in the UI. Params are stored as-is in DynamoDB.

### 4. Regenerate the API types

You changed a backend model (`ALLOWED_INTEGRATION_NAMES`), so regenerate the spec and
the frontend types (otherwise `"pagerduty" as const` won't type-check):

```bash
cd lambda/backend && uv run python generate_openapi.py > ../../openapi.json
cd ../.. && npm run generate:api
```

### 5. Deploy

- **Local:** `cd deployment && ./03-deploy.sh` (or `deploy-frontend.sh` if you only
  touched the frontend — but this change touches the backend, so use `03-deploy.sh`).
- **Pipeline:** commit and push to the pipeline's branch, then run the pipeline and
  approve `Approve-Prod`. (Config in SSM is unchanged, so no `config-put.sh` needed.)

Then, as an admin, open **Admin → Integrations**, add the **PagerDuty** integration,
and enter the token + schedule ID. Requests with an *auto-approve on-call* policy will
now auto-approve for whoever PagerDuty reports as on-call.

## Pattern for other integrations

The same three-layer pattern (allowed name → feature code → UI registry) applies to any
integration — a webhook notifier, a ticketing system, an SSO directory sync, etc.:

1. Add the name to `ALLOWED_INTEGRATION_NAMES`.
2. In the relevant flow, `integrations_table.get_item(Key={"name": "<name>"})`, read
   `params`, and call the external service.
3. Add a `KNOWN_INTEGRATIONS` entry for the admin UI, regenerate types, deploy.

For a **notification-style** integration, hook your call into the notification path
(`send_sns_notification` and friends in `lambda/backend/index.py`) rather than the
on-call path.

## Branding

- **App title:** `<title>` in `index.html`.
- **Logo:** `public/logo.svg` (referenced from the top navigation in
  `src/components/Navigation/Header.tsx`).
- **Colors / layout:** the app uses Cloudscape components; theme via Cloudscape global
  styles / design tokens.

Rebuild + redeploy the frontend after branding changes
(`cd deployment && ./deploy-frontend.sh`, or through the pipeline).

## Deploying customizations — summary

| Change | Regenerate types? | Deploy with |
|--------|-------------------|-------------|
| Runtime config (eligibility, approvers, settings, integration values) | no | nothing — it's in the app UI |
| Frontend-only (branding, UI) | no | `deploy-frontend.sh` or pipeline |
| Backend logic only | no | `03-deploy.sh` or pipeline |
| Backend **API models / endpoints** | **yes** (`generate_openapi.py` + `npm run generate:api`) | `03-deploy.sh` or pipeline |

Remember: if an environment is **pipeline-managed**, deploy through the pipeline rather
than `03-deploy.sh`.
