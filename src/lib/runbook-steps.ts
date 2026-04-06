/**
 * Structured runbook steps mapped to platform alert types.
 * Used to show inline operational guidance in the dashboard.
 */

export interface RunbookStep {
  order: number;
  action: string;
  detail?: string;
}

export interface RunbookGuide {
  title: string;
  alertTypes: string[];
  steps: RunbookStep[];
  docPath: string;
}

/**
 * Runbook guides derived from docs/runbooks/*.md
 * Kept in sync manually — when runbooks change, update here.
 */
export const PLATFORM_RUNBOOKS: RunbookGuide[] = [
  {
    title: "Gestione pagamento fallito (past_due)",
    alertTypes: ["subscription_state", "past_due", "payment_failed"],
    steps: [
      { order: 1, action: "Apri scheda studio dal link alert", detail: "Verifica lo stato subscription e l'ultima fattura." },
      { order: 2, action: "Controlla se il cliente ha metodo di pagamento valido", detail: "Vai alla sezione billing account nel dettaglio studio." },
      { order: 3, action: "Contatta il cliente via email/telefono", detail: "Comunica il problema e chiedi aggiornamento metodo di pagamento." },
      { order: 4, action: "Se risolto, riconcilia subscription con Stripe", detail: "Usa il bottone 'Riconcilia con Stripe' nella scheda support." },
      { order: 5, action: "Se non risolto entro 14 giorni, valuta sospensione", detail: "Usa il cambio stato accesso per bloccare temporaneamente." },
    ],
    docPath: "/platform/runbooks/billing-lifecycle",
  },
  {
    title: "Studio sospeso (suspended)",
    alertTypes: ["subscription_state", "suspended"],
    steps: [
      { order: 1, action: "Verifica motivo sospensione", detail: "Controlla audit log e ultimo cambio stato accesso." },
      { order: 2, action: "Contatta lo studio per capire la situazione" },
      { order: 3, action: "Se il pagamento e stato regolarizzato, riconcilia", detail: "Riconcilia subscription e ripristina accesso." },
      { order: 4, action: "Sblocca accesso dalla scheda support", detail: "Cambia stato a 'active' con motivazione." },
    ],
    docPath: "/platform/runbooks/billing-lifecycle",
  },
  {
    title: "Stripe Connect non pronto",
    alertTypes: ["connect_not_ready", "connect", "stripe"],
    steps: [
      { order: 1, action: "Verifica stato Connect nel dettaglio studio", detail: "Controlla connect_status, charges_enabled, payouts_enabled." },
      { order: 2, action: "Se in stato 'pending', il fotografo deve completare onboarding", detail: "Invia un reminder via email o contatta direttamente." },
      { order: 3, action: "Se in stato 'restricted', verifica requisiti Stripe", detail: "Potrebbe servire documentazione aggiuntiva lato Stripe." },
      { order: 4, action: "Conferma che entitlements sono corretti", detail: "can_accept_online_payments deve essere true se lo studio ha un piano attivo." },
    ],
    docPath: "/platform/runbooks/billing-lifecycle",
  },
  {
    title: "Dominio con problemi DNS/SSL",
    alertTypes: ["domain_health", "domain", "dns", "ssl"],
    steps: [
      { order: 1, action: "Apri dettaglio studio e verifica configurazione dominio", detail: "Controlla verification_status e ssl_status." },
      { order: 2, action: "Se verification_status=failed, il DNS non e configurato correttamente", detail: "Il CNAME deve puntare al target Vercel indicato." },
      { order: 3, action: "Chiedi al cliente di verificare la configurazione DNS", detail: "Invia le istruzioni DNS specifiche per il suo provider." },
      { order: 4, action: "Dopo modifica DNS, aspetta propagazione (fino a 48h)", detail: "Non ritentare la verifica prima di qualche ora." },
      { order: 5, action: "Ritenta verifica e sync dal pannello domini", detail: "Usa le azioni 'Verifica' e 'Sincronizza' nella scheda dominio." },
    ],
    docPath: "/platform/runbooks/domain-onboarding",
  },
  {
    title: "Webhook non processati (backlog)",
    alertTypes: ["webhook_backlog", "webhook", "event"],
    steps: [
      { order: 1, action: "Vai alla pagina Eventi e filtra per 'non processati'", detail: "Identifica gli eventi bloccati e il loro tipo." },
      { order: 2, action: "Verifica se c'e un pattern (stesso tipo, stesso studio)", detail: "Un singolo studio puo bloccare per errori ripetuti." },
      { order: 3, action: "Prova replay dell'evento piu vecchio", detail: "Usa il bottone Replay nella riga dell'evento." },
      { order: 4, action: "Se replay fallisce, controlla i log audit per errori", detail: "Cerca il correlation_id nell'audit per capire la causa." },
      { order: 5, action: "Se il problema persiste, verifica stato servizi esterni", detail: "Controlla status page Stripe e stato Supabase." },
    ],
    docPath: "/platform/runbooks/incident-playbook",
  },
];

/**
 * Find the best matching runbook for an alert type.
 */
export function findRunbookForAlert(alertType: string): RunbookGuide | null {
  const lower = alertType.toLowerCase();

  // Exact match first
  for (const guide of PLATFORM_RUNBOOKS) {
    if (guide.alertTypes.some((t) => t === lower)) {
      return guide;
    }
  }

  // Partial match
  for (const guide of PLATFORM_RUNBOOKS) {
    if (guide.alertTypes.some((t) => lower.includes(t) || t.includes(lower))) {
      return guide;
    }
  }

  return null;
}
