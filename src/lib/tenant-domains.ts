import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { TenantDomain } from "@/lib/types";

function normalizeDomain(input: string) {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function isValidDomain(input: string) {
  const domain = normalizeDomain(input);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
    domain
  );
}

export function normalizeTenantDomain(input: string) {
  return normalizeDomain(input);
}

export async function resolveTenantByHost(host: string) {
  const normalizedHost = normalizeDomain(host.split(":")[0] || "");
  if (!normalizedHost) {
    return null;
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_domains")
    .select("photographer_id")
    .eq("domain", normalizedHost)
    .eq("is_active", true)
    .eq("verification_status", "verified")
    .eq("ssl_status", "ready")
    .maybeSingle();

  return data?.photographer_id || null;
}

export async function getTenantDomains(photographerId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_domains")
    .select("*")
    .eq("photographer_id", photographerId)
    .order("created_at", { ascending: false });

  return (data as TenantDomain[] | null) ?? [];
}
