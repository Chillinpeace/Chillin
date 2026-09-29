# Peacely Test / Sandbox Mode

Phase A adds a safe simulation layer for provider workflows without changing the existing payment, verification, WhatsApp or AI integrations.

## Environment

Set one of:

- `PEACELY_ENV=development` — mock providers by default.
- `PEACELY_ENV=staging` — use sandbox/test credentials where supported.
- `PEACELY_ENV=production` — live provider mode is allowed only when the corresponding provider mode is explicitly live.

Optional provider overrides:

- `PEACELY_CASHFREE_MODE=mock|sandbox|live`
- `PEACELY_VERIFICATION_MODE=mock|sandbox|live`
- `PEACELY_WHATSAPP_MODE=mock|sandbox|live`
- `PEACELY_AI_MODE=mock|sandbox|live`
- `PEACELY_NOTIFICATIONS_MODE=mock|sandbox|live`

Do not put provider secrets in source control.

## Test endpoints

All endpoints require a normal Peacely owner session.

- `GET /api/sandbox/config`
- `GET /api/sandbox/audit`
- `POST /api/sandbox/payment`
  - `success`, `failure`, `cancelled`, `timeout`, `duplicate`, `webhook`, `refund`
- `POST /api/sandbox/verification`
  - `success`, `failure`, `pending`, `consent_rejected`, `invalid_data`, `manual_review`
- `POST /api/sandbox/whatsapp`
  - `sent`, `delivered`, `read`, `failed`
- `POST /api/sandbox/ai`
  - accepts a natural-language `prompt` and returns a simulated intent
- `POST /api/sandbox/reset`
  - production-disabled marker/reset endpoint; it does not delete production records

## Audit trail

Phase A creates `peacely_audit_log`.

Each recorded event can contain:

- actor
- action
- entity
- property
- tenant
- old values
- new values
- metadata
- environment
- timestamp

The audit helper is exported from `server/sandbox.js` so later Peacely modules can record important state changes without duplicating audit logic.

## Safety

Sandbox simulation endpoints never call Cashfree, DigiLocker/API Setu, WhatsApp or OpenAI provider APIs themselves. They generate deterministic test responses and audit events.

Production simulation is blocked when a provider is in live mode, and sandbox reset is blocked in production.


## WhatsApp provider adapter

Peacely now has a provider boundary at `server/whatsapp-provider.js`.

Development defaults to `mock`, so automated tests do not contact Meta or consume WhatsApp messaging resources.

For a Meta test/developer number:

- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_GRAPH_API_VERSION` (optional; defaults to `v23.0`, and should be set explicitly when Meta changes API versions)
- `PEACELY_WHATSAPP_MODE=mock|sandbox|live`

Operational controls:

- `PEACELY_WHATSAPP_AUTOMATION_ENABLED=true` enables automated rent-reminder sends.
- `PEACELY_WHATSAPP_REMINDER_TEMPLATE` must contain an approved WhatsApp template name before automated reminders are sent.
- `PEACELY_WHATSAPP_REMINDER_LANGUAGE=en` controls the template language.
- `PEACELY_WHATSAPP_ALLOW_TEXT_MESSAGES=true` explicitly permits non-template text messages in live mode; leave this unset unless the message is being sent inside an allowed WhatsApp conversation window.

Provider status:

- `GET /api/whatsapp/status`
- `GET /api/whatsapp/notifications?limit=50`
- `GET /api/whatsapp/inbound?limit=50` — owner-scoped tenant inbox.
- `POST /api/whatsapp/send`
- `GET /api/webhooks/whatsapp` — Meta webhook verification challenge.
- `POST /api/webhooks/whatsapp` — signed Meta delivery-status webhook.

Webhook configuration:

- `META_WHATSAPP_VERIFY_TOKEN` (or `WHATSAPP_VERIFY_TOKEN`) — webhook verification token.
- `META_WHATSAPP_APP_SECRET` (or `WHATSAPP_APP_SECRET`) — used for `X-Hub-Signature-256` verification.
- `PEACELY_WHATSAPP_WEBHOOK_ALLOW_UNSIGNED=true` may be used only in non-live development/testing when you intentionally need unsigned webhook simulation.

Delivery statuses are tracked as `sent → delivered → read` or `failed`. Webhook events are idempotent and owner-scoped through the notification/provider message ID. Peacely does not replace a later delivery state with an older state.

Sandbox delivery testing:

- `POST /api/sandbox/whatsapp` now requires an existing owner-scoped WhatsApp notification via `notification_id` or `message_id`.
- Simulate `sent`, `delivered`, `read`, or `failed`; the notification history is updated exactly as a provider lifecycle event would be.

The send endpoint is owner-scoped to the selected tenant and writes a notification record with the provider message ID/status. Mock sends return a simulated provider ID and never call Meta.


## Inbound tenant messages

Meta inbound messages are stored in `peacely_whatsapp_inbound` after signature verification. Peacely resolves the sender phone to exactly one owner tenant; unmatched or ambiguous senders are retained without assigning them to an owner. Text messages receive a conservative intent classification such as maintenance_request, payment_question, agreement_question, move_out_request, support_request, or unknown. Classification does not execute an action automatically.
