"""
Migration: Clean up identity fields in requests table.

Strips IDC_/idc_ prefixes from username fields and replaces
idc_-prefixed approver_ids with corresponding email from approvers list.

Usage:
    python clean_usernames.py <TABLE_NAME> [--dry-run]
"""
import sys
import boto3


def migrate(table_name: str, dry_run: bool = False):
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(table_name)

    scan_kwargs = {}
    updated = 0
    scanned = 0

    while True:
        response = table.scan(**scan_kwargs)
        items = response.get('Items', [])

        for item in items:
            scanned += 1
            request_id = item['id']
            updates = {}

            # Clean username: strip IDC_/idc_ prefix
            username = item.get('username', '')
            if username.lower().startswith('idc_'):
                updates['username'] = username[4:]

            # Clean approver_ids: replace idc_-prefixed entries with emails
            approver_ids = item.get('approver_ids', [])
            approvers = item.get('approvers', [])
            if approver_ids and approvers and len(approver_ids) == len(approvers):
                new_ids = []
                changed = False
                for aid, email in zip(approver_ids, approvers):
                    if aid.lower().startswith('idc_'):
                        new_ids.append(email)
                        changed = True
                    else:
                        new_ids.append(aid)
                if changed:
                    updates['approver_ids'] = new_ids

            if not updates:
                continue

            if dry_run:
                print(f"[DRY RUN] {request_id}: {updates}")
            else:
                expr_parts = []
                expr_names = {}
                expr_values = {}
                for idx, (key, value) in enumerate(updates.items()):
                    expr_parts.append(f'#a{idx} = :v{idx}')
                    expr_names[f'#a{idx}'] = key
                    expr_values[f':v{idx}'] = value

                table.update_item(
                    Key={'id': request_id},
                    UpdateExpression='SET ' + ', '.join(expr_parts),
                    ExpressionAttributeNames=expr_names,
                    ExpressionAttributeValues=expr_values,
                )
                print(f"Updated {request_id}: {updates}")
            updated += 1

        last_key = response.get('LastEvaluatedKey')
        if not last_key:
            break
        scan_kwargs['ExclusiveStartKey'] = last_key

    print(f"\nScanned {scanned} items, {'would update' if dry_run else 'updated'} {updated} items.")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python clean_usernames.py <TABLE_NAME> [--dry-run]")
        sys.exit(1)

    table_name = sys.argv[1]
    dry_run = '--dry-run' in sys.argv
    migrate(table_name, dry_run)
