import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import { isMissingExportSchemaError } from "@/lib/schema-compat";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/export-crypto";
import { testSftpConnection } from "@/lib/sftp";
import type { Photographer, SftpAuthType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportSftpPayload {
  mode: "save" | "test";
  enabled?: boolean;
  host?: string;
  port?: number;
  username?: string;
  remotePath?: string;
  authType?: SftpAuthType;
  password?: string;
  privateKey?: string;
  linksExpiryMinutes?: number;
}

function sanitizePort(value: number | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return Math.round(parsed);
}

function sanitizeLinksExpiry(value: number | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(1440, Math.max(5, Math.round(parsed)));
}

function normalizeRemotePath(value: string) {
  const normalized = (value || "").replace(/\\/g, "/").trim();
  if (!normalized) {
    return "/";
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function toPublicConfig(photographer: Photographer) {
  return {
    enabled: Boolean(photographer.export_sftp_enabled),
    host: photographer.export_sftp_host || "",
    port: photographer.export_sftp_port || 22,
    username: photographer.export_sftp_username || "",
    remotePath: photographer.export_sftp_remote_path || "/",
    authType: (photographer.export_sftp_auth_type || "password") as SftpAuthType,
    linksExpiryMinutes: photographer.export_links_expiry_minutes || 120,
    hasPassword: Boolean(photographer.export_sftp_password_encrypted),
    hasPrivateKey: Boolean(photographer.export_sftp_private_key_encrypted),
  };
}

async function getContext() {
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

  return { photographer };
}

export async function GET() {
  const context = await getContext();
  if ("error" in context) {
    return context.error;
  }

  return NextResponse.json({
    config: toPublicConfig(context.photographer),
  });
}

export async function POST(request: Request) {
  const context = await getContext();
  if ("error" in context) {
    return context.error;
  }

  try {
    const payload = (await request.json()) as ExportSftpPayload;
    const photographer = context.photographer;
    const mode = payload.mode;
    const enabled = Boolean(payload.enabled ?? photographer.export_sftp_enabled);
    const authType = (payload.authType || photographer.export_sftp_auth_type || "password") as SftpAuthType;
    const host = (payload.host ?? photographer.export_sftp_host ?? "").trim();
    const port = sanitizePort(payload.port, photographer.export_sftp_port || 22);
    const username = (payload.username ?? photographer.export_sftp_username ?? "").trim();
    const remotePath = normalizeRemotePath(payload.remotePath ?? photographer.export_sftp_remote_path ?? "/");
    const linksExpiryMinutes = sanitizeLinksExpiry(
      payload.linksExpiryMinutes,
      photographer.export_links_expiry_minutes || 120
    );

    const shouldRequireConnectionData = mode === "test" || enabled;

    if (shouldRequireConnectionData && (!host || !username)) {
      return NextResponse.json(
        { error: "Host e username SFTP sono obbligatori." },
        { status: 400 }
      );
    }

    const passwordFromPayload = (payload.password || "").trim();
    const privateKeyFromPayload = payload.privateKey || "";

    let password = "";
    let privateKey = "";

    if (shouldRequireConnectionData && authType === "password") {
      password =
        passwordFromPayload ||
        (photographer.export_sftp_password_encrypted
          ? decryptSecret(photographer.export_sftp_password_encrypted)
          : "");
      if (!password) {
        return NextResponse.json(
          { error: "Password SFTP mancante: inseriscila prima di continuare." },
          { status: 400 }
        );
      }
    } else if (shouldRequireConnectionData) {
      privateKey =
        privateKeyFromPayload ||
        (photographer.export_sftp_private_key_encrypted
          ? decryptSecret(photographer.export_sftp_private_key_encrypted)
          : "");
      if (!privateKey.trim()) {
        return NextResponse.json(
          { error: "Chiave privata SFTP mancante: inseriscila prima di continuare." },
          { status: 400 }
        );
      }
    }

    if (mode === "test") {
      const testResult = await testSftpConnection({
        enabled: true,
        host,
        port,
        username,
        remotePath,
        authType,
        password: authType === "password" ? password : undefined,
        privateKey: authType === "private_key" ? privateKey : undefined,
      });

      if (!testResult.ok) {
        return NextResponse.json(
          { error: testResult.error || "Connessione SFTP non riuscita." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        message: "Connessione SFTP riuscita.",
      });
    }

    if (mode !== "save") {
      return NextResponse.json({ error: "Modalita non supportata." }, { status: 400 });
    }

    const admin = createAdminClient();
    const updatePayload: Partial<Photographer> = {
      export_sftp_enabled: enabled,
      export_sftp_host: host,
      export_sftp_port: port,
      export_sftp_username: username,
      export_sftp_remote_path: remotePath,
      export_sftp_auth_type: authType,
      export_links_expiry_minutes: linksExpiryMinutes,
      export_sftp_password_encrypted:
        authType === "password"
          ? passwordFromPayload
            ? encryptSecret(passwordFromPayload)
            : photographer.export_sftp_password_encrypted || null
          : null,
      export_sftp_private_key_encrypted:
        authType === "private_key"
          ? privateKeyFromPayload
            ? encryptSecret(privateKeyFromPayload)
            : photographer.export_sftp_private_key_encrypted || null
          : null,
    };

    const { data: updatedPhotographer, error } = await admin
      .from("photographers")
      .update(updatePayload)
      .eq("id", photographer.id)
      .select("*")
      .single();

    if (error) {
      if (isMissingExportSchemaError(error.message)) {
        return NextResponse.json(
          {
            error:
              "Schema export non allineato. Esegui prima la migration 005_order_exports_and_sftp_settings.sql.",
          },
          { status: 400 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      message: "Configurazione export salvata.",
      config: toPublicConfig(updatedPhotographer as Photographer),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Errore durante il salvataggio configurazione SFTP.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
