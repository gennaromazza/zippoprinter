# ADR-0002: Platform Owner Dashboard V1 (Read-Only)

## Status

Accepted

## Context

The SaaS foundation introduced tenant billing, Connect onboarding, and BYOD domains. Platform operations still lacked a dedicated owner surface for observability and fast incident triage.

## Decision

- Introduce a dedicated owner area under `/platform`.
- Authorize owner users via `platform_admins` table (separate from tenant admins).
- Keep V1 read-only and operationally focused.
- Expose owner APIs under `/api/platform/*` with uniform error contract and request id.
- Add platform views for KPI (`platform_kpi_snapshot`) and alerts (`platform_alert_feed`).

## Consequences

- Clear separation between tenant admin (`/admin`) and platform owner (`/platform`).
- Reduced risk of accidental tenant mutation in early platform tooling.
- Better readiness for support/SRE workflows.
- Future V2 can safely add controlled owner mutations with stronger approvals.
