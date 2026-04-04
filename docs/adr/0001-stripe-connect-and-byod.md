# ADR-0001: Stripe Connect Standard + BYOD Domains

## Status

Accepted

## Context

The platform serves many photography studios as tenants. Each studio needs independent payouts and payment ownership, plus optional custom domains.

## Decision

- Use Stripe Connect Standard for studio order payments.
- Keep platform Stripe account for SaaS subscriptions.
- Use BYOD custom domains through Vercel Domains API.
- Maintain temporary legacy fallback checkout during migration only.

## Consequences

- Higher setup complexity but better long-term security and compliance posture.
- Tenant onboarding requires Connect completion before full online checkout.
- Domain management requires DNS verification and provider API reliability.
