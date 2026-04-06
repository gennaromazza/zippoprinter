import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import { resolveTenantByHost } from "@/lib/tenant-domains";
import { AdminShell } from "@/components/admin-shell";

function getPlatformAdminUrl() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!siteUrl) {
    return null;
  }
  return `${siteUrl.replace(/\/$/, "")}/admin`;
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const headerStore = await headers();
  const incomingHost = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const platformAdminUrl = getPlatformAdminUrl();
  const customDomainTenantId = incomingHost ? await resolveTenantByHost(incomingHost) : null;

  if (customDomainTenantId && platformAdminUrl) {
    redirect(`${platformAdminUrl}?source=custom-domain`);
  }

  if (customDomainTenantId && !platformAdminUrl) {
    return (
      <main className="min-h-screen px-4 py-8 md:px-8">
        <div className="mx-auto max-w-3xl rounded-[1.8rem] border border-amber-300 bg-amber-50 px-6 py-6">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-900">
            Area Admin Protetta
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-amber-950">L&apos;admin non e disponibile su dominio personalizzato</h1>
          <p className="mt-3 text-sm leading-6 text-amber-900">
            Per motivi di sicurezza, l&apos;area di gestione e disponibile solo sul dominio centrale della piattaforma.
            Imposta `NEXT_PUBLIC_SITE_URL` per abilitare il redirect automatico.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center rounded-xl border border-amber-700 bg-white px-4 py-2 text-sm font-semibold text-amber-900"
          >
            Torna alla vetrina clienti
          </Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const photographer = await getCurrentPhotographerForUser(user);
  if (!photographer) redirect("/login");

  return (
    <AdminShell photographerName={photographer.name || "Studio fotografico"}>
      {children}
    </AdminShell>
  );
}
