import "server-only";

interface OpenproviderApiResponse<T> {
  code: number;
  data?: T;
  desc?: string;
}

interface OpenproviderAuthData {
  token: string;
}

interface OpenproviderDomainCheckResult {
  domain?: string;
  status?: string;
  reason?: string;
  is_premium?: boolean;
  premium?: {
    currency?: string;
    price?: {
      create?: number;
    };
  };
  price?: {
    reseller?: {
      currency?: string;
      price?: number;
    };
    product?: {
      currency?: string;
      price?: number;
    };
  };
}

interface OpenproviderDomainCreateData {
  id?: number;
  status?: string;
  auth_code?: string;
  activation_date?: string;
  expiration_date?: string;
  renewal_date?: string;
}

const OPENPROVIDER_BASE_URL = "https://api.openprovider.eu/v1beta";

let authCache: { token: string; expiresAt: number } | null = null;

function getConfig() {
  const username = (process.env.OPENPROVIDER_API_USERNAME || "").trim();
  const password = (process.env.OPENPROVIDER_API_PASSWORD || "").trim();
  const ip = (process.env.OPENPROVIDER_API_IP || "0.0.0.0").trim();
  const ownerHandle = (process.env.OPENPROVIDER_OWNER_HANDLE || "").trim();
  const adminHandle = (process.env.OPENPROVIDER_ADMIN_HANDLE || ownerHandle).trim();
  const techHandle = (process.env.OPENPROVIDER_TECH_HANDLE || ownerHandle).trim();
  const billingHandle = (process.env.OPENPROVIDER_BILLING_HANDLE || ownerHandle).trim();
  const nameservers = [
    (process.env.OPENPROVIDER_NS1 || "").trim(),
    (process.env.OPENPROVIDER_NS2 || "").trim(),
    (process.env.OPENPROVIDER_NS3 || "").trim(),
  ].filter(Boolean);

  return {
    username,
    password,
    ip,
    ownerHandle,
    adminHandle,
    techHandle,
    billingHandle,
    nameservers,
  };
}

function splitDomain(input: string) {
  const normalized = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return {
    name: parts.slice(0, -1).join("."),
    extension: parts[parts.length - 1],
    normalized,
  };
}

export function isOpenproviderConfigured() {
  const config = getConfig();
  return Boolean(
    config.username &&
      config.password &&
      config.ownerHandle &&
      config.adminHandle &&
      config.techHandle
  );
}

async function openproviderFetch<T>(path: string, init: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${OPENPROVIDER_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const payload = (await response.json()) as OpenproviderApiResponse<T> & {
    error?: string;
    message?: string;
  };

  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.desc || payload.error || payload.message || "Openprovider API error.");
  }

  if (!payload.data) {
    throw new Error("Openprovider response priva di dati.");
  }

  return payload.data;
}

async function getAuthToken() {
  if (authCache && authCache.expiresAt > Date.now()) {
    return authCache.token;
  }

  const config = getConfig();
  if (!config.username || !config.password) {
    throw new Error("Credenziali Openprovider mancanti.");
  }

  const auth = await openproviderFetch<OpenproviderAuthData>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: config.username,
      password: config.password,
      ip: config.ip,
    }),
  });

  authCache = {
    token: auth.token,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };

  return auth.token;
}

export async function quoteOpenproviderDomain(inputDomain: string) {
  const domain = splitDomain(inputDomain);
  if (!domain) {
    throw new Error("Dominio non valido.");
  }

  const token = await getAuthToken();
  const data = await openproviderFetch<{ results?: OpenproviderDomainCheckResult[] }>(
    "/domains/check",
    {
      method: "POST",
      body: JSON.stringify({
        domains: [
          {
            name: domain.name,
            extension: domain.extension,
          },
        ],
        with_price: true,
      }),
    },
    token
  );

  const result = data.results?.[0];
  if (!result) {
    throw new Error("Impossibile verificare disponibilita dominio.");
  }

  const resellerCurrency = result.price?.reseller?.currency || result.price?.product?.currency || "EUR";
  const resellerPrice =
    result.price?.reseller?.price ??
    result.premium?.price?.create ??
    result.price?.product?.price ??
    0;

  return {
    domain: result.domain || domain.normalized,
    status: result.status || "unknown",
    reason: result.reason || "",
    isPremium: Boolean(result.is_premium),
    currency: resellerCurrency,
    providerCreatePrice: Number(resellerPrice),
  };
}

export async function registerOpenproviderDomain(params: {
  domain: string;
  periodYears: number;
}) {
  const parsed = splitDomain(params.domain);
  if (!parsed) {
    throw new Error("Dominio non valido.");
  }

  const config = getConfig();
  if (!config.ownerHandle || !config.adminHandle || !config.techHandle) {
    throw new Error("Handle Openprovider non configurati.");
  }

  const token = await getAuthToken();
  const data = await openproviderFetch<OpenproviderDomainCreateData>(
    "/domains",
    {
      method: "POST",
      body: JSON.stringify({
        domain: {
          name: parsed.name,
          extension: parsed.extension,
        },
        owner_handle: config.ownerHandle,
        admin_handle: config.adminHandle,
        tech_handle: config.techHandle,
        billing_handle: config.billingHandle || undefined,
        autorenew: "on",
        period: Math.max(1, Math.min(10, Math.round(params.periodYears))),
        name_servers:
          config.nameservers.length > 0
            ? config.nameservers.map((name) => ({ name }))
            : undefined,
      }),
    },
    token
  );

  return data;
}
