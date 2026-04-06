import { redirect, notFound } from "next/navigation";
import { getPlatformAdminContext } from "@/lib/platform-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Runbook content served inline behind platform auth.
 * Markdown files from docs/ are not served by Next.js at runtime.
 */

interface RunbookEntry {
  title: string;
  sections: { heading: string; content: string }[];
}

const RUNBOOKS: Record<string, RunbookEntry> = {
  "billing-lifecycle": {
    title: "Runbook: Billing Lifecycle",
    sections: [
      {
        heading: "Piani disponibili",
        content: `<ul>
          <li><code>starter_monthly</code> — EUR 6.00/mese</li>
          <li><code>starter_yearly</code> — EUR 50.00/anno</li>
          <li><code>lifetime_buyout</code> — EUR 1000.00 (una tantum)</li>
        </ul>`,
      },
      {
        heading: "Stati subscription",
        content: `<ul>
          <li><strong>trialing</strong> — periodo di prova attivo</li>
          <li><strong>active</strong> — abbonamento pagante attivo</li>
          <li><strong>past_due</strong> — pagamento fallito, servizio a rischio</li>
          <li><strong>canceled</strong> — annullato dal cliente o dal sistema</li>
          <li><strong>suspended</strong> — sospeso per morosita o violazione</li>
          <li><strong>lifetime</strong> — acquisto una tantum, accesso permanente</li>
        </ul>`,
      },
      {
        heading: "Policy entitlement (v1)",
        content: `<p><strong>Accesso completo</strong> (trialing, active, lifetime): pagamenti online abilitati, dominio custom abilitato.</p>
        <p><strong>Accesso limitato</strong> (past_due, canceled, suspended): pagamenti online disabilitati, dominio custom disabilitato.</p>`,
      },
      {
        heading: "Webhook events",
        content: `<ul>
          <li><code>customer.subscription.*</code> — aggiorna riga tenant subscription</li>
          <li><code>invoice.paid</code> — imposta subscription a <code>active</code></li>
          <li><code>invoice.payment_failed</code> — imposta subscription a <code>past_due</code></li>
          <li>Order events — aggiornano campi pagamento ordine</li>
        </ul>`,
      },
      {
        heading: "Email automatiche (Resend)",
        content: `<p><strong>Trial:</strong> trial_expiring_7d, trial_expiring_3d, trial_expiring_1d, trial_expired</p>
        <p><strong>Subscription:</strong> subscription_activated, plan_changed, cancel_at_period_end_confirmed, period_end_reminder</p>
        <p><strong>Pagamento:</strong> renewal_payment_failed, payment_recovered_or_reactivated</p>
        <p><strong>Trigger:</strong> webhook, cron (<code>/api/cron/billing-lifecycle</code>), completamenti API manuali.</p>`,
      },
      {
        heading: "Idempotency",
        content: `<p>L&apos;event id viene inserito in <code>billing_events</code> con chiave unica. Un evento duplicato esce immediatamente senza effetti collaterali.</p>`,
      },
    ],
  },
  "domain-onboarding": {
    title: "Runbook: Domain Onboarding (BYOD)",
    sections: [
      {
        heading: "Percorso felice",
        content: `<ol>
          <li>Il tenant richiede il dominio tramite <code>POST /api/admin/domains</code></li>
          <li>L&apos;app crea un record pending e ritorna le istruzioni DNS</li>
          <li>Il tenant aggiorna il DNS (CNAME www → target Vercel)</li>
          <li>Operatore/tenant triggera <code>PATCH action=verify</code> poi <code>PATCH action=sync</code></li>
          <li>Quando verification=verified e ssl=ready, il tenant attiva il dominio</li>
        </ol>`,
      },
      {
        heading: "Matrice errori",
        content: `<ul>
          <li><strong>DNS non propagato:</strong> mantieni verification_status=pending, ritenta piu tardi</li>
          <li><strong>Dominio gia occupato:</strong> la chiamata al provider fallisce, ritorna errore chiaro</li>
          <li><strong>SSL pending:</strong> non permettere attivazione finche ssl_status non e ready</li>
        </ul>`,
      },
      {
        heading: "Note operative",
        content: `<ul>
          <li>Mantieni <code>/studio/[photographerId]</code> come fallback canonico</li>
          <li>Un solo dominio attivo per tenant</li>
          <li>Ogni azione dominio scrive un audit log</li>
        </ul>`,
      },
    ],
  },
  "incident-playbook": {
    title: "Incident Playbook",
    sections: [
      {
        heading: "Livelli di severita",
        content: `<ul>
          <li><strong>SEV-1:</strong> data leak o corruzione pagamenti cross-tenant</li>
          <li><strong>SEV-2:</strong> outage billing/dominio di un tenant</li>
          <li><strong>SEV-3:</strong> funzionalita degradata senza impatto integrita dati</li>
        </ul>`,
      },
      {
        heading: "Primi 15 minuti",
        content: `<ol>
          <li>Congela le mutazioni rischiose (feature flags / disabilitazione endpoint)</li>
          <li>Cattura request id e tenant id coinvolti</li>
          <li>Preserva payload webhook/eventi e log</li>
          <li>Notifica i tenant impattati per SEV-1/2</li>
        </ol>`,
      },
      {
        heading: "Azioni di contenimento",
        content: `<ul>
          <li>Disabilita legacy checkout se rilevato abuso</li>
          <li>Forza disattivazione dominio per record dirottati</li>
          <li>Pausa webhook processor se appare regressione idempotency</li>
        </ul>`,
      },
      {
        heading: "Verifica recovery",
        content: `<ul>
          <li>Conferma boundary tenant con query SQL mirate</li>
          <li>Replay eventi webhook da <code>billing_events</code></li>
          <li>Valida ordini/subscription/domini per tenant coinvolti</li>
        </ul>`,
      },
      {
        heading: "Template postmortem",
        content: `<ul>
          <li>Sommario impatto</li>
          <li>Root cause</li>
          <li>Gap di rilevamento</li>
          <li>Azioni preventive</li>
          <li>Owner e data scadenza</li>
        </ul>`,
      },
    ],
  },
};

export default async function PlatformRunbookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const auth = await getPlatformAdminContext();
  if (auth.status !== 200) {
    redirect("/platform");
  }

  const { slug } = await params;
  const runbook = RUNBOOKS[slug];

  if (!runbook) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <Link href="/platform">
        <Button variant="outline" size="sm">
          <ArrowLeft className="h-4 w-4" />
          Torna alla panoramica
        </Button>
      </Link>

      <Card className="border-[color:var(--border)] bg-white">
        <CardHeader>
          <CardDescription>Guida operativa</CardDescription>
          <CardTitle>{runbook.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {runbook.sections.map((section) => (
            <div key={section.heading}>
              <h3 className="mb-2 text-base font-semibold">{section.heading}</h3>
              <div
                className="prose prose-sm max-w-none text-muted-foreground [&_code]:rounded [&_code]:bg-[color:var(--muted)]/40 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_strong]:text-foreground [&_li]:my-0.5"
                dangerouslySetInnerHTML={{ __html: section.content }}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
