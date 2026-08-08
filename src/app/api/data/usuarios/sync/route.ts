/**
 * POST /api/data/usuarios/sync
 * Dispara el sync de usuarios GHL → usuarios_dashboard de la cuenta actual
 * llamando al endpoint de cron del Cerebro. Se usa al abrir la sección de
 * usuarios en Configuración para que la lista siempre refleje GHL.
 *
 * Requiere en el entorno: CEREBRO_CRON_SECRET (o CRON_SECRET) y la base del
 * Cerebro en NEXT_PUBLIC_API_BASE_URL / API_BASE_URL.
 */
import { NextResponse } from "next/server";
import { withAuthAndPermission } from "@/lib/api-auth";
import { API_BASE_URL } from "@/lib/api-config";

export async function POST(req: Request) {
  return withAuthAndPermission(req, "gestionar_usuarios", async (idCuenta) => {
    const secret = process.env.CEREBRO_CRON_SECRET ?? process.env.CRON_SECRET;
    if (!secret || !API_BASE_URL) {
      return NextResponse.json(
        { ok: false, skipped: true, reason: "sync no configurado" },
        { status: 200 },
      );
    }

    try {
      const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/cron/sync-ghl-users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret,
        },
        body: JSON.stringify({ id_cuenta: idCuenta }),
        signal: AbortSignal.timeout(25_000),
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: res.ok, ...data }, { status: 200 });
    } catch (err) {
      console.error("[usuarios/sync] Error llamando al Cerebro:", err);
      return NextResponse.json({ ok: false, error: "sync no disponible" }, { status: 200 });
    }
  });
}
