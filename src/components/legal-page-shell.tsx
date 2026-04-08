import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_LINKS } from "@/lib/privacy-consent";

interface LegalPageShellProps {
  title: string;
  summary: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalPageShell({ title, summary, lastUpdated, children }: LegalPageShellProps) {
  return (
    <main className="px-4 py-10 md:px-8 md:py-14">
      <div className="mx-auto max-w-4xl rounded-[2rem] border border-[color:var(--border)] bg-white p-6 shadow-[var(--shadow-sm)] md:p-10">
        <p className="section-kicker mb-3">Documentazione legale</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{summary}</p>
        <p className="mt-4 text-sm text-muted-foreground">Ultimo aggiornamento: {lastUpdated}</p>

        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
          <Link href={LEGAL_LINKS.privacyPolicy} className="font-semibold text-primary hover:underline">
            Privacy Policy
          </Link>
          <Link href={LEGAL_LINKS.cookiePolicy} className="font-semibold text-primary hover:underline">
            Cookie Policy
          </Link>
          <Link href={LEGAL_LINKS.termsOfService} className="font-semibold text-primary hover:underline">
            Termini di Servizio
          </Link>
        </div>

        <div className="mt-8 space-y-6 text-sm leading-7 text-foreground">{children}</div>
      </div>
    </main>
  );
}
