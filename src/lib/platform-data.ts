import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/tenant-billing";
import type {
  PlatformAlert,
  PlatformEvent,
  PlatformKPI,
  PlatformSupportAction,
  PlatformTenantRow,
  TenantBillingAccount,
  TenantDomain,
  TenantEntitlement,
  TenantSubscription,
} from "@/lib/types";

interface TrendPoint {
  day: string;
  subscriptions: number;
  connectReady: number;
  webhookEvents: number;
}

export interface PlatformOverview {
  kpi: PlatformKPI | null;
  trends7d: TrendPoint[];
  trends30d: TrendPoint[];
  alertCounts: {
    critical: number;
    warning: number;
    info: number;
  };
}

export interface PlatformTenantFilters {
  q?: string;
  subscription?: string;
  connect?: string;
  domain?: string;
  limit: number;
  cursor?: string;
}

export interface PlatformTenantDetail {
  tenant: PlatformTenantRow | null;
  billingAccount: TenantBillingAccount | null;
  subscription: TenantSubscription | null;
  entitlements: TenantEntitlement | null;
  domains: TenantDomain[];
  recentEvents: PlatformEvent[];
  recentAudit: Array<{
    created_at: string;
    action: string;
    resource_type: string;
    details: Record<string, unknown>;
  }>;
  supportActions: PlatformSupportAction[];
}

export interface PlatformEventFilters {
  source?: string;
  type?: string;
  photographerId?: string;
  limit: number;
}

export interface PlatformAlertFilters {
  severity?: string;
  status?: "open" | "acknowledged";
  limit: number;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function decodeCursor(cursor?: string | null) {
  if (!cursor) {
    return null;
  }

  const [createdAt, id] = cursor.split("|");
  if (!createdAt || !id) {
    return null;
  }

  return { createdAt, id };
}

function encodeCursor(row: PlatformTenantRow) {
  return `${row.created_at}|${row.photographer_id}`;
}

export async function auditPlatformApiAccess(input: {
  actorUserId: string;
  endpoint: string;
  outcome: "ok" | "error";
  requestId: string;
  details?: Record<string, unknown>;
}) {
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: `platform.api.${input.outcome}`,
    resourceType: "platform_api",
    resourceId: input.endpoint,
    details: {
      requestId: input.requestId,
      ...input.details,
    },
  });
}

async function getTrend(days: number) {
  const admin = createAdminClient();
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const subscriptionMap = new Map<string, number>();
  const connectMap = new Map<string, number>();
  const webhookMap = new Map<string, number>();

  const [{ data: subscriptions }, { data: billing }, { data: webhookEvents }] = await Promise.all([
    admin
      .from("tenant_subscriptions")
      .select("updated_at")
      .gte("updated_at", start.toISOString()),
    admin
      .from("tenant_billing_accounts")
      .select("updated_at, connect_status, charges_enabled, payouts_enabled")
      .gte("updated_at", start.toISOString()),
    admin
      .from("billing_events")
      .select("created_at")
      .gte("created_at", start.toISOString()),
  ]);

  for (const row of subscriptions || []) {
    const key = toDateKey(new Date(row.updated_at));
    subscriptionMap.set(key, (subscriptionMap.get(key) || 0) + 1);
  }

  for (const row of billing || []) {
    if (!(row.connect_status === "connected" && row.charges_enabled && row.payouts_enabled)) {
      continue;
    }
    const key = toDateKey(new Date(row.updated_at));
    connectMap.set(key, (connectMap.get(key) || 0) + 1);
  }

  for (const row of webhookEvents || []) {
    const key = toDateKey(new Date(row.created_at));
    webhookMap.set(key, (webhookMap.get(key) || 0) + 1);
  }

  const points: TrendPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    const key = toDateKey(day);

    points.push({
      day: key,
      subscriptions: subscriptionMap.get(key) || 0,
      connectReady: connectMap.get(key) || 0,
      webhookEvents: webhookMap.get(key) || 0,
    });
  }

  return points.filter((point) => point.day <= toDateKey(end));
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const admin = createAdminClient();
  const [{ data: kpiData }, alerts] = await Promise.all([
    admin.from("platform_kpi_snapshot").select("*").limit(1).maybeSingle(),
    listPlatformAlerts({ limit: 200 }),
  ]);

  const alertCounts = {
    critical: alerts.items.filter((item) => item.severity === "critical").length,
    warning: alerts.items.filter((item) => item.severity === "warning").length,
    info: alerts.items.filter((item) => item.severity === "info").length,
  };

  const [trends7d, trends30d] = await Promise.all([getTrend(7), getTrend(30)]);

  return {
    kpi: (kpiData as PlatformKPI | null) ?? null,
    trends7d,
    trends30d,
    alertCounts,
  };
}

export async function listPlatformTenants(filters: PlatformTenantFilters) {
  const admin = createAdminClient();
  const limit = Math.min(Math.max(filters.limit || 20, 1), 100);

  let query = admin
    .from("platform_tenant_overview")
    .select("*")
    .order("created_at", { ascending: false })
    .order("photographer_id", { ascending: false })
    .limit(limit + 1);

  if (filters.q) {
    const q = filters.q.replace(/,/g, " ").trim();
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  if (filters.subscription) {
    query = query.eq("subscription_status", filters.subscription);
  }

  if (filters.connect) {
    if (filters.connect === "ready") {
      query = query.eq("connect_ready", true);
    } else if (filters.connect === "not_ready") {
      query = query.eq("connect_ready", false);
    } else {
      query = query.eq("connect_status", filters.connect);
    }
  }

  if (filters.domain) {
    if (filters.domain === "none") {
      query = query.is("primary_domain", null);
    } else if (filters.domain === "active") {
      query = query.eq("domain_active", true);
    } else if (filters.domain === "failed") {
      query = query.or("domain_verification_status.eq.failed,domain_ssl_status.eq.failed");
    } else if (filters.domain === "pending") {
      query = query.or("domain_verification_status.eq.pending,domain_ssl_status.eq.pending");
    }
  }

  const cursor = decodeCursor(filters.cursor);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},photographer_id.lt.${cursor.id})`
    );
  }

  const { data } = await query;

  const rows = ((data as PlatformTenantRow[] | null) ?? []).map((row) => ({
    ...row,
    domain_active: row.domain_active ?? false,
  }));

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return {
    items,
    nextCursor: hasMore ? encodeCursor(items[items.length - 1] as PlatformTenantRow) : null,
  };
}

export async function getPlatformTenantDetail(photographerId: string): Promise<PlatformTenantDetail> {
  const admin = createAdminClient();

  const [
    { data: overviewData },
    { data: billingData },
    { data: subscriptionData },
    { data: entitlementData },
    { data: domainsData },
    { data: eventsData },
    { data: auditData },
    { data: supportActionsData },
  ] = await Promise.all([
    admin
      .from("platform_tenant_overview")
      .select("*")
      .eq("photographer_id", photographerId)
      .maybeSingle(),
    admin
      .from("tenant_billing_accounts")
      .select("*")
      .eq("photographer_id", photographerId)
      .maybeSingle(),
    admin
      .from("tenant_subscriptions")
      .select("*")
      .eq("photographer_id", photographerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("tenant_entitlements")
      .select("*")
      .eq("photographer_id", photographerId)
      .maybeSingle(),
    admin
      .from("tenant_domains")
      .select("*")
      .eq("photographer_id", photographerId)
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false }),
    admin
      .from("billing_events")
      .select("event_id, source, event_type, photographer_id, created_at, processed_at")
      .eq("photographer_id", photographerId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("audit_logs")
      .select("created_at, action, resource_type, details")
      .eq("photographer_id", photographerId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("platform_support_actions")
      .select("*")
      .eq("photographer_id", photographerId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    tenant: (overviewData as PlatformTenantRow | null) ?? null,
    billingAccount: (billingData as TenantBillingAccount | null) ?? null,
    subscription: (subscriptionData as TenantSubscription | null) ?? null,
    entitlements: (entitlementData as TenantEntitlement | null) ?? null,
    domains: (domainsData as TenantDomain[] | null) ?? [],
    recentEvents: (eventsData as PlatformEvent[] | null) ?? [],
    recentAudit:
      ((auditData as Array<{
        created_at: string;
        action: string;
        resource_type: string;
        details: Record<string, unknown>;
      }> | null) ?? []),
    supportActions: (supportActionsData as PlatformSupportAction[] | null) ?? [],
  };
}

export async function listPlatformAlerts(filters: PlatformAlertFilters) {
  const admin = createAdminClient();
  const limit = Math.min(Math.max(filters.limit || 50, 1), 200);

  let query = admin
    .from("platform_alert_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.severity) {
    query = query.eq("severity", filters.severity);
  }

  const { data } = await query;
  const alerts = (data as Array<Omit<PlatformAlert, "status">> | null) ?? [];

  const keys = alerts.map((alert) => alert.alert_key);
  let ackSet = new Set<string>();

  if (keys.length > 0) {
    const { data: ackData } = await admin
      .from("platform_alert_ack")
      .select("alert_key")
      .in("alert_key", keys);

    ackSet = new Set((ackData || []).map((row) => row.alert_key));
  }

  let items: PlatformAlert[] = alerts.map((alert) => ({
    ...alert,
    status: ackSet.has(alert.alert_key) ? "acknowledged" : "open",
  }));

  if (filters.status) {
    items = items.filter((item) => item.status === filters.status);
  }

  return { items };
}

export async function listPlatformEvents(filters: PlatformEventFilters) {
  const admin = createAdminClient();
  const limit = Math.min(Math.max(filters.limit || 100, 1), 250);

  let query = admin
    .from("billing_events")
    .select("event_id, source, event_type, photographer_id, created_at, processed_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.source) {
    query = query.eq("source", filters.source);
  }

  if (filters.type) {
    query = query.ilike("event_type", `%${filters.type}%`);
  }

  if (filters.photographerId) {
    query = query.eq("photographer_id", filters.photographerId);
  }

  const { data } = await query;
  return {
    items: (data as PlatformEvent[] | null) ?? [],
  };
}

export interface RevenueSnapshot {
  generated_at: string;
  mrr_cents: number;
  arr_cents: number;
  currency: string;
  churned_last_30d: number;
  active_total: number;
  total_canceled: number;
  new_trials_30d: number;
  new_active_30d: number;
  churn_rate_pct: number;
  trial_conversion_rate_pct: number;
  estimated_ltv_cents: number;
}

export interface RevenueByPlan {
  plan_code: string;
  plan_name: string;
  billing_mode: string | null;
  unit_price_cents: number | null;
  active_subscribers: number;
  trialing: number;
  canceled: number;
  plan_mrr_cents: number;
}

export async function getRevenueMetrics(): Promise<{
  snapshot: RevenueSnapshot | null;
  byPlan: RevenueByPlan[];
}> {
  const admin = createAdminClient();

  const [{ data: snapshotData }, { data: planData }] = await Promise.all([
    admin.from("platform_revenue_snapshot").select("*").limit(1).maybeSingle(),
    admin.from("platform_revenue_by_plan").select("*"),
  ]);

  return {
    snapshot: (snapshotData as RevenueSnapshot | null) ?? null,
    byPlan: (planData as RevenueByPlan[] | null) ?? [],
  };
}
