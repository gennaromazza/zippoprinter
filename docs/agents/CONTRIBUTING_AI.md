# AI Agent Contribution Guide

## Read First Order

1. `docs/architecture/overview.md`
2. `docs/architecture/tenant-boundaries.md`
3. `docs/data/erd-and-dictionary.md`
4. `docs/api/contracts.md`

## Critical Invariants

- Never perform cross-tenant reads/writes in tenant-facing paths.
- Billing/domain mutations must be auditable.
- Webhook handling must remain idempotent.
- Domain cannot become active unless verified and SSL-ready.

## Safe Edit Rules

- Prefer adding tenant-safe helper functions instead of duplicating raw queries.
- Keep service-role access only on trusted server paths.
- Add or update docs whenever API contracts or state machines change.
- For schema changes, provide migration with backfill-safe behavior.

## Mandatory Checks Before Finalizing

- `npm run lint`
- confirm no leaked secrets in docs/code
- confirm API responses remain backward compatible where intended
