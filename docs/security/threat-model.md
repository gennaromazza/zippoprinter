# Threat Model (Tenant SaaS)

## Main Assets

- Tenant order data and media paths.
- Tenant billing state and payment references.
- Domain ownership and routing control.
- Stripe webhook integrity.

## Primary Threats

- Cross-tenant data leak via missing tenant filter.
- Forged admin mutations via CSRF.
- Webhook replay/double processing.
- Domain takeover via weak verification flow.
- Secret leakage (`service_role`, Stripe keys, Vercel token).

## Mitigations in Place

- Tenant ownership checks on admin paths.
- Same-origin checks for server-side mutations.
- Webhook signature verification and event idempotency.
- Domain state machine (`pending -> verified -> active`) with explicit checks.
- Production setup endpoints disabled by default.

## Residual Risks

- In-memory rate limit is not distributed.
- Some service-role reads remain in legacy code paths.
- Domain provider API failures need better retry orchestration.
