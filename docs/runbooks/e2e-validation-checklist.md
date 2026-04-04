# E2E Validation Checklist (Connect + Subscription + BYOD)

## Preconditions

- Migration `009_saas_multitenant_foundation_v2.sql` applied on Supabase.
- Vercel env configured:
  - `STRIPE_PLATFORM_WEBHOOK_SECRET`
  - `VERCEL_API_TOKEN`
  - `VERCEL_PROJECT_ID`
  - `ENABLE_LEGACY_STRIPE_FALLBACK`
- Platform Stripe account and webhook endpoints configured.

## 1. Connect Onboarding

1. Login as tenant admin.
2. `POST /api/admin/billing/connect/start`.
3. Complete Stripe onboarding link.
4. `GET /api/admin/billing/connect/status` returns:
   - `connect_status=connected`
   - `charges_enabled=true`.

## 2. Checkout with Connect

1. Create order requiring online payment.
2. Verify response from `POST /api/public/orders` includes:
   - `connectReady=true`
   - `billingMode=connect`
   - `fallbackUsed=false`.
3. Complete checkout.
4. Verify order updates:
   - `payment_status` set correctly
   - `amount_paid_cents` updated
   - `stripe_connected_account_id` populated.

## 3. Subscription Webhooks

1. Send/trigger `customer.subscription.created|updated|deleted`.
2. Send/trigger `invoice.paid` and `invoice.payment_failed`.
3. Verify:
   - `tenant_subscriptions.status` transitions correctly.
   - `tenant_entitlements` toggles expected capabilities.
   - `billing_events` records unique event ids.

## 4. BYOD Domain

1. `POST /api/admin/domains` with tenant domain.
2. Configure DNS CNAME to configured target.
3. `PATCH /api/admin/domains/:id` with `verify` then `sync`.
4. `PATCH /api/admin/domains/:id` with `activate`.
5. Access app from custom host and confirm tenant storefront is resolved.

## 5. Isolation Regression

1. Login as tenant A and tenant B in separate sessions.
2. Ensure A cannot list/update B billing/domain/subscription resources.
