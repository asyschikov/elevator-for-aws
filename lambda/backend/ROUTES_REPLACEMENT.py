# =============================================================================
# Requests CRUD Routes (with business logic)
# =============================================================================

@app.get("/requests")
def list_requests(limit: Optional[str] = None, lastKey: Optional[str] = None) -> DynamoDBScanResponse:
    """List all requests"""
    if limit and lastKey:
        import urllib.parse
        result = requests_table.scan(
            Limit=int(limit),
            ExclusiveStartKey=json.loads(urllib.parse.unquote(lastKey))
        )
    elif limit:
        result = requests_table.scan(Limit=int(limit))
    elif lastKey:
        import urllib.parse
        result = requests_table.scan(
            ExclusiveStartKey=json.loads(urllib.parse.unquote(lastKey))
        )
    else:
        result = requests_table.scan()

    return DynamoDBScanResponse(
        items=result.Items or [],
        lastKey=result.LastEvaluatedKey
    )


@app.get("/requests/<request_id>")
def get_request(request_id: str) -> Dict[str, Any]:
    """Get a single request by ID"""
    response = requests_table.get_item(Key={'id': request_id})
    item = response.Item

    if not item:
        raise NotFoundError(f"Request '{request_id}' not found")

    return item


@app.post("/requests")
def create_request(body: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new request with business logic"""
    if not body.get('id'):
        body['id'] = str(uuid.uuid4())

    requests_table.put_item(Item=body)

    try:
        request = RequestItem(**body)
        request_id = request.id
        username = request.username
        status = request.status

        # Check if request needs enrichment
        if status == "pending" and not request.email:
            logger.info("Enriching new request", extra={"request_id": request_id})
            # Enrich with email, approvers, session_duration
            update_request_details(request_id, username, request.accountId, request.roleId)

            # Re-fetch enriched request
            enriched_response = requests_table.get_item(Key={'id': request_id})
            request_data = enriched_response.Item or body
            request = RequestItem(**request_data)

        # Get settings
        settings_response = settings_table.get_item(Key={'id': 'settings'})
        item_settings = settings_response.Item or {}
        settings_obj = SettingsItem(**item_settings) if item_settings else SettingsItem(id="settings")

        approval_required = settings_obj.approval if settings_obj.approval is not None else True
        max_duration = settings_obj.duration or "9"

        # Validate max duration
        if int(request.time) > int(max_duration):
            logger.error("Request duration exceeds max", extra={"request_id": request_id, "requested": request.time, "max": max_duration})
            update_request_directly(UpdateRequestInput(id=request_id, status='error'))
            raise BadRequestError(f"Request duration {request.time} exceeds maximum {max_duration}")

        # Check eligibility
        if status == "pending":
            # Get user ID (strip idc_ prefix if present)
            clean_username = username[4:] if username.startswith('idc_') else username
            try:
                user_id = get_user(clean_username)
            except Exception as e:
                logger.error("Failed to get user ID", extra={"username": clean_username, "error": str(e)})
                update_request_directly(UpdateRequestInput(id=request_id, status='error'))
                raise BadRequestError(f"Failed to get user ID for {clean_username}")

            # Update request with userId
            update_request_directly(UpdateRequestInput(id=request_id, userId=user_id))
            request.userId = user_id

            # Check eligibility
            eligibility_result = get_eligibility(request, user_id)
            if not eligibility_result:
                logger.error("Eligibility check failed", extra={"request_id": request_id})
                raise BadRequestError("Request not eligible: check account, role, and duration permissions")

            # Update approval_required based on eligibility
            if eligibility_result.approval:
                approval_required = eligibility_result.approval
                update_request_directly(UpdateRequestInput(id=request_id, approvalRequired=approval_required))

            # If no approval required, automatically trigger grant
            if not approval_required:
                logger.info("No approval required, granting immediately", extra={"request_id": request_id})
                # Re-fetch to get latest data
                latest_response = requests_table.get_item(Key={'id': request_id})
                latest_request = RequestItem(**latest_response.Item)
                task_grant(latest_request)
            else:
                # Send pending notification to approvers
                logger.info("Approval required, notifying approvers", extra={"request_id": request_id})
                notification_dict = request.model_dump()
                notification_dict['status'] = 'pending'
                notification_dict['approvalRequired'] = approval_required
                notification_event = NotificationEvent(**notification_dict)
                handle_notifications(notification_event)

        # Return updated request
        final_response = requests_table.get_item(Key={'id': request_id})
        return final_response.Item or body

    except Exception as e:
        logger.error("Error processing request", extra={"request_id": body.get('id'), "error": str(e)})
        if isinstance(e, BadRequestError):
            raise
        # For unexpected errors, mark as error and re-raise
        if body.get('id'):
            update_request_directly(UpdateRequestInput(id=body['id'], status='error'))
        raise BadRequestError(f"Error processing request: {str(e)}")


@app.put("/requests/<request_id>")
def update_request(request_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing request with workflow logic"""
    update_expr = []
    expr_names = {}
    expr_values = {}

    for idx, (key, value) in enumerate(body.items()):
        if key != 'id':
            update_expr.append(f'#attr{idx} = :val{idx}')
            expr_names[f'#attr{idx}'] = key
            expr_values[f':val{idx}'] = value

    result = requests_table.update_item(
        Key={'id': request_id},
        UpdateExpression='SET ' + ', '.join(update_expr),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues='ALL_NEW'
    )

    updated_item = result.get('Attributes', {})

    try:
        request = RequestItem(**updated_item)
        status = request.status

        # Enrich with approver/revoker details if needed
        if status in ["approved", "rejected"] and not request.approver and request.approverId:
            logger.info("Enriching with approver details", extra={"request_id": request_id})
            update_approver_details(request_id, request.approverId)
            # Re-fetch
            updated_response = requests_table.get_item(Key={'id': request_id})
            updated_item = updated_response.Item
            request = RequestItem(**updated_item)

        if status == "revoked" and not request.revoker and request.revokerId:
            logger.info("Enriching with revoker details", extra={"request_id": request_id})
            update_revoker_details(request_id, request.revokerId)
            # Re-fetch
            updated_response = requests_table.get_item(Key={'id': request_id})
            updated_item = updated_response.Item
            request = RequestItem(**updated_item)

        # Get settings
        settings_response = settings_table.get_item(Key={'id': 'settings'})
        item_settings = settings_response.Item or {}
        settings_obj = SettingsItem(**item_settings) if item_settings else SettingsItem(id="settings")
        approval_required = settings_obj.approval if settings_obj.approval is not None else True

        # Handle workflow based on status
        if status == "approved" and approval_required:
            # Validate approver != requester (prevent self-approval)
            if request.email == request.approver:
                logger.error("Self-approval not allowed", extra={"request_id": request_id})
                update_request_directly(UpdateRequestInput(id=request_id, status='error'))
                raise BadRequestError("Self-approval not allowed")

            # Check if startTime is in the future
            if request.startTime:
                start_datetime = parser.parse(request.startTime).astimezone(timezone.utc)
                current_datetime = datetime.now(timezone.utc)

                if current_datetime < start_datetime:
                    # Schedule for future
                    logger.info("Scheduling future grant", extra={"request_id": request_id, "startTime": request.startTime})
                    # TODO: Add EventBridge scheduling for future grants (similar to revoke scheduling)
                    # For now, send scheduled notification
                    notification_dict = request.model_dump()
                    notification_dict['status'] = 'scheduled'
                    notification_event = NotificationEvent(**notification_dict)
                    handle_notifications(notification_event)
                else:
                    # Grant immediately
                    logger.info("Granting immediately after approval", extra={"request_id": request_id})
                    task_grant(request)
            else:
                # No startTime, grant immediately
                logger.info("Granting immediately after approval", extra={"request_id": request_id})
                task_grant(request)

        elif status == "rejected" and approval_required:
            # Validate approver != requester
            if request.email == request.approver:
                logger.error("Self-rejection not allowed", extra={"request_id": request_id})
                update_request_directly(UpdateRequestInput(id=request_id, status='error'))
                raise BadRequestError("Self-rejection not allowed")

            # Send rejection notification
            logger.info("Sending rejection notification", extra={"request_id": request_id})
            notification_dict = request.model_dump()
            notification_dict['status'] = 'rejected'
            notification_event = NotificationEvent(**notification_dict)
            handle_notifications(notification_event)

        elif status == "cancelled":
            # Send cancellation notification
            logger.info("Sending cancellation notification", extra={"request_id": request_id})
            notification_dict = request.model_dump()
            notification_dict['status'] = 'cancelled'
            notification_event = NotificationEvent(**notification_dict)
            handle_notifications(notification_event)

        elif status == "revoked":
            # Trigger revoke task
            logger.info("Revoking access", extra={"request_id": request_id})
            task_revoke(request)

        # Return final updated request
        final_response = requests_table.get_item(Key={'id': request_id})
        return final_response.Item or updated_item

    except Exception as e:
        logger.error("Error processing request update", extra={"request_id": request_id, "error": str(e)})
        if isinstance(e, BadRequestError):
            raise
        # For unexpected errors, mark as error and re-raise
        update_request_directly(UpdateRequestInput(id=request_id, status='error'))
        raise BadRequestError(f"Error processing request update: {str(e)}")


@app.delete("/requests/<request_id>")
def delete_request(request_id: str) -> None:
    """Delete a request"""
    requests_table.delete_item(Key={'id': request_id})


# =============================================================================
# Generic CRUD Routes for other resources
# =============================================================================

def _list_resource(table: Table, limit: Optional[str], lastKey: Optional[str]) -> DynamoDBScanResponse:
    """Helper function for listing resources"""
    if limit and lastKey:
        import urllib.parse
        result = table.scan(
            Limit=int(limit),
            ExclusiveStartKey=json.loads(urllib.parse.unquote(lastKey))
        )
    elif limit:
        result = table.scan(Limit=int(limit))
    elif lastKey:
        import urllib.parse
        result = table.scan(
            ExclusiveStartKey=json.loads(urllib.parse.unquote(lastKey))
        )
    else:
        result = table.scan()

    return DynamoDBScanResponse(
        items=result.Items or [],
        lastKey=result.LastEvaluatedKey
    )


def _update_resource(table: Table, resource_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Helper function for updating resources"""
    update_expr = []
    expr_names = {}
    expr_values = {}

    for idx, (key, value) in enumerate(body.items()):
        if key != 'id':
            update_expr.append(f'#attr{idx} = :val{idx}')
            expr_names[f'#attr{idx}'] = key
            expr_values[f':val{idx}'] = value

    result = table.update_item(
        Key={'id': resource_id},
        UpdateExpression='SET ' + ', '.join(update_expr),
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
        ReturnValues='ALL_NEW'
    )

    return result.get('Attributes', {})


# Sessions routes
@app.get("/sessions")
def list_sessions(limit: Optional[str] = None, lastKey: Optional[str] = None) -> DynamoDBScanResponse:
    """List all sessions"""
    return _list_resource(sessions_table, limit, lastKey)


@app.get("/sessions/<session_id>")
def get_session(session_id: str) -> Dict[str, Any]:
    """Get a single session by ID"""
    response = sessions_table.get_item(Key={'id': session_id})
    if not response.Item:
        raise NotFoundError(f"Session '{session_id}' not found")
    return response.Item


@app.post("/sessions")
def create_session(body: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new session"""
    if not body.get('id'):
        body['id'] = str(uuid.uuid4())
    sessions_table.put_item(Item=body)
    return body


@app.put("/sessions/<session_id>")
def update_session(session_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing session"""
    return _update_resource(sessions_table, session_id, body)


@app.delete("/sessions/<session_id>")
def delete_session(session_id: str) -> None:
    """Delete a session"""
    sessions_table.delete_item(Key={'id': session_id})


# Approvers routes
@app.get("/approvers")
def list_approvers_route(limit: Optional[str] = None, lastKey: Optional[str] = None) -> DynamoDBScanResponse:
    """List all approvers"""
    return _list_resource(approvers_table, limit, lastKey)


@app.get("/approvers/<approver_id>")
def get_approver(approver_id: str) -> Dict[str, Any]:
    """Get a single approver by ID"""
    response = approvers_table.get_item(Key={'id': approver_id})
    if not response.Item:
        raise NotFoundError(f"Approver '{approver_id}' not found")
    return response.Item


@app.post("/approvers")
def create_approver(body: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new approver"""
    if not body.get('id'):
        body['id'] = str(uuid.uuid4())
    approvers_table.put_item(Item=body)
    return body


@app.put("/approvers/<approver_id>")
def update_approver(approver_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing approver"""
    return _update_resource(approvers_table, approver_id, body)


@app.delete("/approvers/<approver_id>")
def delete_approver(approver_id: str) -> None:
    """Delete an approver"""
    approvers_table.delete_item(Key={'id': approver_id})


# Settings routes
@app.get("/settings")
def list_settings_route(limit: Optional[str] = None, lastKey: Optional[str] = None) -> DynamoDBScanResponse:
    """List all settings"""
    return _list_resource(settings_table, limit, lastKey)


@app.get("/settings/<setting_id>")
def get_setting(setting_id: str) -> Dict[str, Any]:
    """Get a single setting by ID"""
    response = settings_table.get_item(Key={'id': setting_id})
    if not response.Item:
        raise NotFoundError(f"Setting '{setting_id}' not found")
    return response.Item


@app.post("/settings")
def create_setting(body: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new setting"""
    if not body.get('id'):
        body['id'] = str(uuid.uuid4())
    settings_table.put_item(Item=body)
    return body


@app.put("/settings/<setting_id>")
def update_setting(setting_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing setting"""
    return _update_resource(settings_table, setting_id, body)


@app.delete("/settings/<setting_id>")
def delete_setting(setting_id: str) -> None:
    """Delete a setting"""
    settings_table.delete_item(Key={'id': setting_id})


# Eligibility routes
@app.get("/eligibility")
def list_eligibility_route(limit: Optional[str] = None, lastKey: Optional[str] = None) -> DynamoDBScanResponse:
    """List all eligibility policies"""
    return _list_resource(eligibility_table, limit, lastKey)


@app.get("/eligibility/<eligibility_id>")
def get_eligibility_item(eligibility_id: str) -> Dict[str, Any]:
    """Get a single eligibility policy by ID"""
    response = eligibility_table.get_item(Key={'id': eligibility_id})
    if not response.Item:
        raise NotFoundError(f"Eligibility policy '{eligibility_id}' not found")
    return response.Item


@app.post("/eligibility")
def create_eligibility_item(body: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new eligibility policy"""
    if not body.get('id'):
        body['id'] = str(uuid.uuid4())
    eligibility_table.put_item(Item=body)
    return body


@app.put("/eligibility/<eligibility_id>")
def update_eligibility_item(eligibility_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing eligibility policy"""
    return _update_resource(eligibility_table, eligibility_id, body)


@app.delete("/eligibility/<eligibility_id>")
def delete_eligibility_item(eligibility_id: str) -> None:
    """Delete an eligibility policy"""
    eligibility_table.delete_item(Key={'id': eligibility_id})
