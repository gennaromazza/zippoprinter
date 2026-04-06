-- =============================================
-- Migration 014: Relax password_hash NOT NULL constraint
-- =============================================
-- Auth is now handled exclusively by Supabase Auth (auth_user_id).
-- The password_hash column is a legacy artifact from the pre-Supabase-Auth
-- era and should not block new photographer provisioning.

ALTER TABLE photographers
  ALTER COLUMN password_hash DROP NOT NULL,
  ALTER COLUMN password_hash SET DEFAULT NULL;
