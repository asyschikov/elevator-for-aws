#!/usr/bin/env python3
"""
CLI wrapper around the Elevator IAM Identity Center SAML-app logic, for Terraform.

Terraform has no resource for an IdC "Custom SAML 2.0" application, so this reuses
the exact same logic the CDK stack runs from a Lambda custom resource
(lambda/idc-app/index.py) and runs it locally at apply/destroy time.

Usage:
  idc_app.py create --idc-region R --cognito-region R --user-pool-id ID \
      --oauth-domain PREFIX --access-group NAME [--app-name Elevator] \
      --output path/to/idc_app.json
  idc_app.py delete --idc-region R [--app-name Elevator]

Requires: boto3, and AWS credentials able to administer IAM Identity Center in
the given --idc-region.
"""

import argparse
import importlib.util
import json
import os
import sys

# Load the Lambda module (lambda/idc-app/index.py) by path and reuse its functions.
_HERE = os.path.dirname(os.path.abspath(__file__))
_LAMBDA = os.path.normpath(os.path.join(_HERE, "..", "..", "lambda", "idc-app", "index.py"))


def _load_idc_module():
    spec = importlib.util.spec_from_file_location("elevator_idc_app", _LAMBDA)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load IdC app logic from {_LAMBDA}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def cmd_create(idc, args):
    session = idc.get_session(args.idc_region)

    acs_url = (
        f"https://{args.oauth_domain}.auth.{args.cognito_region}"
        f".amazoncognito.com/saml2/idpresponse"
    )
    audience = f"urn:amazon:cognito:sp:{args.user_pool_id}"

    instance_arn, identity_store_id, owner_account_id = idc.get_sso_instance(session, args.idc_region)
    sso_instance_id = instance_arn.split("/")[-1]

    existing = idc.find_existing_app_by_name(session, args.idc_region, args.app_name)
    if existing:
        instance_id = existing["instanceId"]
        idc.update_idc_app(session, args.idc_region, instance_id, acs_url, audience)
    else:
        instance_id = idc.create_idc_app(
            session, args.idc_region, args.app_name,
            "Temporary Elevated Access Management", acs_url, audience,
        )

    app_arn = idc.build_app_arn(instance_id, owner_account_id, sso_instance_id)
    idc.assign_group_to_app(session, args.idc_region, app_arn, identity_store_id, args.access_group)

    app_instance = idc.get_application_instance(session, args.idc_region, instance_id)
    metadata_url = app_instance["identityProviderConfig"]["metadataUrl"]

    result = {
        "instanceId": instance_id,
        "applicationArn": app_arn,
        "metadataUrl": metadata_url,
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(result, f)
    print(f"IdC SAML app ready: {instance_id}", file=sys.stderr)


def cmd_delete(idc, args):
    session = idc.get_session(args.idc_region)
    existing = idc.find_existing_app_by_name(session, args.idc_region, args.app_name)
    if not existing:
        print(f"No IdC app named '{args.app_name}' — nothing to delete.", file=sys.stderr)
        return

    instance_id = existing["instanceId"]
    instance_arn, _identity_store_id, owner_account_id = idc.get_sso_instance(session, args.idc_region)
    sso_instance_id = instance_arn.split("/")[-1]
    app_arn = idc.build_app_arn(instance_id, owner_account_id, sso_instance_id)

    idc.delete_idc_app(session, args.idc_region, instance_id, app_arn)
    print(f"Deleted IdC SAML app: {instance_id}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Manage the Elevator IdC SAML application")
    sub = parser.add_subparsers(dest="command", required=True)

    c = sub.add_parser("create", help="create or update the IdC SAML app")
    c.add_argument("--idc-region", required=True)
    c.add_argument("--cognito-region", required=True)
    c.add_argument("--user-pool-id", required=True)
    c.add_argument("--oauth-domain", required=True, help="Cognito domain prefix")
    c.add_argument("--access-group", required=True)
    c.add_argument("--app-name", default="Elevator")
    c.add_argument("--output", required=True, help="path to write the result JSON")

    d = sub.add_parser("delete", help="delete the IdC SAML app (by display name)")
    d.add_argument("--idc-region", required=True)
    d.add_argument("--app-name", default="Elevator")

    args = parser.parse_args()
    idc = _load_idc_module()

    if args.command == "create":
        cmd_create(idc, args)
    elif args.command == "delete":
        cmd_delete(idc, args)


if __name__ == "__main__":
    main()
