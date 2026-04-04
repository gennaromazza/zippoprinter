# Tenant Boundaries

## Tenant Key

- Primary tenant key: `photographer_id`.
- Auth ownership: `photographers.auth_user_id`.

## Data Isolation Rules

- Every tenant-scoped row must carry `photographer_id`.
- Any read/update/delete in admin APIs must filter by tenant ownership.
- Service-role usage is allowed only in server code, never in client code.
- Public endpoints may write tenant data only when tenant context is explicit and validated.

## Cross-Tenant Safety Invariants

- No endpoint returns rows from more than one tenant unless explicitly platform-admin only.
- Domain resolution (`host -> tenant`) never activates unresolved/unverified domains.
- Billing webhooks must map to exactly one tenant before state mutation.
