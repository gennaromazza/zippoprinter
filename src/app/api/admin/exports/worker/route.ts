import path from "node:path";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOrderExportEntries } from "@/lib/order-exports";
import { resolveSftpConfigFromPhotographer, uploadBuffer, withSftpClient } from "@/lib/sftp";
import type { OrderExportJob, OrderItem, Photographer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorizedWorkerCall(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const workerSecretHeader = request.headers.get("x-export-worker-secret") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const expected =
    process.env.EXPORT_WORKER_SECRET || process.env.CRON_SECRET || "";

  return Boolean(expected && (workerSecretHeader === expected || bearer === expected));
}

function computeProgress(processed: number, total: number) {
  if (!total) {
    return 0;
  }
  return Math.min(100, Math.round((processed / total) * 100));
}

async function markJobFailed(admin: ReturnType<typeof createAdminClient>, jobId: string, processed: number, total: number, errorMessage: string) {
  await admin
    .from("order_exports")
    .update({
      status: "failed",
      processed_files: processed,
      total_files: total,
      progress: computeProgress(processed, total),
      error: errorMessage.slice(0, 1000),
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

async function processClaimedJob(admin: ReturnType<typeof createAdminClient>, job: OrderExportJob) {
  const { data: orderData } = await admin
    .from("orders")
    .select("id, photographer_id")
    .eq("id", job.order_id)
    .eq("photographer_id", job.photographer_id)
    .maybeSingle();

  if (!orderData) {
    await markJobFailed(admin, job.id, job.processed_files, job.total_files, "Ordine non trovato o non appartenente al tenant.");
    return { ok: false, reason: "order_not_found" };
  }

  const { data: photographerData } = await admin
    .from("photographers")
    .select("*")
    .eq("id", job.photographer_id)
    .maybeSingle();
  const photographer = photographerData as Photographer | null;

  if (!photographer) {
    await markJobFailed(admin, job.id, job.processed_files, job.total_files, "Studio non trovato.");
    return { ok: false, reason: "photographer_not_found" };
  }

  const sftpConfig = resolveSftpConfigFromPhotographer(photographer);
  if (!sftpConfig) {
    await markJobFailed(admin, job.id, job.processed_files, job.total_files, "Configurazione SFTP mancante o non valida.");
    return { ok: false, reason: "sftp_config_invalid" };
  }

  const { data: orderItemsData } = await admin
    .from("order_items")
    .select("*")
    .eq("order_id", job.order_id)
    .order("created_at", { ascending: true });
  const orderItems = (orderItemsData as OrderItem[] | null) ?? [];
  const entries = buildOrderExportEntries(job.order_id, orderItems);
  const total = entries.length;

  if (total === 0) {
    await markJobFailed(admin, job.id, 0, 0, "Nessuna immagine da esportare per questo ordine.");
    return { ok: false, reason: "empty_order" };
  }

  const startIndex = Math.min(job.processed_files || 0, total);
  const maxFilesPerRun = Math.max(1, Number.parseInt(process.env.EXPORT_WORKER_MAX_FILES || "20", 10));
  const entriesToProcess = entries.slice(startIndex, startIndex + maxFilesPerRun);
  const remoteRoot = path.posix.join(sftpConfig.remotePath, `ORD-${job.order_id}`);
  let processed = startIndex;

  if (entriesToProcess.length === 0) {
    await admin
      .from("order_exports")
      .update({
        status: "completed",
        processed_files: total,
        total_files: total,
        progress: 100,
        error: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return { ok: true, done: true, processed: total, total };
  }

  try {
    await withSftpClient(sftpConfig, async (client) => {
      for (const entry of entriesToProcess) {
        const { data: fileBlob, error: downloadError } = await admin.storage
          .from("photos")
          .download(entry.storagePath);

        if (downloadError || !fileBlob) {
          throw new Error(`Download fallito per ${entry.storagePath}.`);
        }

        const buffer = Buffer.from(await fileBlob.arrayBuffer());
        await uploadBuffer(client, remoteRoot, entry.outputRelativePath, buffer);
        processed += 1;

        // Aggiornamento periodico progress per evitare scritture eccessive.
        if (processed % 5 === 0) {
          await admin
            .from("order_exports")
            .update({
              processed_files: processed,
              total_files: total,
              progress: computeProgress(processed, total),
              error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore esportazione SFTP.";
    await markJobFailed(admin, job.id, processed, total, message);
    return { ok: false, reason: "sftp_upload_failed", error: message };
  }

  const done = processed >= total;
  await admin
    .from("order_exports")
    .update({
      status: done ? "completed" : "pending",
      processed_files: processed,
      total_files: total,
      progress: computeProgress(processed, total),
      error: null,
      updated_at: new Date().toISOString(),
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq("id", job.id);

  return { ok: true, done, processed, total };
}

async function runWorker(request: Request) {
  if (!isAuthorizedWorkerCall(request)) {
    return NextResponse.json({ error: "Richiesta non autorizzata." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: claimedJob, error: claimError } = await admin.rpc("claim_order_export_job");

  if (claimError) {
    return NextResponse.json(
      { error: `Impossibile claimare un job export: ${claimError.message}` },
      { status: 500 }
    );
  }

  if (!claimedJob) {
    return NextResponse.json({ ok: true, processed: false, message: "Nessun job pending." });
  }

  try {
    const result = await processClaimedJob(admin, claimedJob as OrderExportJob);
    return NextResponse.json({
      processed: true,
      jobId: claimedJob.id,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore worker non gestito.";
    await markJobFailed(
      admin,
      claimedJob.id,
      claimedJob.processed_files || 0,
      claimedJob.total_files || 0,
      message
    );
    return NextResponse.json(
      {
        ok: false,
        processed: true,
        jobId: claimedJob.id,
        reason: "worker_unhandled_error",
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return runWorker(request);
}

export async function POST(request: Request) {
  return runWorker(request);
}
