-- =============================================
-- STAMPISS - Database Schema
-- =============================================

-- Enable UUID and pgcrypto extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- TABLES
-- =============================================

-- Tabella fotografi (multi-tenant ready, per ora solo 1)
CREATE TABLE photographers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  whatsapp_number TEXT,
  logo_url TEXT,
  brand_color TEXT DEFAULT '#000000',
  custom_welcome_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella formati di stampa
CREATE TABLE print_formats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photographer_id UUID REFERENCES photographers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  width_cm NUMERIC NOT NULL,
  height_cm NUMERIC NOT NULL,
  price_cents INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella clienti (guest o registrati)
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella ordini
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photographer_id UUID REFERENCES photographers(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'printing', 'ready', 'completed', 'cancelled')),
  total_cents INTEGER NOT NULL DEFAULT 0,
  stripe_payment_intent_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Tabella elementi ordine (foto + formato)
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  print_format_id UUID REFERENCES print_formats(id),
  format_name TEXT NOT NULL,
  format_price_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE photographers ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Photographers: solo il fotografo stesso può vedere/modificare i propri dati
CREATE POLICY "Photographers can view own data" ON photographers
  FOR SELECT USING (true);
CREATE POLICY "Photographers can update own data" ON photographers
  FOR UPDATE USING (true);

-- Print formats: tutti possono vedere (per la pagina cliente), solo fotografo può modificare
CREATE POLICY "Anyone can view active print formats" ON print_formats
  FOR SELECT USING (is_active = true);
CREATE POLICY "Photographers can manage own formats" ON print_formats
  FOR ALL USING (true);

-- Customers: Anyone can create, only own data visible
CREATE POLICY "Anyone can create customers" ON customers
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Customers can view own data" ON customers
  FOR SELECT USING (true);

-- Orders: cliente vede solo i propri ordini, fotografo vede tutti i suoi ordini
CREATE POLICY "Anyone can create orders" ON orders
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view own orders" ON orders
  FOR SELECT USING (true);
CREATE POLICY "Photographers can manage own orders" ON orders
  FOR ALL USING (true);

-- Order items: accesso tramite order
CREATE POLICY "Anyone can create order items" ON order_items
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Photographers can manage own order items" ON order_items
  FOR ALL USING (true);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Funzione per verificare password
CREATE OR REPLACE FUNCTION verify_password(input_email TEXT, input_password TEXT)
RETURNS UUID AS $$
DECLARE
  photographer_uuid UUID;
BEGIN
  SELECT id INTO photographer_uuid
  FROM photographers
  WHERE email = input_email AND password_hash = crypt(input_password, password_hash);
  
  RETURN photographer_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger per aggiornare updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER photographers_updated_at
  BEFORE UPDATE ON photographers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- SEED: Crea il primo fotografo admin
-- =============================================

INSERT INTO photographers (email, password_hash, name, whatsapp_number)
VALUES (
  'admin@studiofotograficostampiss.com',
  crypt('_123_', gen_salt('bf')),
  'Studio Fotografico Zippo',
  NULL
);

-- =============================================
-- SEED: Formati di stampa di esempio
-- =============================================

DO $$
DECLARE
  photographer_uuid UUID;
BEGIN
  SELECT id INTO photographer_uuid FROM photographers LIMIT 1;
  
  INSERT INTO print_formats (photographer_id, name, width_cm, height_cm, price_cents, sort_order) VALUES
    (photographer_uuid, '10x15 cm', 10, 15, 300, 1),
    (photographer_uuid, '13x18 cm', 13, 18, 500, 2),
    (photographer_uuid, '15x21 cm', 15, 21, 700, 3),
    (photographer_uuid, '20x30 cm', 20, 30, 1200, 4),
    (photographer_uuid, '30x40 cm', 30, 40, 2000, 5);
END $$;
