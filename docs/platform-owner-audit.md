# Audit Completezza Pannello Owner (V1)

Data: 2026-04-05

## Scenari Valutati

1. Studio in `past_due`
2. Stripe Connect non pronto
3. Dominio in errore (DNS/SSL)
4. Webhook non processati
5. Triage supporto studio
6. Verifica adozione/funnel

## Esito Sintetico

La V1 copre bene monitoraggio e triage iniziale (scenari 1-5), ma la parte adozione/funnel e automazioni operative e ancora parziale.

## Must-have (priorita alta)

1. Filtri guidati con preset rapidi
   - Motivo: accelera la gestione quotidiana in presenza di molti studi.
2. Stato operativo sintetico per studio
   - Motivo: riduce tempo di triage per scenario 1/2/3.
3. Next-step esplicito negli alert
   - Motivo: serve una call-to-action immediata per operatori non tecnici.

## Should-have (priorita media)

1. Filtri salvati owner
   - Motivo: flussi ripetitivi supporto/commerciale.
2. Export CSV elenco studi
   - Motivo: reporting rapido e allineamento con commerciale.
3. Box "Azioni consigliate oggi"
   - Motivo: aumenta focus operativo e riduce dimenticanze.

## Later (priorita bassa/strategica)

1. Runbook guidati step-by-step in UI
2. Score salute studio (composito)
3. Dashboard revenue/cohort SaaS avanzata

## Note di Coerenza V1

- La scelta read-only e confermata: nessuna mutazione diretta owner.
- Il pannello e adeguato per controllo e diagnosi, non ancora per automazione operativa avanzata.
