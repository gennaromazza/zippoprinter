# API Contracts (Key Endpoints)

## Billing Connect

- `POST /api/admin/billing/connect/start`
  - starts/refreshes Stripe Connect Express onboarding.
  - response: `{ url, connectAccountId, connectReady }`.

- `GET /api/admin/billing/connect/status`
  - syncs and returns connect status + subscription + entitlements + status card.
  - response: `{ billingAccount, subscription, entitlements, statusCard, connectReady }`.

- `GET /api/admin/billing/subscription/status`
  - returns active plans and current tenant subscription context.
  - response: `{ plans, subscription, entitlements, billingAccount, subscriptionActive, trialExpired, graceRemainingDays, collectionState, allowedActions }`.

- `POST /api/admin/billing/subscription/checkout`
  - body: `{ planId }`.
  - creates Stripe Checkout session for self-service plan activation.

- `POST /api/admin/billing/subscription/change-plan`
  - body: `{ planId }`.
  - changes current Stripe subscription plan with proration.

- `POST /api/admin/billing/subscription/cancel`
  - sets `cancel_at_period_end = true`.

- `POST /api/admin/billing/subscription/reactivate`
  - restores an active subscription by clearing `cancel_at_period_end`.

## Domains

- `GET /api/admin/domains`
  - list tenant domains.

- `POST /api/admin/domains`
  - body: `{ domain }`.
  - adds domain in pending state and returns DNS instructions.

- `PATCH /api/admin/domains/:id`
  - body action:
    - `verify`
    - `sync`
    - `activate`
    - `deactivate`

- `DELETE /api/admin/domains/:id`
  - removes domain from tenant and attempts provider cleanup.

- `POST /api/admin/domains/purchase/quote`
  - body: `{ domain, periodYears }`.
  - checks availability and returns provider cost + sale price + margin.

- `POST /api/admin/domains/purchase`
  - body: `{ domain, periodYears, acknowledged }`.
  - buys domain via Openprovider, creates `domain_purchase_orders`, and connects domain to tenant project.

## Public Checkout

- `POST /api/public/orders`
  - response now includes:
    - `connectReady`
    - `billingMode`
    - `fallbackUsed`
    - `capabilities`

## Webhooks

- `POST /api/stripe/webhook`
  - order payments:
    - `checkout.session.completed`
    - `checkout.session.async_payment_succeeded`
    - `payment_intent.succeeded`
    - `account.updated`
  - subscriptions:
    - `customer.subscription.created|updated|deleted`
    - `invoice.paid`
    - `invoice.payment_failed`

## Platform Owner APIs

- `GET /api/platform/overview`
  - global KPI + 7/30d trend + alert counters.

- `GET /api/platform/tenants`
  - tenant board with filters:
    - `q`
    - `subscription`
    - `connect`
    - `domain`
    - `cursor`
    - `limit` (1-100)

- `GET /api/platform/tenants/:id`
  - full tenant drill-down:
    - overview row
    - billing account
    - subscription
    - entitlements
    - domains
    - recent billing events
    - recent audit logs
    - recent support actions

- `POST /api/platform/tenants/:id/support/password-reset`
  - body: `{ reason }` (5-300 chars).
  - sends studio password-reset email through Supabase.
  - includes anti-abuse guardrail (cooldown + owner hourly limit).

- `POST /api/platform/tenants/:id/support/access-status`
  - body: `{ nextStatus, reason }`.
  - allowed transitions:
    - `active -> temporarily_blocked`
    - `temporarily_blocked -> active`
    - `active|temporarily_blocked -> suspended`
    - `suspended -> active`

- `POST /api/platform/tenants/:id/billing/override`
  - body: `{ nextStatus, reason, ticketId? }`.
  - owner override access status (owner_admin).
  - requires header `x-owner-step-up-token`.

- `POST /api/platform/tenants/:id/billing/trial-reset`
  - body: `{ reason, ticketId?, days? }`.
  - resets tenant to trialing with bounded trial days (owner_admin).
  - requires header `x-owner-step-up-token`.

- `POST /api/platform/tenants/:id/billing/reconcile`
  - pulls Stripe subscription and reconciles tenant status (owner_support+).

- `POST /api/platform/webhooks/replay`
  - body: `{ eventId }`.
  - marks a billing event for replay/reprocessing (owner_admin).
  - requires header `x-owner-step-up-token`.

- `GET /api/platform/metrics/billing`
  - summary metrics for subscriptions + failed process audit in last 24h.

- `GET /api/platform/alerts`
  - alert feed filters:
    - `severity`
    - `status` (`open|acknowledged`)
    - `limit` (1-200)

- `GET /api/platform/events`
  - billing event stream filters:
    - `source`
    - `type`
    - `photographerId`
    - `limit` (1-250)

- `GET /api/platform/audit/events`
  - process audit stream filters:
    - `tenantId`
    - `processArea`
    - `status`
    - `correlationId`
    - `from`
    - `to`
    - `limit` (1-300)

- `GET /api/platform/audit/events/:eventId`
  - one audit event with full snapshots and metadata.

- `GET /api/platform/audit/correlation/:id`
  - ordered chain of all events in the same correlation id.

- `GET /api/platform/audit/export`
  - export process audit dataset.
  - query:
    - `format` (`json|csv`, default `json`)
    - `tenantId`
    - `processArea`
    - `status`
    - `correlationId`
    - `from`
    - `to`
    - `limit` (1-2000)
  - owner role required: `owner_support+`.

Error contract (all owner APIs):

```json
{
  "error": {
    "message": "string",
    "requestId": "uuid",
    "details": {}
  }
}
```

Possible status codes for owner APIs: `401`, `403`, `404`, `422`, `429`, `500`.

## Notification Provider

- Transactional billing notifications are sent through Resend.
- Required env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
