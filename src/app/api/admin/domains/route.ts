import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canUseCustomDomain,
  getTenantBillingContext,
  writeAuditLog,
} from "@/lib/tenant-billing";
import {
  addDomainToProject,
  getVercelDnsTarget,
  isVercelDomainApiConfigured,
} from "@/lib/vercel-domains";
import { isValidDomain, normalizeTenantDomain } from "@/lib/tenant-domains";
import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { photographer } = await getAuthenticatedPhotographerContext();
  if (!photographer) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_domains")
    .select("*")
    .eq("photographer_id", photographer.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ domains: data ?? [] });
}

export async function POST(request: Request) {
  if (!(await isSameOriginRequest())) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 403 });
  }

  const { user, photographer } = await getAuthenticatedPhotographerContext();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }
  if (!photographer) {
    return NextResponse.json({ error: "Profilo studio non trovato." }, { status: 404 });
  }

  const context = await getTenantBillingContext(photographer.id);
  if (!canUseCustomDomain(context)) {
    return NextResponse.json(
      { error: "Il piano attuale non abilita i domini personalizzati." },
      { status: 403 }
    );
  }

  if (!isVercelDomainApiConfigured()) {
    return NextResponse.json({ error: "Vercel Domains API non configurata." }, { status: 500 });
  }

  const body = (await request.json()) as { domain?: string };
  const rawDomain = String(body.domain || "");
  const domain = normalizeTenantDomain(rawDomain);
  if (!isValidDomain(domain)) {
    return NextResponse.json({ error: "Dominio non valido." }, { status: 400 });
  }

  try {
    const providerPayload = await addDomainToProject(domain);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tenant_domains")
      .insert({
        photographer_id: photographer.id,
        domain,
        verification_status: "pending",
        ssl_status: "pending",
        is_active: false,
        dns_target: getVercelDnsTarget(),
        provider_record: providerPayload,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      photographerId: photographer.id,
      actorUserId: user.id,
      action: "domain_added",
      resourceType: "tenant_domains",
      resourceId: data.id,
      details: { domain },
    });

    return NextResponse.json({
      domain: data,
      instructions: {
        type: "cname",
        host: "www",
        value: getVercelDnsTarget(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore aggiunta dominio." },
      { status: 400 }
    );
  }
}
