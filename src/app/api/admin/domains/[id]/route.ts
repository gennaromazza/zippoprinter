import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSameOriginRequest } from "@/lib/request-security";
import { writeAuditLog } from "@/lib/tenant-billing";
import { getDomainConfig, removeDomainFromProject, verifyDomain } from "@/lib/vercel-domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getOwnedDomainRecord(domainId: string, photographerId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_domains")
    .select("*")
    .eq("id", domainId)
    .eq("photographer_id", photographerId)
    .maybeSingle();
  return data;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isSameOriginRequest())) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 403 });
  }

  const { user, photographer } = await getAuthenticatedPhotographerContext();
  if (!user || !photographer) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const { id } = await params;
  const domainRecord = await getOwnedDomainRecord(id, photographer.id);
  if (!domainRecord) {
    return NextResponse.json({ error: "Dominio non trovato." }, { status: 404 });
  }

  const body = (await request.json()) as { action?: "verify" | "sync" | "activate" | "deactivate" };
  const action = body.action;
  if (!action) {
    return NextResponse.json({ error: "Azione richiesta." }, { status: 400 });
  }

  const admin = createAdminClient();

  if (action === "verify") {
    try {
      const payload = await verifyDomain(domainRecord.domain);
      const maybeVerified =
        Boolean((payload as { verified?: boolean }).verified) ||
        Boolean((payload as { configuredBy?: string }).configuredBy);

      const { data } = await admin
        .from("tenant_domains")
        .update({
          verification_status: maybeVerified ? "verified" : "pending",
          verified_at: maybeVerified ? new Date().toISOString() : null,
          provider_record: payload,
          last_error: null,
        })
        .eq("id", domainRecord.id)
        .select("*")
        .single();

      await writeAuditLog({
        photographerId: photographer.id,
        actorUserId: user.id,
        action: "domain_verified",
        resourceType: "tenant_domains",
        resourceId: domainRecord.id,
        details: { domain: domainRecord.domain, verified: maybeVerified },
      });

      return NextResponse.json({ domain: data });
    } catch (error) {
      await admin
        .from("tenant_domains")
        .update({ verification_status: "failed", last_error: String(error) })
        .eq("id", domainRecord.id);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Verifica dominio fallita." },
        { status: 400 }
      );
    }
  }

  if (action === "sync") {
    try {
      const payload = await getDomainConfig(domainRecord.domain);
      const maybeConfigured = !Boolean((payload as { misconfigured?: boolean }).misconfigured);
      const sslReady = maybeConfigured && Boolean((payload as { configuredBy?: string }).configuredBy);

      const { data } = await admin
        .from("tenant_domains")
        .update({
          verification_status: maybeConfigured ? "verified" : "pending",
          ssl_status: sslReady ? "ready" : "pending",
          provider_record: payload,
          last_error: null,
        })
        .eq("id", domainRecord.id)
        .select("*")
        .single();

      return NextResponse.json({ domain: data });
    } catch (error) {
      await admin
        .from("tenant_domains")
        .update({ last_error: String(error) })
        .eq("id", domainRecord.id);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Sync dominio fallito." },
        { status: 400 }
      );
    }
  }

  if (action === "activate") {
    if (domainRecord.verification_status !== "verified") {
      return NextResponse.json({ error: "Dominio non verificato." }, { status: 400 });
    }

    await admin
      .from("tenant_domains")
      .update({ is_active: false })
      .eq("photographer_id", photographer.id);

    const { data } = await admin
      .from("tenant_domains")
      .update({ is_active: true, activated_at: new Date().toISOString() })
      .eq("id", domainRecord.id)
      .select("*")
      .single();

    await writeAuditLog({
      photographerId: photographer.id,
      actorUserId: user.id,
      action: "domain_activated",
      resourceType: "tenant_domains",
      resourceId: domainRecord.id,
      details: { domain: domainRecord.domain },
    });

    return NextResponse.json({ domain: data });
  }

  if (action === "deactivate") {
    const { data } = await admin
      .from("tenant_domains")
      .update({ is_active: false })
      .eq("id", domainRecord.id)
      .select("*")
      .single();
    return NextResponse.json({ domain: data });
  }

  return NextResponse.json({ error: "Azione non supportata." }, { status: 400 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isSameOriginRequest())) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 403 });
  }

  const { user, photographer } = await getAuthenticatedPhotographerContext();
  if (!user || !photographer) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const { id } = await params;
  const domainRecord = await getOwnedDomainRecord(id, photographer.id);
  if (!domainRecord) {
    return NextResponse.json({ error: "Dominio non trovato." }, { status: 404 });
  }

  try {
    await removeDomainFromProject(domainRecord.domain);
  } catch {
    // Continue with local cleanup even if provider cleanup fails.
  }

  const admin = createAdminClient();
  await admin.from("tenant_domains").delete().eq("id", id);

  await writeAuditLog({
    photographerId: photographer.id,
    actorUserId: user.id,
    action: "domain_deleted",
    resourceType: "tenant_domains",
    resourceId: id,
    details: { domain: domainRecord.domain },
  });

  return NextResponse.json({ deleted: true });
}
