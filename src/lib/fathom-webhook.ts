/**
 * Registra un webhook en Fathom apuntando al Cerebro: POST /webhooks/fathom/:idCuenta
 */
import { API_BASE_URL } from "@/lib/api-config";

export type RegistrarWebhookFathomResult =
  | { ok: true; webhookId: string }
  | { ok: false; error: string };

/**
 * Base pública del webhook de Fathom. Por defecto el backend directo (que
 * acepta POST y funciona). Para CAMUFLAR el host interno (tracker-v1/onrender)
 * sin tocar código: agregá un custom domain en Render apuntando al backend
 * (ej: hooks.leadmaster.com.co → tracker-v1-mhx6.onrender.com) y seteá la env
 * NEXT_PUBLIC_FATHOM_WEBHOOK_BASE=https://hooks.leadmaster.com.co
 * (Ojo: NO usar leadmaster.com.co pelado — ese host no procesa POST → 405.)
 */
const FATHOM_WEBHOOK_BASE = process.env.NEXT_PUBLIC_FATHOM_WEBHOOK_BASE ?? API_BASE_URL;

export function getFathomDestinationUrl(idCuenta: number): string {
  const base = FATHOM_WEBHOOK_BASE.replace(/\/$/, "");
  return `${base}/webhooks/fathom/${idCuenta}`;
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
