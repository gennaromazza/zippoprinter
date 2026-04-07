import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  TenantBillingAccount,
  TenantEntitlement,
  TenantSubscription,
  TenantSubscriptionStatus,
} from "@/lib/types";

export interface TenantBillingContext {
  billingAccount: TenantBillingAccount | null;
  subscription: TenantSubscription | null;
  entitlements: TenantEntitlement | null;
}

export async function getTenantBillingContext(photographerId: string): Promise<TenantBillingContext> {
  const admin = createAdminClient();

  const [{ data: billingData }, { data: subscriptionData }, { data: entitlementData }] =
    await Promise.all([
      admin
        .from("tenant_billing_accounts")
        .select("*")
        .eq("photographer_id", photographerId)
        .maybeSingle(),
      admin
        .from("tenant_subscriptions")
        .select("*")
        .eq("photographer_id", photographerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("tenant_entitlements")
        .select("*")
        .eq("photographer_id", photographerId)
        .maybeSingle(),
    ]);

  return {
    billingAccount: (billingData as TenantBillingAccount | null) ?? null,
    subscription: (subscriptionData as TenantSubscription | null) ?? null,
    entitlements: (entitlementData as TenantEntitlement | null) ?? null,
  };
}

export function canUseOnlinePayments(context: TenantBillingContext) {
  if (isSubscriptionActive(context.subscription?.status)) {
    return true;
  }

  return Boolean(context.entitlements?.can_accept_online_payments);
}

export function canUseCustomDomain(context: TenantBillingContext) {
  return Boolean(context.entitlements?.can_use_custom_domain);
}

export function isSubscriptionActive(status: TenantSubscriptionStatus | null | undefined) {
  if (!status) {
    return false;
  }
  return status === "trialing" || status === "active" || status === "lifetime";
}

export async function logBillingEvent(input: {
  eventId: string;
  source: "stripe_order" | "stripe_platform" | "domain" | "manual";
  eventType: string;
  payload: Record<string, unknown>;
  photographerId?: string | null;
  processedAt?: string | null;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("billing_events").insert({
    event_id: input.eventId,
    source: input.source,
    event_type: input.eventType,
    photographer_id: input.photographerId || null,
    payload: input.payload,
    processed_at: input.processedAt || null,
  });
  return { error };
}

export async function writeAuditLog(input: {
  photographerId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    photographer_id: input.photographerId || null,
    actor_user_id: input.actorUserId || null,
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId || null,
    details: input.details || {},
  });
}
