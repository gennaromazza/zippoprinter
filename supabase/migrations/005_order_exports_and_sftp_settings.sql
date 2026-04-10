-- =============================================
-- STAMPISS - Massive order exports and SFTP settings
-- =============================================

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS export_sftp_enabled BOOLEAN DEFAULT false;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS export_sftp_host TEXT;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS export_sftp_port INTEGER DEFAULT 22;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS export_sftp_username TEXT;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS export_sftp_remote_path TEXT;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS export_sftp_auth_type TEXT DEFAULT 'password'
  CHECK (export_sftp_auth_type IN ('password', 'private_key'));

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS export_sftp_password_encrypted TEXT;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS export_sftp_private_key_encrypted TEXT;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS export_links_expiry_minutes INTEGER DEFAULT 120;

CREATE TABLE IF NOT EXISTS order_exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  total_files INTEGER NOT NULL DEFAULT 0 CHECK (total_files >= 0),
  processed_files INTEGER NOT NULL DEFAULT 0 CHECK (processed_files >= 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_exports_photographer_status_idx
  ON order_exports (photographer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS order_exports_order_idx
  ON order_exports (order_id, created_at DESC);

ALTER TABLE order_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photographers can view own exports" ON order_exports
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = order_exports.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Photographers can create own exports" ON order_exports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = order_exports.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Photographers can update own exports" ON order_exports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = order_exports.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = order_exports.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION claim_order_export_job()
RETURNS order_exports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id UUID;
  claimed_job order_exports;
BEGIN
  SELECT id
  INTO target_id
  FROM order_exports
  WHERE
    status = 'pending'
    OR (
      status = 'running'
      AND updated_at < NOW() - INTERVAL '10 minutes'
    )
  ORDER BY
    CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
    created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF target_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE order_exports
  SET
    status = 'running',
    started_at = COALESCE(started_at, NOW()),
    updated_at = NOW(),
    attempt_count = attempt_count + 1
  WHERE id = target_id
  RETURNING *
  INTO claimed_job;

  RETURN claimed_job;
END;
$$;

REVOKE ALL ON FUNCTION claim_order_export_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_order_export_job() FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_order_export_job() TO service_role;
