# ZippoPrinter

ZippoPrinter e una web app per studi fotografici che raccoglie ordini di stampa online e li organizza in un pannello amministrativo semplice da usare.

## Cosa fa

- Front-end cliente white-label con nome studio, colore brand e messaggio di benvenuto.
- Upload multiplo di foto con scelta formato e quantita per ogni immagine.
- Creazione ordine su Supabase con salvataggio file nel bucket `photos`.
- Backoffice admin per dashboard, lista ordini, dettaglio ordine e gestione formati.
- Pagina `setup` tecnica per verificare configurazione database, auth e storage.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase Auth, Database e Storage

## Pagine principali

- `/`
  front-end cliente per inviare ordini di stampa.
- `/login`
  accesso amministratore.
- `/admin`
  dashboard studio con metriche e ultimi ordini.
- `/admin/orders`
  elenco completo ordini.
- `/admin/orders/[id]`
  dettaglio ordine con foto, cliente e azioni rapide.
- `/admin/settings`
  branding studio, tema storefront cliente (preset hero + sfondo + palette), gestione formati con sconti quantita guidati e dominio personalizzato (BYOD + condizioni acquisto/rinnovo).
- `/setup`
  utilita di setup e diagnostica ambiente.
- `/platform`
  pannello proprietario multi-studio (read-only) per monitorare abbonamenti, pagamenti online, domini e alert.

## UI v1

Il redesign di questa versione introduce:

- tema condiviso cliente + admin con look editoriale chiaro e premium;
- base visuale white-label per valorizzare lo studio invece del prodotto;
- componenti coerenti per card, input, pulsanti, badge stato e dialog;
- funnel cliente piu leggibile con riepilogo ordine dedicato;
- backoffice piu ordinato per uso quotidiano da desktop e mobile.

## Avvio locale

```bash
npm install
npm run dev
```

Apri `http://localhost:3000`.

## Configurazione

La configurazione database iniziale e documentata in [SETUP_GUIDE.md](/D:/ZippoProject/zippoprinter/SETUP_GUIDE.md).

Assicurati di avere:

- variabili Supabase in `.env.local`;
- migrazione `supabase/migrations/001_initial_schema.sql` eseguita;
- bucket storage `photos` creato;
- policy storage configurate.

## Deploy production

Produzione attuale:

- GitHub: `https://github.com/gennaromazza/zippoprinter`
- Vercel project: `studiofotograficozippo-5593s-projects / zippoprinter`
- Dominio: `https://studiofotograficozippoprinter.com`
- Alias: `https://zippoprinter.vercel.app`

Impostazioni Vercel corrette:

- `Framework Preset`: `Next.js`
- `Root Directory`: `.`
- `Output Directory`: vuoto
- `Deployment Protection`: disattivata per il sito pubblico

Variabili ambiente richieste:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `INIT_SECRET`
- `INIT_ADMIN_PASSWORD`
- `INIT_ADMIN_EMAIL` (opzionale)
- `ENABLE_SETUP_ENDPOINTS` (opzionale, `true` per abilitare /setup e /api/setup in produzione)
- `ENABLE_PLATFORM_DASHBOARD` (opzionale, consigliato `true` in produzione per area owner `/platform`)
- `NEXT_PUBLIC_ENABLE_SETUP` (opzionale, `true` per mostrare la pagina /setup)
- `STRIPE_SECRET_KEY` se si usa checkout online
- `STRIPE_WEBHOOK_SECRET` se si usa checkout online
- `STRIPE_PLATFORM_WEBHOOK_SECRET` per webhook subscription SaaS (piattaforma)
- `RESEND_API_KEY` per notifiche email transazionali SaaS
- `RESEND_FROM_EMAIL` mittente notifiche (es. `ZippoPrinter <billing@tuodominio.it>`)
- `ENABLE_LEGACY_STRIPE_FALLBACK` (`true` durante migrazione Connect, poi `false`)
- `VERCEL_API_TOKEN` per gestione custom domain BYOD
- `VERCEL_PROJECT_ID` project id Vercel del deployment
- `VERCEL_TEAM_ID` (opzionale, se progetto in team)
- `VERCEL_DOMAINS_CNAME_TARGET` (opzionale, default `cname.vercel-dns.com`)
- `NEXT_PUBLIC_DOMAIN_PURCHASE_URL` (opzionale): URL pagina acquisto dominio
- `NEXT_PUBLIC_DOMAIN_PURCHASE_PRICE_EUR` (opzionale): prezzo acquisto mostrato in UI
- `NEXT_PUBLIC_DOMAIN_RENEWAL_PRICE_EUR` (opzionale): prezzo rinnovo annuale mostrato in UI
- `OPENPROVIDER_API_USERNAME` per acquisto dominio in piattaforma
- `OPENPROVIDER_API_PASSWORD` per acquisto dominio in piattaforma
- `OPENPROVIDER_API_IP` (opzionale, default `0.0.0.0`)
- `OPENPROVIDER_OWNER_HANDLE` handle contatto owner Openprovider
- `OPENPROVIDER_ADMIN_HANDLE` (opzionale, fallback `OPENPROVIDER_OWNER_HANDLE`)
- `OPENPROVIDER_TECH_HANDLE` (opzionale, fallback `OPENPROVIDER_OWNER_HANDLE`)
- `OPENPROVIDER_BILLING_HANDLE` (opzionale, fallback `OPENPROVIDER_OWNER_HANDLE`)
- `OPENPROVIDER_NS1` / `OPENPROVIDER_NS2` / `OPENPROVIDER_NS3` (opzionali)
- `DOMAIN_MARKUP_PERCENT` (opzionale, default `25`)
- `DOMAIN_MIN_MARGIN_EUR` (opzionale, default `3.00`)
- `PHOTO_RETENTION_DAYS` (opzionale, default `10`): giorni dopo cui le foto di ordini `completed` vengono eliminate automaticamente
- `CRON_SECRET` (consigliato): secret bearer per invocare in sicurezza gli endpoint cron interni
- `OWNER_STEP_UP_TOKEN` richiesto per azioni owner critiche (override/trial reset/replay/suspend)

Nota Stripe:
- per idempotenza webhook, creare una tabella `stripe_events` con `event_id` univoco (opzionale ma consigliato).
- per foundation SaaS v2, usare `billing_events` come log/idempotenza webhook.

Nota sicurezza:
- per protezione CSRF sulle Server Actions, le richieste devono provenire dallo stesso host (origin check).
- esiste un rate limit in memoria sugli endpoint pubblici di upload/ordine (best-effort).
- area admin disponibile solo sul dominio piattaforma; i domini personalizzati servono la vetrina cliente.
- retention automatica foto: cron giornaliero (`/api/cron/photo-retention`) che elimina file+order_items degli ordini `completed` oltre soglia (`PHOTO_RETENTION_DAYS`).

Procedura rapida:

```bash
cd C:/Users/targa/Downloads/zippoprinter
git push origin main
npm run deploy:prod:safe
```

Nota importante:

- eseguire i comandi dalla cartella `C:/Users/targa/Downloads/zippoprinter`
- usare sempre `npm run deploy:prod:safe`: lo script blocca automaticamente deploy su progetto/team errati e verifica alias finale `https://zippoprinter.vercel.app`
- per sola verifica target senza deploy: `npm run deploy:prod:check`

Migrazioni Supabase da avere allineate:

- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_multitenant_hardening.sql`
- `supabase/migrations/003_payment_modes_and_checkout.sql`
- `supabase/migrations/004_customer_profiles_and_order_names.sql`
- `supabase/migrations/005_order_exports_and_sftp_settings.sql`
- `supabase/migrations/006_public_studio_profile_links.sql`
- `supabase/migrations/007_logo_positioning_controls.sql`
- `supabase/migrations/008_print_format_quantity_pricing_and_csv.sql`
- `supabase/migrations/009_saas_multitenant_foundation_v2.sql`
- `supabase/migrations/010_platform_owner_dashboard_v1.sql`
- `supabase/migrations/011_domain_commerce_orders.sql`
- `supabase/migrations/012_owner_support_v2.sql`
- `supabase/migrations/013_storefront_branding_v1.sql`
- `supabase/migrations/014_relax_password_hash_for_supabase_auth.sql`
- `supabase/migrations/015_order_idempotency_key.sql`
- `supabase/migrations/016_billing_audit_and_subscription_self_service_v1.sql`

## Export ordini

Flusso operativo:

- Dal dettaglio ordine `/admin/orders/[id]` usa `Scarica ordine ZIP`.
- L'archivio viene preparato per formato e quantita copie in un unico file.

## CSV Formati

- Nuovo formato consigliato: colonna `discount_rules` con sintassi `quantita:tipo:valore`.
- Esempio: `30:percent:10|50:fixed:0.40`.
- Compatibilita legacy mantenuta: se `discount_rules` e vuota, viene letto `tier_prices`.

## Limiti attuali

- Il runbook di deploy base e presente, ma restano da consolidare i passaggi Stripe e le procedure operative complete.
- Pagina `setup` piu tecnica che di prodotto.
- Mancano asset visuali dedicati come logo e immagini branding.
- Il progetto ha ancora warning/errori lint fuori dal perimetro stretto del redesign UI.
- Non sono presenti test automatici UI o end-to-end.

## Documentazione AI-Ready

- indice docs: `docs/README.md`
- guida agenti: `docs/agents/CONTRIBUTING_AI.md`
