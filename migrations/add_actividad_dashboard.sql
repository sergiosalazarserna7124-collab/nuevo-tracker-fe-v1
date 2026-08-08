-- Registro de actividad del dashboard: páginas visitadas y clics por usuario.
-- Complementa accesos_dashboard (logins).

CREATE TABLE IF NOT EXISTS actividad_dashboard (
  id         SERIAL PRIMARY KEY,
  id_cuenta  INTEGER,
  email      TEXT NOT NULL,
  tipo       TEXT NOT NULL,          -- 'page_view' | 'click'
  pagina     TEXT,                   -- pathname donde ocurrió
  detalle    TEXT,                   -- texto del botón/link clickeado
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actividad_dashboard_cuenta_fecha
  ON actividad_dashboard (id_cuenta, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_actividad_dashboard_email_fecha
  ON actividad_dashboard (email, created_at DESC);
