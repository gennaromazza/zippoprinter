-- =============================================
-- STAMPISS - Customer profiles and separate order names
-- =============================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS photographer_id UUID REFERENCES photographers(id) ON DELETE CASCADE;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS first_name TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS last_name TEXT;

UPDATE customers
SET first_name = COALESCE(first_name, name)
WHERE name IS NOT NULL
  AND first_name IS NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_first_name TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_last_name TEXT;

UPDATE orders
SET customer_first_name = COALESCE(customer_first_name, customer_name)
WHERE customer_name IS NOT NULL
  AND customer_first_name IS NULL;

UPDATE customers AS c
SET photographer_id = o.photographer_id
FROM orders AS o
WHERE o.customer_id = c.id
  AND c.photographer_id IS NULL
  AND o.photographer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_photographer_email_unique
  ON customers (photographer_id, lower(email))
  WHERE photographer_id IS NOT NULL;

DROP POLICY IF EXISTS "Anyone can create customers" ON customers;

CREATE POLICY "Anyone can create customers" ON customers
  FOR INSERT WITH CHECK (photographer_id IS NOT NULL);

CREATE POLICY "Photographers can view own customers" ON customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = customers.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Photographers can update own customers" ON customers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = customers.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = customers.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );
