# Guida Setup ZippoPrinter - Database

## Passaggio 1: Esegui la migrazione su Supabase

1. Vai su https://supabase.com/dashboard
2. Seleziona il progetto `udmuznihzmotikybexae`
3. Vai su **SQL Editor** nel menu laterale
4. Clicca su **New Query**
5. Copia e incolla il contenuto del file `supabase/migrations/001_initial_schema.sql`
6. Clicca **Run** (o premi Ctrl+Enter)

## Passaggio 2: Crea l'utente Admin in Supabase Auth

Dopo aver eseguito la migrazione, esegui questa query SQL per creare l'utente amministratore:

```sql
-- Crea l'utente in Supabase Auth (usa una password sicura!)
INSERT INTO auth.users (instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change_token_new, aud)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'admin@studiofotograficozippoprinter.com',
  crypt('TuaPasswordSicura123!', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  NOW(),
  NOW(),
  '',
  '',
  'authenticated'
);

-- Associa l'utente Auth al fotografo
-- Prima trova l'ID del fotografo
DO $$
DECLARE
  photographer_uuid UUID;
  auth_uuid UUID;
BEGIN
  SELECT id INTO photographer_uuid FROM photographers WHERE email = 'admin@studiofotograficozippoprinter.com';
  SELECT id INTO auth_uuid FROM auth.users WHERE email = 'admin@studiofotograficozippoprinter.com';
  
  RAISE NOTICE 'Photographer ID: %', photographer_uuid;
  RAISE NOTICE 'Auth User ID: %', auth_uuid;
END $$;
```

## Passaggio 3: Crea il Bucket Storage

1. Vai su **Storage** nel menu laterale di Supabase
2. Clicca su **New Bucket**
3. Nome: `photos`
4. Public bucket: **NO** (le foto sono private)
5. Clicca **Create bucket**

## Passaggio 4: Configura le Policy Storage

Esegui questa query SQL per permettere l'accesso alle foto:

```sql
-- Policy per upload foto (chiunque può caricare per un ordine)
CREATE POLICY "Anyone can upload photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'photos');

-- Policy per leggere foto (solo chi ha il signed URL)
CREATE POLICY "Anyone can view photos with signed URL" ON storage.objects
  FOR SELECT USING (bucket_id = 'photos');

-- Policy per eliminare foto (admin/fotografo)
CREATE POLICY "Admin can delete photos" ON storage.objects
  FOR DELETE USING (bucket_id = 'photos');
```

## Credenziali di Accesso

- **Email**: admin@studiofotograficozippoprinter.com
- **Password**: La password che hai impostato nel Passaggio 2

## Verifica Setup

Dopo aver completato tutti i passaggi, visita:
`https://studiofotograficozippoprinter.com/api/diagnostic`

Dovresti vedere:
- `connection`: "ok"
- `tables.*.exists`: true per tutte
- `storage.exists`: true
- `auth.configured`: true
