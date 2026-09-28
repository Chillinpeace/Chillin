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
