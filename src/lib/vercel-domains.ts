import "server-only";

const VERCEL_API_BASE = "https://api.vercel.com";

function getVercelConfig() {
  const token = (process.env.VERCEL_API_TOKEN || "").trim();
  const projectId = (process.env.VERCEL_PROJECT_ID || "").trim();
  const teamId = (process.env.VERCEL_TEAM_ID || "").trim();
  const dnsTarget = (process.env.VERCEL_DOMAINS_CNAME_TARGET || "cname.vercel-dns.com").trim();
  return { token, projectId, teamId, dnsTarget };
}

function withTeam(query: URLSearchParams, teamId: string) {
  if (teamId) {
    query.set("teamId", teamId);
  }
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function isVercelDomainApiConfigured() {
  const { token, projectId } = getVercelConfig();
  return Boolean(token && projectId);
}

export function getVercelDnsTarget() {
  return getVercelConfig().dnsTarget;
}

export async function addDomainToProject(domain: string) {
  const { token, projectId, teamId } = getVercelConfig();
  if (!token || !projectId) {
    throw new Error("Vercel Domains API non configurata.");
  }

  const query = new URLSearchParams();
  withTeam(query, teamId);
  const response = await fetch(
    `${VERCEL_API_BASE}/v10/projects/${projectId}/domains?${query.toString()}`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ name: domain }),
    }
  );

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(payload.error?.toString?.() || payload.message || "Add domain failed"));
  }

  return payload;
}

export async function getDomainConfig(domain: string) {
  const { token, projectId, teamId } = getVercelConfig();
  if (!token || !projectId) {
    throw new Error("Vercel Domains API non configurata.");
  }

  const query = new URLSearchParams();
  query.set("domain", domain);
  withTeam(query, teamId);

  const response = await fetch(
    `${VERCEL_API_BASE}/v6/domains/${domain}/config?${query.toString()}`,
    { headers: authHeaders(token) }
  );

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(payload.error?.toString?.() || payload.message || "Get domain config failed"));
  }

  return payload;
}

export async function verifyDomain(domain: string) {
  const { token, projectId, teamId } = getVercelConfig();
  if (!token || !projectId) {
    throw new Error("Vercel Domains API non configurata.");
  }

  const query = new URLSearchParams();
  withTeam(query, teamId);
  const response = await fetch(
    `${VERCEL_API_BASE}/v9/projects/${projectId}/domains/${domain}/verify?${query.toString()}`,
    {
      method: "POST",
      headers: authHeaders(token),
    }
  );

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(payload.error?.toString?.() || payload.message || "Verify domain failed"));
  }

  return payload;
}

export async function removeDomainFromProject(domain: string) {
  const { token, projectId, teamId } = getVercelConfig();
  if (!token || !projectId) {
    throw new Error("Vercel Domains API non configurata.");
  }

  const query = new URLSearchParams();
  withTeam(query, teamId);
  const response = await fetch(
    `${VERCEL_API_BASE}/v9/projects/${projectId}/domains/${domain}?${query.toString()}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    }
  );

  if (!response.ok) {
    const payload = (await response.json()) as Record<string, unknown>;
    throw new Error(
      String(payload.error?.toString?.() || payload.message || "Remove domain failed")
    );
  }
}
