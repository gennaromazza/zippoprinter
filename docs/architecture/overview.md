# Architecture Overview

## System Shape

- Frontend and API: Next.js App Router.
- Database/Auth/Storage: Supabase.
- Payments:
  - Studio customer orders: Stripe Connect Standard (per-tenant connected account).
  - Platform subscriptions: Stripe platform account.
- Custom domains: Vercel Domains API.

## Core Bounded Contexts

- Tenant identity: `photographers`.
- Order commerce: `orders`, `order_items`, `print_formats`, `customers`.
- Tenant billing and SaaS lifecycle:
  - `tenant_billing_accounts`
  - `tenant_subscriptions`
  - `subscription_plans`
  - `tenant_entitlements`
  - `billing_events`
- Domains and routing:
  - `tenant_domains`
- Platform owner operations:
  - `platform_admins`
  - `platform_kpi_snapshot` (view)
  - `platform_alert_feed` (view)
  - `platform_alert_ack`

## Runtime Principles

- Tenant isolation must be enforceable at DB and API boundaries.
- Any mutation that affects billing, domain, or payments is auditable.
- Webhooks are idempotent and replay-safe.
