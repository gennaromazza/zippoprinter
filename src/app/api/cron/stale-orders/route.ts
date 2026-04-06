import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Orders older than this (in hours) with status pending and unpaid are considered stale. */
const STALE_THRESHOLD_HOURS = 24;
const MAX_BATCH_SIZE = 200;

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-vercel-cron");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  if (cronHeader) {
    return true;
  }

  return false;
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date();
  cutoff.setUTCHours(cutoff.getUTCHours() - STALE_THRESHOLD_HOURS);
  const cutoffIso = cutoff.toISOString();

  // Find pending + unpaid orders created before the cutoff
  const { data: staleOrders, error: fetchError } = await admin
    .from("orders")
    .select("id")
    .eq("status", "pending")
    .eq("payment_status", "unpaid")
    .lt("created_at", cutoffIso)
    .limit(MAX_BATCH_SIZE);

  if (fetchError) {
    return NextResponse.json(
      { error: "Errore durante la ricerca degli ordini scaduti.", detail: fetchError.message },
      { status: 500 }
    );
  }

  if (!staleOrders || staleOrders.length === 0) {
    return NextResponse.json({ cancelled: 0, message: "Nessun ordine scaduto trovato." });
  }

  const orderIds = staleOrders.map((o) => o.id);

  const { error: updateError, count } = await admin
    .from("orders")
    .update({
      status: "cancelled",
      payment_status: "cancelled",
    })
    .in("id", orderIds)
    .eq("status", "pending")
    .eq("payment_status", "unpaid");

  if (updateError) {
    return NextResponse.json(
      { error: "Errore durante la cancellazione degli ordini scaduti.", detail: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    cancelled: count ?? orderIds.length,
    message: `${count ?? orderIds.length} ordini scaduti cancellati.`,
  });
}
