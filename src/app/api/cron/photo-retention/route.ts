import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RETENTION_DAYS = 10;
const MAX_BATCH_SIZE = 200;

interface RetentionOrderItem {
  storage_path: string;
}

interface RetentionOrderRow {
  id: string;
  completed_at: string | null;
  order_items: RetentionOrderItem[] | null;
}

function getRetentionDays() {
  const parsed = Number.parseInt(process.env.PHOTO_RETENTION_DAYS || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_RETENTION_DAYS;
  }
  return parsed;
}

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-vercel-cron");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Fallback for native Vercel cron invocation without manual bearer secret.
  if (cronHeader) {
    return true;
  }

  return false;
}

function getCutoffIso(retentionDays: number) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff.toISOString();
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const retentionDays = getRetentionDays();
    const cutoffIso = getCutoffIso(retentionDays);

    const { data: ordersData, error: ordersError } = await admin
      .from("orders")
      .select("id, completed_at, order_items (storage_path)")
      .eq("status", "completed")
      .lte("completed_at", cutoffIso)
      .limit(MAX_BATCH_SIZE);

    if (ordersError) {
      return NextResponse.json(
        { error: "Impossibile leggere ordini per cleanup retention." },
        { status: 500 }
      );
    }

    const orders = (ordersData as RetentionOrderRow[] | null) ?? [];
    if (orders.length === 0) {
      return NextResponse.json({
        ok: true,
        retentionDays,
        cutoffIso,
        processedOrders: 0,
        deletedOrderItems: 0,
        deletedStoragePaths: 0,
      });
    }

    let processedOrders = 0;
    let deletedOrderItems = 0;
    let deletedStoragePaths = 0;
    const failures: Array<{ orderId: string; reason: string }> = [];

    for (const order of orders) {
      const storagePaths = Array.from(
        new Set((order.order_items || []).map((item) => item.storage_path).filter(Boolean))
      );

      if (storagePaths.length > 0) {
        const { error: storageError } = await admin.storage.from("photos").remove(storagePaths);
        if (storageError) {
          failures.push({
            orderId: order.id,
            reason: "Errore eliminazione file storage.",
          });
          continue;
        }
      }

      const { error: deleteItemsError, count } = await admin
        .from("order_items")
        .delete({ count: "exact" })
        .eq("order_id", order.id);

      if (deleteItemsError) {
        failures.push({
          orderId: order.id,
          reason: "Errore eliminazione order_items.",
        });
        continue;
      }

      processedOrders += 1;
      deletedOrderItems += count || 0;
      deletedStoragePaths += storagePaths.length;
    }

    return NextResponse.json({
      ok: true,
      retentionDays,
      cutoffIso,
      scannedOrders: orders.length,
      processedOrders,
      deletedOrderItems,
      deletedStoragePaths,
      failures,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore durante cleanup retention foto.",
      },
      { status: 500 }
    );
  }
}
