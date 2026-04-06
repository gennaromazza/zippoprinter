import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getPlatformAdminContext } from "@/lib/platform-auth";
import { AccountSecurityPanel } from "@/components/account-security-panel";

export default async function PlatformAccountPage() {
  const auth = await getPlatformAdminContext();

  if (auth.status === 401) {
    redirect("/login?force=1");
  }

  if (auth.status === 403) {
    redirect("/admin");
  }

  if (auth.status !== 200) {
    redirect("/");
  }

  return (
    <section className="space-y-4">
      <header>
        <p className="section-kicker">
          <ShieldCheck className="h-3.5 w-3.5" />
          Sicurezza owner
        </p>
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Account piattaforma</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Credenziali e sicurezza personale per l&apos;accesso al pannello owner.
        </p>
      </header>

      <AccountSecurityPanel
        initialEmail={auth.context.userEmail || auth.context.admin.email}
        context="platform"
      />
    </section>
  );
}
