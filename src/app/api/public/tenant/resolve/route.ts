import { NextResponse } from "next/server";
import { resolveTenantByHost } from "@/lib/tenant-domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!forwardedHost) {
    return NextResponse.json({ photographerId: null, host: null });
  }

  const photographerId = await resolveTenantByHost(forwardedHost);
  return NextResponse.json({
    host: forwardedHost,
    photographerId,
  });
}
