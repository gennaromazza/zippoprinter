# Incident Playbook

## Severity Levels

- SEV-1: data leak or payment corruption across tenants.
- SEV-2: tenant billing/domain outage.
- SEV-3: degraded feature without data integrity impact.

## First 15 Minutes

1. Freeze risky mutations (feature flags / temporary endpoint disable).
2. Capture failing request ids and affected tenant ids.
3. Preserve webhook/event payloads and logs.
4. Notify impacted tenants for SEV-1/2.

## Containment Actions

- Disable legacy fallback checkout if misuse is detected.
- Force domain deactivation for hijacked domain records.
- Pause webhook processor if idempotency regression appears.

## Recovery Verification

- Confirm tenant boundaries with targeted SQL checks.
- Replay webhook events from `billing_events`.
- Validate orders/subscriptions/domains for affected tenants.

## Postmortem Template

- Impact summary
- Root cause
- Detection gap
- Preventive actions
- Owner and due date
