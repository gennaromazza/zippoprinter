# Platform Operations (Owner Dashboard V1)

## Goal

The `/platform` area is the owner-only control tower for SaaS operations. It is read-only in V1 and focuses on observability, incident triage, and tenant health.

## Pages

- `/platform`
  - global KPI snapshot
  - 7/30-day trend summaries
  - prioritized alert panel
- `/platform/tenants`
  - tenant list with filters (subscription/connect/domain/search)
  - cursor pagination
- `/platform/tenants/[id]`
  - tenant drill-down (billing account, subscription, entitlements, domains)
  - event timeline + audit timeline
  - deep links to Stripe/Vercel/Supabase
- `/platform/events`
  - platform billing/webhook event stream explorer

## Access Model

- Owner auth source: `platform_admins` table.
- `/platform` and `/api/platform/*` require active `platform_admins.auth_user_id` match.
- In production, feature flag `ENABLE_PLATFORM_DASHBOARD=true` is required.

## Alert Semantics

Alerts are generated from `platform_alert_feed` view.

- `critical`
  - tenant `past_due`/`suspended`
  - domain verify/SSL failed
- `warning`
  - connect not ready while entitlement needs online payments
  - domain pending too long
  - webhook backlog over threshold
- `info`
  - reserved for non-blocking operational context

## API Contracts (Owner)

- `GET /api/platform/overview`
- `GET /api/platform/tenants`
- `GET /api/platform/tenants/:id`
- `GET /api/platform/alerts`
- `GET /api/platform/events`

Error contract is uniform:

```json
{
  "error": {
    "message": "...",
    "requestId": "uuid",
    "details": {}
  }
}
```

## Incident Workflow

1. Open `/platform` and inspect critical alerts.
2. Drill into `/platform/tenants/[id]` for affected tenant.
3. Cross-check `billing_events` and `audit_logs` timeline.
4. Follow runbooks:
   - `docs/runbooks/billing-lifecycle.md`
   - `docs/runbooks/domain-onboarding.md`
   - `docs/security/incident-playbook.md`
