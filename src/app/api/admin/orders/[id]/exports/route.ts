import { NextResponse } from "next/server";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import { isMissingExportSchemaError } from "@/lib/schema-compat";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveSftpConfigFromPhotographer } from "@/lib/sftp";
import type { OrderExportJob, Photographer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasCompleteSftpConfig(photographer: Photographer) {
  if (!photographer.export_sftp_enabled) {
    return false;
  }

  const host = photographer.export_sftp_host?.trim();
  const username = photographer.export_sftp_username?.trim();
  const authType = photographer.export_sftp_auth_type || "password";

  if (!host || !username) {
    return false;
  }

  if (authType === "private_key") {
    return Boolean(photographer.export_sftp_private_key_encrypted);
  }

  return Boolean(photographer.export_sftp_password_encrypted);
}

async function getContext(orderId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Non autorizzato." }, { status: 401 }) };
  }

  const photographer = (await getCurrentPhotographerForUser(user)) as Photographer | null;
  if (!photographer) {
    return { error: NextResponse.json({ error: "Profilo studio non trovato." }, { status: 404 }) };
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, photographer_id")
    .eq("id", orderId)
    .eq("photographer_id", photographer.id)
    .maybeSingle();

  if (!order) {
    return { error: NextResponse.json({ error: "Ordine non trovato." }, { status: 404 }) };
  }

  return { admin, user, photographer };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const context = await getContext(id);
  if ("error" in context) {
    return context.error;
  }

  try {
    const { data, error } = await context.admin
      .from("order_exports")
      .select("*")
      .eq("order_id", id)
      .eq("photographer_id", context.photographer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isMissingExportSchemaError(error.message)) {
        return NextResponse.json(
          {
            error:
              "Schema export non allineato. Esegui la migration 005_order_exports_and_sftp_settings.sql.",
          },
          { status: 400 }
        );
      }
      throw error;
    }

    const sftpConfigured = hasCompleteSftpConfig(context.photographer);

    return NextResponse.json({
      job: (data as OrderExportJob | null) ?? null,
      sftpConfigured,
      sftpEnabled: Boolean(context.photographer.export_sftp_enabled),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore lettura stato export.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const context = await getContext(id);
  if ("error" in context) {
    return context.error;
  }

  try {
    const sftpConfig = resolveSftpConfigFromPhotographer(context.photographer);
    if (!sftpConfig) {
      return NextResponse.json(
        {
          error:
            "Configurazione SFTP non completa. Aggiorna /admin/settings nella sezione Export consegna file.",
        },
        { status: 400 }
      );
    }

    const { data: activeJob } = await context.admin
      .from("order_exports")
      .select("*")
      .eq("order_id", id)
      .eq("photographer_id", context.photographer.id)
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeJob) {
      return NextResponse.json({ job: activeJob, reused: true });
    }

    const { data: orderItems } = await context.admin
      .from("order_items")
      .select("quantity")
      .eq("order_id", id);

    const totalFiles = (orderItems || []).reduce(
      (sum, item) => sum + Math.max(Number(item.quantity || 0), 1),
      0
    );

    const { data: createdJob, error } = await context.admin
      .from("order_exports")
      .insert({
        order_id: id,
        photographer_id: context.photographer.id,
        triggered_by: context.user.id,
        status: "pending",
        progress: 0,
        total_files: totalFiles,
        processed_files: 0,
      })
      .select("*")
      .single();

    if (error) {
      if (isMissingExportSchemaError(error.message)) {
        return NextResponse.json(
          {
            error:
              "Schema export non allineato. Esegui la migration 005_order_exports_and_sftp_settings.sql.",
          },
          { status: 400 }
        );
      }
      throw error;
    }

    return NextResponse.json({ job: createdJob, reused: false }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Creazione job export non riuscita.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
