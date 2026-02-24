"""
Migration: Add sessionStatus field to existing requests.

Sets sessionStatus based on current status:
- granted -> in-progress
- ended / revoked -> finished
- all others -> not-started

Usage:
    python add_session_status.py <TABLE_NAME> [--dry-run]
"""
import sys
import boto3

def migrate(table_name: str, dry_run: bool = False):
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(table_name)

    status_map = {
        'granted': 'in-progress',
        'ended': 'finished',
        'revoked': 'finished',
    }

    scan_kwargs = {}
    updated = 0
    scanned = 0

    while True:
        response = table.scan(**scan_kwargs)
        items = response.get('Items', [])

        for item in items:
            scanned += 1
            request_id = item['id']
            status = item.get('status', '')
            current_session_status = item.get('sessionStatus')

            if current_session_status:
                continue  # Already migrated

            new_session_status = status_map.get(status, 'not-started')

            if dry_run:
                print(f"[DRY RUN] {request_id}: status={status} -> sessionStatus={new_session_status}")
            else:
                table.update_item(
                    Key={'id': request_id},
                    UpdateExpression='SET sessionStatus = :ss',
                    ExpressionAttributeValues={':ss': new_session_status},
                )
                print(f"Updated {request_id}: sessionStatus={new_session_status}")
            updated += 1

        last_key = response.get('LastEvaluatedKey')
        if not last_key:
            break
        scan_kwargs['ExclusiveStartKey'] = last_key

    print(f"\nScanned {scanned} items, {'would update' if dry_run else 'updated'} {updated} items.")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python add_session_status.py <TABLE_NAME> [--dry-run]")
        sys.exit(1)

    table_name = sys.argv[1]
    dry_run = '--dry-run' in sys.argv
    migrate(table_name, dry_run)
