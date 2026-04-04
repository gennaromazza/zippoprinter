# Runbook: Billing Lifecycle

## Plans

- `starter_monthly` (EUR 6.00)
- `starter_yearly` (EUR 50.00)
- `lifetime_buyout` (EUR 1000.00)

## Subscription States

- `trialing`
- `active`
- `past_due`
- `canceled`
- `suspended`
- `lifetime`

## Entitlement Policy (v1)

- `trialing|active|lifetime`:
  - online payments enabled
  - custom domain enabled
- `past_due|canceled|suspended`:
  - online payments disabled
  - custom domain disabled

## Webhook Events

- `customer.subscription.*` updates tenant subscription row.
- `invoice.paid` sets subscription `active`.
- `invoice.payment_failed` sets subscription `past_due`.
- order events update order payment fields.

## Idempotency

- Event id is inserted into `billing_events` with unique key.
- Duplicate event id exits early without side effects.
