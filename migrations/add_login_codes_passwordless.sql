-- Login sin contraseña: códigos de verificación de un solo uso enviados por email.
-- (Los cambios de usuarios_dashboard — pass opcional, ghl_user_id, origen, activo —
--  van en cerebro-tracker-v6-saas/migrations/061_usuarios_ghl_sync.sql)

CREATE TABLE IF NOT EXISTS login_codes (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_codes_email_created
  ON login_codes (email, created_at DESC);
