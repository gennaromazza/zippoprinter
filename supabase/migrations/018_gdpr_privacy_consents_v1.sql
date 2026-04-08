-- =============================================
-- ZIPPOPRINTER - GDPR privacy consents v1
-- =============================================

CREATE TABLE IF NOT EXISTS privacy_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL
    CHECK (source IN ('cookie_banner', 'signup', 'public_order', 'settings')),
  consent_key TEXT NOT NULL
    CHECK (consent_key IN ('cookie_preferences', 'privacy_notice', 'terms_of_service', 'marketing_emails')),
  consent_version TEXT NOT NULL,
  consent_granted BOOLEAN NOT NULL,
  decision TEXT
    CHECK (decision IS NULL OR decision IN ('accept_all', 'reject_optional', 'custom', 'acknowledged')),
  subject_type TEXT NOT NULL
    CHECK (subject_type IN ('anonymous_visitor', 'studio_user', 'customer')),
  subject_identifier TEXT,
  tenant_id UUID REFERENCES photographers(id) ON DELETE SET NULL,
  request_origin TEXT,
  request_ip TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS privacy_consents_occurred_idx
  ON privacy_consents (occurred_at DESC);

CREATE INDEX IF NOT EXISTS privacy_consents_tenant_idx
  ON privacy_consents (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS privacy_consents_key_idx
  ON privacy_consents (consent_key, occurred_at DESC);

CREATE INDEX IF NOT EXISTS privacy_consents_subject_idx
  ON privacy_consents (subject_type, subject_identifier);

ALTER TABLE privacy_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read privacy consents" ON privacy_consents;
CREATE POLICY "Platform admins can read privacy consents" ON privacy_consents
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM platform_admins pa
      WHERE pa.auth_user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS "Photographers can read own privacy consents" ON privacy_consents;
CREATE POLICY "Photographers can read own privacy consents" ON privacy_consents
  FOR SELECT USING (
    tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM photographers p
      WHERE p.id = privacy_consents.tenant_id
        AND p.auth_user_id = auth.uid()
    )
  );

-- No UPDATE / DELETE policies: append-only for application users.
