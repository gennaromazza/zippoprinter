# Runbook: Domain Onboarding (BYOD)

## Happy Path

1. Tenant requests domain via `POST /api/admin/domains`.
2. App stores pending record and returns DNS instructions.
3. Tenant updates DNS (typically CNAME `www` -> Vercel target).
4. Operator/tenant triggers `PATCH action=verify` and then `PATCH action=sync`.
5. When `verification_status=verified` and `ssl_status=ready`, tenant activates domain.

## Failure Matrix

- DNS not propagated:
  - keep `verification_status=pending`.
  - retry verify/sync later.
- Domain already claimed:
  - provider call fails, return clear error.
- SSL pending:
  - do not allow activation until `ssl_status=ready`.

## Operational Notes

- Keep `/studio/[photographerId]` as canonical fallback.
- Only one active domain per tenant.
- Every domain action writes an audit log entry.
