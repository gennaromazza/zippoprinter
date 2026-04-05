# Operazioni Piattaforma (Dashboard Owner V2)

## Obiettivo

L'area `/platform` e il pannello operativo del proprietario SaaS. In V2 combina osservabilita e supporto account:

- dove ci sono rischi su studi/abbonamenti
- se i pagamenti online sono pronti
- se domini e webhook sono in salute
- come intervenire su recupero accesso studio

## Schermate

- `/platform`
  - KPI globali
  - trend 7/30 giorni
  - alert prioritizzati
- `/platform/tenants`
  - elenco studi con filtri
  - stato operativo sintetico (`OK`, `Attenzione`, `Critico`)
- `/platform/tenants/[id]`
  - dettaglio studio (abbonamento, Connect, domini, timeline eventi)
  - supporto account: reset password via email + blocco/sblocco accesso
- `/platform/events`
  - stream eventi piattaforma (billing/webhook)

## Glossario Italiano UI

- Tenant -> Studio
- Connect ready -> Pagamenti online pronti
- Webhook backlog -> Eventi in attesa
- Critical/Warning/Info -> Critico/Attenzione/Informativo

## Dizionario KPI + Tooltip

- **Studi totali**
  - quanti studi sono registrati sulla piattaforma
- **Abbonamenti attivi**
  - studi in trial/active/lifetime
- **Pagamenti online pronti**
  - studi con Stripe Connect collegato e operativo
- **Eventi in attesa**
  - webhook non processati oltre soglia (10 minuti)

## Semantica Alert

- `Critico`
  - rischio alto, potenziale blocco operativo/ricavi
- `Attenzione`
  - rischio medio, intervento consigliato nel breve
- `Informativo`
  - segnale di contesto non bloccante

## Controllo Giornaliero (3 minuti)

1. Apri `/platform`: guarda `Eventi in attesa` e alert critici.
2. Vai su `/platform/tenants`: ordina mentalmente gli studi "Critico" prima.
3. Apri `/platform/tenants/[id]` sugli studi critici:
   - stato abbonamento
   - stato pagamenti online
   - stato dominio
   - timeline eventi
   - stato accesso studio e ultime azioni supporto
4. Se serve approfondimento tecnico, usa i runbook:
   - `docs/runbooks/billing-lifecycle.md`
   - `docs/runbooks/domain-onboarding.md`
   - `docs/security/incident-playbook.md`
