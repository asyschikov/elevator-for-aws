#!/usr/bin/env python3
"""
Migration script to add allowSelfApproval and autoApprovalOnCall fields to existing eligibility policies.
Sets both fields to False for all existing policies that don't have these fields.

Usage:
    AWS_PROFILE=your-profile python add_allow_self_approval.py

Environment variables:
    ELIGIBILITY_TABLE_NAME - DynamoDB table name (default: elevator-eligibility-prod)
"""
import os
import boto3

TABLE_NAME = os.environ.get('ELIGIBILITY_TABLE_NAME', 'elevator-eligibility-prod')

def migrate():
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(TABLE_NAME)

    # Scan all items
    response = table.scan()
    items = response.get('Items', [])

    # Handle pagination
    while 'LastEvaluatedKey' in response:
        response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        items.extend(response.get('Items', []))

    print(f"Found {len(items)} eligibility policies")

    updated_count = 0
    for item in items:
        updates = []
        expr_values = {}

        if 'allowSelfApproval' not in item:
            updates.append('allowSelfApproval = :allowSelfApproval')
            expr_values[':allowSelfApproval'] = False

        if 'autoApprovalOnCall' not in item:
            updates.append('autoApprovalOnCall = :autoApprovalOnCall')
            expr_values[':autoApprovalOnCall'] = False

        if updates:
            table.update_item(
                Key={'id': item['id']},
                UpdateExpression='SET ' + ', '.join(updates),
                ExpressionAttributeValues=expr_values
            )
            print(f"Updated policy {item['id']} with {', '.join(updates)}")
            updated_count += 1

    print(f"\nMigration complete. Updated {updated_count} policies.")

if __name__ == '__main__':
    migrate()
