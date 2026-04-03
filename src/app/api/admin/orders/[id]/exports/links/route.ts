import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import {
  buildAria2Text,
  buildLinksText,
  buildManifestCsv,
  buildOrderExportEntries,
  type OrderExportEntryWithUrl,
} from "@/lib/order-exports";
import { createClient } from "@/lib/supabase/server";
import type { OrderItem, Photographer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampSignedUrlExpiry(minutes: number) {
  return Math.min(Math.max(minutes, 5), 1440);
}

function textDownloadResponse(fileName: string, contentType: string, body: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function buildSignedUrlMap(
  admin: ReturnType<typeof createAdminClient>,
  storagePaths: string[],
  expiresSeconds: number
) {
  const signedUrlByPath = new Map<string, string>();
  const chunkSize = Math.max(1, Number.parseInt(process.env.EXPORT_SIGNED_URL_BATCH_SIZE || "200", 10));

  for (let start = 0; start < storagePaths.length; start += chunkSize) {
    const chunk = storagePaths.slice(start, start + chunkSize);
    const { data, error } = await admin.storage
      .from("photos")
      .createSignedUrls(chunk, expiresSeconds);

    if (error) {
      return { ok: false as const, error: error.message };
    }

    chunk.forEach((storagePath, index) => {
      signedUrlByPath.set(storagePath, data?.[index]?.signedUrl || "");
    });
  }

  return { ok: true as const, signedUrlByPath };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const photographer = (await getCurrentPhotographerForUser(user)) as Photographer | null;
  if (!photographer) {
    return NextResponse.json({ error: "Profilo studio non trovato." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: orderData } = await admin
    .from("orders")
    .select("id, photographer_id")
    .eq("id", id)
    .eq("photographer_id", photographer.id)
    .maybeSingle();

  if (!orderData) {
    return NextResponse.json({ error: "Ordine non trovato." }, { status: 404 });
  }

  const { data: orderItemsData } = await admin
    .from("order_items")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  const orderItems = (orderItemsData as OrderItem[] | null) ?? [];
  if (orderItems.length === 0) {
    return NextResponse.json({ error: "Questo ordine non contiene immagini." }, { status: 400 });
  }

  const entries = buildOrderExportEntries(id, orderItems);
  const uniquePaths = [...new Set(entries.map((entry) => entry.storagePath))];
  const query = new URL(request.url).searchParams;
  const requestedFormat = query.get("format") || "";
  const queryExpiry = Number.parseInt(query.get("expiresMinutes") || "", 10);
  const defaultExpiry = photographer.export_links_expiry_minutes || 120;
  const expiresMinutes = clampSignedUrlExpiry(Number.isFinite(queryExpiry) ? queryExpiry : defaultExpiry);
  const baseName = `ORD-${id}`;

  if (!requestedFormat) {
    return NextResponse.json({
      totalFiles: entries.length,
      expiresMinutes,
      manifestUrl: `/api/admin/orders/${id}/exports/links?format=manifest&expiresMinutes=${expiresMinutes}`,
      linksUrl: `/api/admin/orders/${id}/exports/links?format=links&expiresMinutes=${expiresMinutes}`,
      aria2Url: `/api/admin/orders/${id}/exports/links?format=aria2&expiresMinutes=${expiresMinutes}`,
    });
  }

  const signedUrlResult = await buildSignedUrlMap(admin, uniquePaths, expiresMinutes * 60);
  if (!signedUrlResult.ok) {
    return NextResponse.json(
      { error: "Impossibile generare i link firmati per il download." },
      { status: 500 }
    );
  }

  const entriesWithUrls: OrderExportEntryWithUrl[] = entries.map((entry) => ({
    ...entry,
    signedUrl: signedUrlResult.signedUrlByPath.get(entry.storagePath) || "",
  }));

  if (entriesWithUrls.some((entry) => !entry.signedUrl)) {
    return NextResponse.json(
      { error: "Uno o piu file non hanno ricevuto un link valido." },
      { status: 500 }
    );
  }

  if (requestedFormat === "manifest") {
    return textDownloadResponse(
      `${baseName}-manifest.csv`,
      "text/csv; charset=utf-8",
      buildManifestCsv(entriesWithUrls)
    );
  }

  if (requestedFormat === "links") {
    return textDownloadResponse(
      `${baseName}-links.txt`,
      "text/plain; charset=utf-8",
      buildLinksText(entriesWithUrls)
    );
  }

  if (requestedFormat === "aria2") {
    return textDownloadResponse(
      `${baseName}-aria2.txt`,
      "text/plain; charset=utf-8",
      buildAria2Text(entriesWithUrls)
    );
  }

  return NextResponse.json({ error: "Formato link non supportato." }, { status: 400 });
}
