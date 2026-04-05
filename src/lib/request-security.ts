import { headers } from "next/headers";

export async function isSameOriginRequest() {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");

  if (!origin || !host) {
    return false;
  }

  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}
