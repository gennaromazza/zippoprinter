import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { auditPlatformApiAccess, listPlatformTenants } from "@/lib/platform-data";
import { createRequestId, platformApiError } from "@/lib/platform-api-response";
import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeCsvField(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: Request) {
  const requestId = createRequestId();

  if (!(await isSameOriginRequest())) {
    return platformApiError(requestId, 403, "Richiesta non valida.");
  }

  const auth = await getPlatformAdminContext();

  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error);
  }

  if (!hasPlatformRole(auth.context.admin.role, "owner_support")) {
    return platformApiError(requestId, 403, "Permessi insufficienti per esportare.");
  }

  const { searchParams } = new URL(request.url);

  try {
    const data = await listPlatformTenants({
      q: searchParams.get("q") || undefined,
      subscription: searchParams.get("subscription") || undefined,
      connect: searchParams.get("connect") || undefined,
      domain: searchParams.get("domain") || undefined,
      limit: 100,
    });

    const headers = [
      "Studio",
      "Email",
      "Abbonamento",
      "Piano",
      "Accesso",
      "Pagamenti Online",
      "Dominio",
      "Ultimo Evento",
      "Data Creazione",
    ];

    const rows = data.items.map((row) => [
      escapeCsvField(row.name || "Studio"),
      escapeCsvField(row.email),
      escapeCsvField(row.subscription_status),
      escapeCsvField(row.subscription_plan_code || "-"),
      escapeCsvField(row.access_status),
      escapeCsvField(row.connect_ready ? "Pronti" : (row.connect_status || "Non collegato")),
      escapeCsvField(row.primary_domain || "Nessuno"),
      escapeCsvField(row.last_event_type || "-"),
      escapeCsvField(row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : "-"),
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");

    const isTruncated = data.items.length >= 100;

    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/export",
      outcome: "ok",
      requestId,
      details: { rowCount: data.items.length, truncated: isTruncated },
    });

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="studi-piattaforma-${new Date().toISOString().slice(0, 10)}.csv"`,
        "x-request-id": requestId,
        ...(isTruncated ? { "x-truncated": "true", "x-truncated-limit": "100" } : {}),
      },
    });
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/export",
      outcome: "error",
      requestId,
      details: {
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Export non riuscito.");
  }
}
