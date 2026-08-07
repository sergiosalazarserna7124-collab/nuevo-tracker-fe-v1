/**
 * Registra un webhook en Fathom apuntando al Cerebro: POST /webhooks/fathom/:idCuenta
 */
import { WEBHOOK_PROXY_URL } from "@/lib/api-config";

export type RegistrarWebhookFathomResult =
  | { ok: true; webhookId: string }
  | { ok: false; error: string };

/**
 * URL que se registra en Fathom. Usa el proxy público (leadmaster.com.co/
 * webhooks/proxy/...) en vez del Cerebro directo, para que NO se exponga el
 * host interno (tracker-v1 / onrender). El proxy reenvía a /webhooks/fathom/:id.
 * Siempre incluye el id_cuenta para enrutar al tenant correcto.
 */
export function getFathomDestinationUrl(idCuenta: number): string {
  const base = WEBHOOK_PROXY_URL.replace(/\/$/, "");
  return `${base}/fathom/${idCuenta}`;
}

export async function registrarWebhookFathom(
  apiKey: string,
  idCuenta: number,
): Promise<RegistrarWebhookFathomResult> {
  const destination_url = getFathomDestinationUrl(idCuenta);
  try {
    const res = await fetch("https://api.fathom.ai/external/v1/webhooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey.trim(),
      },
      body: JSON.stringify({
        destination_url,
        triggered_for: ["my_recordings"],
        include_transcript: true,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `Fathom ${res.status}: ${text.slice(0, 280)}${text.length > 280 ? "…" : ""}`,
      };
    }
    let data: { id?: string | number };
    try {
      data = JSON.parse(text) as { id?: string | number };
    } catch {
      return { ok: false, error: "Respuesta de Fathom no es JSON válido" };
    }
    const id = data.id != null ? String(data.id) : "";
    if (!id) {
      return { ok: false, error: "Fathom no devolvió id del webhook en la respuesta" };
    }
    return { ok: true, webhookId: id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red";
    return { ok: false, error: msg };
  }
}
