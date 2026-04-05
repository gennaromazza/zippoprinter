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
  branding studio e gestione formati di stampa.
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
- `ENABLE_LEGACY_STRIPE_FALLBACK` (`true` durante migrazione Connect, poi `false`)
- `VERCEL_API_TOKEN` per gestione custom domain BYOD
- `VERCEL_PROJECT_ID` project id Vercel del deployment
- `VERCEL_TEAM_ID` (opzionale, se progetto in team)
- `VERCEL_DOMAINS_CNAME_TARGET` (opzionale, default `cname.vercel-dns.com`)

Nota Stripe:
- per idempotenza webhook, creare una tabella `stripe_events` con `event_id` univoco (opzionale ma consigliato).
- per foundation SaaS v2, usare `billing_events` come log/idempotenza webhook.

Nota sicurezza:
- per protezione CSRF sulle Server Actions, le richieste devono provenire dallo stesso host (origin check).
- esiste un rate limit in memoria sugli endpoint pubblici di upload/ordine (best-effort).

Procedura rapida:

```bash
cd D:/ZippoProject/zippoprinter
git push origin main
npm run lint
npm run build
vercel deploy --prod --yes
```

Nota importante:

- eseguire i comandi dalla cartella `D:/ZippoProject/zippoprinter`
- non usare la cartella parent `D:/ZippoProject`, altrimenti Vercel puo deployare un root errato e restituire `404`

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

## Export ordini

Flusso operativo:

- Dal dettaglio ordine `/admin/orders/[id]` usa `Scarica ordine ZIP`.
- L'archivio viene preparato per formato e quantita copie in un unico file.

## Limiti attuali

- Il runbook di deploy base e presente, ma restano da consolidare i passaggi Stripe e le procedure operative complete.
- Pagina `setup` piu tecnica che di prodotto.
- Mancano asset visuali dedicati come logo e immagini branding.
- Il progetto ha ancora warning/errori lint fuori dal perimetro stretto del redesign UI.
- Non sono presenti test automatici UI o end-to-end.

## Documentazione AI-Ready

- indice docs: `docs/README.md`
- guida agenti: `docs/agents/CONTRIBUTING_AI.md`
