import { NextResponse } from "next/server";
import {
  LEGAL_DOCUMENT_VERSION,
  PRIVACY_CONSENT_DECISIONS,
  PRIVACY_CONSENT_KEYS,
  PRIVACY_CONSENT_SOURCES,
  PRIVACY_CONSENT_SUBJECT_TYPES,
} from "@/lib/privacy-consent";
import { rateLimit } from "@/lib/rate-limit";
import { isMissingPrivacySchemaError } from "@/lib/schema-compat";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PrivacyConsentPayload {
  source?: string;
  consentKey?: string;
  consentGranted?: boolean;
  decision?: string;
  consentVersion?: string;
  subjectType?: string;
  subjectIdentifier?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value as T[number]);
}

function parseMetadata(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  const output: Record<string, string | number | boolean | null> = {};

  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 20)) {
    const key = rawKey.trim();
    if (!key || key.length > 64) {
      continue;
    }

    if (typeof rawValue === "string") {
      output[key] = rawValue.slice(0, 500);
      continue;
    }

    if (typeof rawValue === "number" || typeof rawValue === "boolean" || rawValue === null) {
      output[key] = rawValue;
    }
  }

  return output;
}

function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "public-privacy-consent", limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "Troppi tentativi. Riprova tra un minuto." }, { status: 429 });
  }

  let payload: PrivacyConsentPayload;

  try {
    payload = (await request.json()) as PrivacyConsentPayload;
  } catch {
    return NextResponse.json({ error: "Payload non valido." }, { status: 400 });
  }

  const source = asString(payload.source);
  const consentKey = asString(payload.consentKey);
  const subjectType = asString(payload.subjectType);
  const decision = asString(payload.decision);
  const consentVersion = asString(payload.consentVersion) || LEGAL_DOCUMENT_VERSION;
  const subjectIdentifier = asString(payload.subjectIdentifier).slice(0, 320) || null;
  const tenantId = asString(payload.tenantId) || null;

  if (!isOneOf(PRIVACY_CONSENT_SOURCES, source)) {
    return NextResponse.json({ error: "source non valido." }, { status: 400 });
  }
  if (!isOneOf(PRIVACY_CONSENT_KEYS, consentKey)) {
    return NextResponse.json({ error: "consentKey non valido." }, { status: 400 });
  }
  if (!isOneOf(PRIVACY_CONSENT_SUBJECT_TYPES, subjectType)) {
    return NextResponse.json({ error: "subjectType non valido." }, { status: 400 });
  }
  if (typeof payload.consentGranted !== "boolean") {
    return NextResponse.json({ error: "consentGranted deve essere boolean." }, { status: 400 });
  }
  if (decision && !isOneOf(PRIVACY_CONSENT_DECISIONS, decision)) {
    return NextResponse.json({ error: "decision non valida." }, { status: 400 });
  }
  if (tenantId && !isUuid(tenantId)) {
    return NextResponse.json({ error: "tenantId non valido." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("privacy_consents").insert({
    source,
    consent_key: consentKey,
    consent_version: consentVersion.slice(0, 40),
    consent_granted: payload.consentGranted,
    decision: decision || null,
    subject_type: subjectType,
    subject_identifier: subjectIdentifier,
    tenant_id: tenantId,
    request_origin: (request.headers.get("origin") || "").slice(0, 255) || null,
    request_ip: getRequestIp(request),
    user_agent: (request.headers.get("user-agent") || "").slice(0, 512) || null,
    metadata: parseMetadata(payload.metadata),
  });

  if (error) {
    if (isMissingPrivacySchemaError(error.message)) {
      return NextResponse.json({ ok: true, stored: false }, { status: 202 });
    }
    return NextResponse.json({ error: "Impossibile registrare il consenso." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, stored: true }, { status: 201 });
}
