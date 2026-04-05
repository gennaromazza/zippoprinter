import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Building2, Shield, Zap } from "lucide-react";
import { getPlatformAdminContext } from "@/lib/platform-auth";
import { Button } from "@/components/ui/button";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const auth = await getPlatformAdminContext();

  if (auth.status === 401) {
    redirect("/login");
  }

  if (auth.status === 403) {
    redirect("/admin");
  }

  if (auth.status !== 200) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[color:var(--background)] px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[2rem] border border-[color:var(--border)] bg-white px-5 py-5 shadow-[var(--shadow-sm)] md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="section-kicker mb-2"><Shield className="h-3.5 w-3.5" />Vista proprietario</p>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Pannello controllo piattaforma</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Tieni sotto controllo tutti gli studi: abbonamenti, pagamenti online, domini e alert operativi.
              </p>
            </div>
            <div className="rounded-full border border-[color:var(--border)] bg-[color:var(--muted)]/40 px-4 py-2 text-sm font-semibold">
              {auth.context.admin.email}
            </div>
          </div>
          <nav className="mt-5 flex flex-wrap items-center gap-2">
            <Link href="/platform"><Button variant="outline" size="sm"><BarChart3 className="h-4 w-4" />Panoramica</Button></Link>
            <Link href="/platform/tenants"><Button variant="outline" size="sm"><Building2 className="h-4 w-4" />Studi</Button></Link>
            <Link href="/platform/events"><Button variant="outline" size="sm"><Zap className="h-4 w-4" />Eventi</Button></Link>
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
