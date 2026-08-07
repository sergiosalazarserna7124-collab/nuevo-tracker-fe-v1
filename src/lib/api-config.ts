/**
 * URL del Cerebro (Cloud Run) — solo server-side, nunca expuesta al cliente.
 * Usada internamente para quick-triggers, huérfanos, fathom, etc.
 */
export const API_BASE_URL =
  process.env.CEREBRO_INTERNAL_URL ??
  process.env.CEREBRO_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://tracker-v1-mhx6.onrender.com";

/**
 * URL pública del proxy de webhooks — la que se muestra a clientes en docs.
 * Apunta a leadmaster.com.co/webhooks/proxy/* que forwarde internamente al Cerebro.
 */
export const WEBHOOK_PROXY_URL = `${
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.AUTH_URL ??
  "https://leadmaster.com.co"
}/webhooks/proxy`;
