-- =============================================
-- STAMPISS - Multi-tenant hardening
-- =============================================

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS photographers_auth_user_id_unique
  ON photographers(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

UPDATE photographers AS p
SET auth_user_id = u.id
FROM auth.users AS u
WHERE p.auth_user_id IS NULL
  AND lower(p.email) = lower(u.email);

DROP POLICY IF EXISTS "Photographers can view own data" ON photographers;
DROP POLICY IF EXISTS "Photographers can update own data" ON photographers;
DROP POLICY IF EXISTS "Anyone can view active print formats" ON print_formats;
DROP POLICY IF EXISTS "Photographers can manage own formats" ON print_formats;
DROP POLICY IF EXISTS "Anyone can create customers" ON customers;
DROP POLICY IF EXISTS "Customers can view own data" ON customers;
DROP POLICY IF EXISTS "Anyone can create orders" ON orders;
DROP POLICY IF EXISTS "Anyone can view own orders" ON orders;
DROP POLICY IF EXISTS "Photographers can manage own orders" ON orders;
DROP POLICY IF EXISTS "Anyone can create order items" ON order_items;
DROP POLICY IF EXISTS "Photographers can manage own order items" ON order_items;

CREATE POLICY "Photographers can view linked profile" ON photographers
  FOR SELECT USING (auth.uid() = auth_user_id);

CREATE POLICY "Photographers can update linked profile" ON photographers
  FOR UPDATE USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

CREATE POLICY "Public can view active print formats" ON print_formats
  FOR SELECT USING (is_active = true);

CREATE POLICY "Photographers can insert own print formats" ON print_formats
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = print_formats.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Photographers can update own print formats" ON print_formats
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = print_formats.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = print_formats.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Photographers can delete own print formats" ON print_formats
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = print_formats.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can create customers" ON customers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can create orders" ON orders
  FOR INSERT WITH CHECK (photographer_id IS NOT NULL);

CREATE POLICY "Photographers can view own orders" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = orders.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Photographers can update own orders" ON orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = orders.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = orders.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can create order items" ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM orders
      WHERE orders.id = order_items.order_id
    )
  );

CREATE POLICY "Photographers can view own order items" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM orders
      JOIN photographers ON photographers.id = orders.photographer_id
      WHERE orders.id = order_items.order_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Photographers can update own order items" ON order_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM orders
      JOIN photographers ON photographers.id = orders.photographer_id
      WHERE orders.id = order_items.order_id
        AND photographers.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM orders
      JOIN photographers ON photographers.id = orders.photographer_id
      WHERE orders.id = order_items.order_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Photographers can delete own order items" ON order_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM orders
      JOIN photographers ON photographers.id = orders.photographer_id
      WHERE orders.id = order_items.order_id
        AND photographers.auth_user_id = auth.uid()
    )
  );
