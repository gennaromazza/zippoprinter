# ADR-0001: Stripe Connect Express + BYOD Domains

## Status

Accepted

## Context

The platform serves many photography studios as tenants. Each studio needs independent payouts and payment ownership, plus optional custom domains.

## Decision

- Use Stripe Connect Express for studio order payments.
- Keep platform Stripe account for SaaS subscriptions.
- Use BYOD custom domains through Vercel Domains API.
- Maintain temporary legacy fallback checkout during migration only.

## Consequences

- Low-friction onboarding with Stripe-hosted Express flows and platform-controlled payouts.
- Tenant onboarding requires Connect completion before full online checkout.
- Domain management requires DNS verification and provider API reliability.
