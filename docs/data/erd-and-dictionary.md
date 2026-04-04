# ERD and Data Dictionary (Condensed)

## Core Tables

- `photographers`: tenant root entity.
- `print_formats`: catalog per tenant.
- `customers`: customer profiles per tenant.
- `orders`: order header per tenant.
- `order_items`: order lines/photos.

## SaaS/Billing Tables

- `tenant_billing_accounts`
  - one row per tenant.
  - stores Connect account status and fallback flag.
- `subscription_plans`
  - plan catalog (`monthly`, `yearly`, `lifetime`).
- `tenant_subscriptions`
  - effective plan/status per tenant.
- `tenant_entitlements`
  - resolved capabilities used by guards.
- `billing_events`
  - idempotency/event audit for webhook pipeline.

## Domain Tables

- `tenant_domains`
  - domains requested by tenant, verification and SSL state, active flag.

## Audit

- `audit_logs`
  - actor, action, resource, details JSON payload.

## Critical Constraints

- Unique active subscription per tenant.
- Unique active domain per tenant.
- Unique domain globally.
- Unique billing event id for webhook replay safety.
