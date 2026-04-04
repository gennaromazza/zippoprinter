# API Contracts (Key Endpoints)

## Billing Connect

- `POST /api/admin/billing/connect/start`
  - starts/refreshes Stripe Connect onboarding.
  - response: `{ url, connectAccountId, connectReady }`.

- `GET /api/admin/billing/connect/status`
  - syncs and returns connect status + subscription + entitlements.
  - response: `{ billingAccount, subscription, entitlements, connectReady }`.

- `GET /api/admin/billing/subscription/status`
  - returns active plans and current tenant subscription context.
  - response: `{ plans, subscription, entitlements, billingAccount, subscriptionActive }`.

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
