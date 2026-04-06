# Runbook: Audit & Forensics

## Goal

Use process audit and correlation chains to investigate billing incidents end-to-end.

## Main Sources

1. `process_audit_events` (canonical process timeline)
2. `billing_events` (Stripe webhook idempotency stream)
3. `tenant_subscriptions` + `tenant_entitlements` (effective state)
4. `audit_logs` + `platform_support_actions` (owner/operator actions)

## Fast Triage

1. Find tenant id and rough incident time window.
2. Query `GET /api/platform/audit/events?tenantId=<id>&limit=200`.
3. Identify failed events and copy `correlation_id`.
4. Query `GET /api/platform/audit/correlation/<correlation_id>` for full chain.
5. Compare with latest `tenant_subscriptions` and `tenant_entitlements` rows.

## Webhook Replay Procedure

1. Locate `billing_events.event_id` in platform events page.
2. Call `POST /api/platform/webhooks/replay` with `{ eventId }`.
3. Verify `processed_at` is set again after webhook reprocessing.
4. Confirm new process audit events were emitted for same correlation chain.

## Tenant Reconciliation Procedure

1. Call `POST /api/platform/tenants/:id/billing/reconcile`.
2. Confirm Stripe status and period dates sync in `tenant_subscriptions`.
3. Confirm a `process_audit_events` row exists for action `owner_reconcile_subscription`.

## Override Governance

- Every owner override must include `reason`.
- `ticketId` is required by policy for production incidents.
- Use `owner_admin` role for suspend, trial reset, webhook replay.

## Evidence Export

- Use API filters by `tenantId`, `processArea`, `status`, and `from/to` date.
- Use `GET /api/platform/audit/export?format=json|csv` for compliance export bundles.
- Store exported JSON with request timestamp and operator id.
- Keep records at least 24 months for compliance/legal traceability.

## Step-Up Protected Actions

- Critical owner actions require header `x-owner-step-up-token`.
- Server checks token against env `OWNER_STEP_UP_TOKEN`.
- Protected endpoints:
  - `POST /api/platform/tenants/:id/billing/override`
  - `POST /api/platform/tenants/:id/billing/trial-reset`
  - `POST /api/platform/webhooks/replay`
  - `POST /api/platform/tenants/:id/support/access-status` when `nextStatus=suspended`
