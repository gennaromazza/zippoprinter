import { headers } from "next/headers";

function firstHeaderValue(value: string | null) {
  if (!value) {
    return "";
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .find(Boolean) || "";
}

function normalizeUrlHost(value: string) {
  try {
    const url = new URL(value);
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return `${url.hostname.toLowerCase()}:${port}`;
  } catch {
    return null;
  }
}

function normalizeHostHeader(host: string, proto: string) {
  const safeProto = proto.toLowerCase() === "https" ? "https" : "http";
  return normalizeUrlHost(`${safeProto}://${host}`);
}

export async function isSameOriginRequest() {
  const headerStore = await headers();
  const host =
    firstHeaderValue(headerStore.get("x-forwarded-host")) ||
    firstHeaderValue(headerStore.get("host"));
  const proto = firstHeaderValue(headerStore.get("x-forwarded-proto")) || "http";

  if (!host) {
    return false;
  }

  const expectedHost = normalizeHostHeader(host, proto);
  if (!expectedHost) {
    return false;
  }

  const origin = firstHeaderValue(headerStore.get("origin"));
  const referer = firstHeaderValue(headerStore.get("referer"));

  const candidates = [origin, referer].filter(Boolean);
  if (candidates.length > 0) {
    return candidates.some((candidate) => normalizeUrlHost(candidate) === expectedHost);
  }

  const secFetchSite = firstHeaderValue(headerStore.get("sec-fetch-site")).toLowerCase();
  if (secFetchSite === "same-origin" || secFetchSite === "same-site" || secFetchSite === "none") {
    return true;
  }

  return false;
}
