/**
 * POST /webhooks/metricas/:locationId
 *
 * Webhook genérico para enviar cualquier métrica personalizada al sistema.
 * El cliente configura sus campos en el panel → obtiene la URL + campos esperados.
 *
 * Body: { [nombreCampo]: valor, ... } — todos los campos que el cliente quiera enviar
 *
 * Ejemplo:
 *   POST /webhooks/metricas/sharkrealtor
 *   Headers: x-api-key: lm_xxx
 *   Body: { "ventas_cerradas": 3, "facturacion_usd": 15000, "leads_fb": 45 }
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cuentas, apiKeysCuenta, metricasWebhook, type MetricaConfig } from "@/lib/db/schema";
import { eq, and, or, sql } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ locationId: string }> },
) {
  try {
    const { locationId } = await params;
    const apiKey = req.headers.get("x-api-key");

    if (!apiKey?.trim()) {
      return NextResponse.json({ error: "Header x-api-key requerido" }, { status: 401 });
    }

    const trimmedKey = apiKey.trim();
    const globalKey = process.env.METRICAS_GLOBAL_API_KEY;
    const isGlobalAuth = globalKey && trimmedKey === globalKey;

    const idCuentaNum = /^\d+$/.test(locationId) ? Number(locationId) : null;

    let cuentaRow: { id_cuenta: number; zona_horaria_iana: string | null; metricas_config: unknown } | undefined;

    const cuentaSelect = {
      id_cuenta: cuentas.id_cuenta,
      zona_horaria_iana: cuentas.zona_horaria_iana,
      metricas_config: cuentas.metricas_config,
    };

    const cuentaWhere = or(
      ...(idCuentaNum !== null ? [eq(cuentas.id_cuenta, idCuentaNum)] : []),
      eq(cuentas.locationid, locationId),
      eq(cuentas.subdominio, locationId),
      eq(cuentas.subdominio, locationId.includes(".") ? locationId : `${locationId}.leadmaster.com.co`),
    )!;

    if (isGlobalAuth) {
      [cuentaRow] = await db
        .select(cuentaSelect)
        .from(cuentas)
        .where(cuentaWhere)
        .limit(1);

      if (!cuentaRow) {
        return NextResponse.json({ error: "location_id no corresponde a ninguna cuenta" }, { status: 404 });
      }
    } else {
      const [keyRow] = await db
        .select({ id_cuenta: apiKeysCuenta.id_cuenta })
        .from(apiKeysCuenta)
        .where(and(eq(apiKeysCuenta.token, trimmedKey), eq(apiKeysCuenta.activa, true)))
        .limit(1);

      if (!keyRow) {
        return NextResponse.json({ error: "API Key inválida o inactiva" }, { status: 401 });
      }

      [cuentaRow] = await db
        .select(cuentaSelect)
        .from(cuentas)
        .where(cuentaWhere)
        .limit(1);

      if (!cuentaRow || cuentaRow.id_cuenta !== keyRow.id_cuenta) {
        return NextResponse.json({ error: "Cuenta no encontrada o API Key no corresponde" }, { status: 404 });
      }
    }

    const configuredCampos = new Set<string>();
    const configs = cuentaRow.metricas_config as MetricaConfig[] | null;
    if (Array.isArray(configs)) {
      for (const m of configs) {
        if (m.webhookCampo) configuredCampos.add(m.webhookCampo);
      }
    }

    const body = await req.json() as Record<string, unknown>;

    // ── Atribución: extraer userId / customerId si vienen en el body ──────────
    // Campos reservados (no se guardan como métricas):
    //   userId      → ID del asesor/closer en GHL
    //   customerId  → ID del contacto/cliente en GHL
    const ghlUserId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : null;
    const ghlCustomerId = typeof body.customerId === "string" && body.customerId.trim() ? body.customerId.trim() : null;
    delete body.userId;
    delete body.customerId;

    // ── Fecha ────────────────────────────────────────────────────────────────
    // Aceptar fecha ("2026-04-08") o datetime con timezone ("2026-04-08T14:30:00-05:00")
    const fechaRaw = body.fecha as string | undefined;
    let fecha: string;
    if (fechaRaw) {
      if (fechaRaw.includes("T") || fechaRaw.includes(" ")) {
        const d = new Date(fechaRaw);
        fecha = isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
      } else {
        fecha = fechaRaw.slice(0, 10);
      }
    } else {
      const tz = cuentaRow.zona_horaria_iana ?? "UTC";
      try {
        fecha = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
      } catch {
        fecha = new Date().toISOString().slice(0, 10); // fallback UTC si el IANA es inválido
      }
    }
    delete body.fecha;

    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: "Body vacío — envía al menos un campo numérico" }, { status: 400 });
    }

    const idCuenta = cuentaRow.id_cuenta;
    let inserted = 0;
    const campos_guardados: string[] = [];
    const campos_no_configurados: string[] = [];
    const hasConfig = configuredCampos.size > 0;

    for (const [campo, valor] of Object.entries(body)) {
      const num = Number(valor);
      if (isNaN(num) || typeof valor === "object") continue;

      // Si la cuenta tiene campos configurados, solo persistir los que están en la config
      if (hasConfig && !configuredCampos.has(campo)) {
        campos_no_configurados.push(campo);
        continue;
      }

      if (ghlUserId !== null || ghlCustomerId !== null) {
        await db.execute(sql`
          INSERT INTO metricas_webhook (id_cuenta, fecha, campo, valor, ghl_user_id, ghl_customer_id, updated_at)
          VALUES (${idCuenta}, ${fecha}, ${campo}, ${String(num)}, ${ghlUserId}, ${ghlCustomerId}, NOW())
          ON CONFLICT (id_cuenta, fecha, campo, ghl_user_id) DO UPDATE
          SET valor = metricas_webhook.valor + ${String(num)},
              ghl_customer_id = EXCLUDED.ghl_customer_id,
              updated_at = NOW()
        `);
        await db.execute(sql`
          INSERT INTO metricas_webhook (id_cuenta, fecha, campo, valor, ghl_user_id, updated_at)
          VALUES (${idCuenta}, ${fecha}, ${campo}, ${String(num)}, NULL, NOW())
          ON CONFLICT (id_cuenta, fecha, campo) WHERE ghl_user_id IS NULL DO UPDATE
          SET valor = metricas_webhook.valor + ${String(num)},
              updated_at = NOW()
        `);
      } else {
        await db.execute(sql`
          INSERT INTO metricas_webhook (id_cuenta, fecha, campo, valor, ghl_user_id, updated_at)
          VALUES (${idCuenta}, ${fecha}, ${campo}, ${String(num)}, NULL, NOW())
          ON CONFLICT (id_cuenta, fecha, campo) WHERE ghl_user_id IS NULL DO UPDATE
          SET valor = ${String(num)},
              updated_at = NOW()
        `);
      }

      campos_guardados.push(campo);
      inserted++;
    }

    const warnings: string[] = [];
    if (campos_no_configurados.length > 0) {
      warnings.push(
        `Los siguientes campos fueron ignorados porque NO están configurados como métricas: ${campos_no_configurados.join(", ")}. Configúralos en el panel de métricas custom para que se guarden.`,
      );
    }
    if (hasConfig && campos_guardados.length === 0 && campos_no_configurados.length > 0) {
      warnings.push(
        `Campos configurados en esta cuenta: ${[...configuredCampos].join(", ")}. Ninguno de los campos enviados coincide.`,
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Se guardaron ${inserted} campo(s) para ${fecha}`,
      campos_guardados,
      campos_no_configurados,
      fecha,
      atribuido_a: ghlUserId ? { userId: ghlUserId, customerId: ghlCustomerId } : null,
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(configuredCampos.size > 0 ? { campos_esperados: [...configuredCampos] } : {}),
    });
  } catch (err) {
    console.error("[webhooks/metricas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
