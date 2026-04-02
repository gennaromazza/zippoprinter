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

## Limiti attuali

- `README` e setup operativo ancora essenziali, non ancora completi per deployment.
- Pagina `setup` piu tecnica che di prodotto.
- Mancano asset visuali dedicati come logo e immagini branding.
- Il progetto ha ancora warning/errori lint fuori dal perimetro stretto del redesign UI.
- Non sono presenti test automatici UI o end-to-end.
