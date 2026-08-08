/**
 * GET /api/data/ghl-campos
 * Custom fields de contacto de GHL de la cuenta, para las acciones de reglas
 * "Escribir en un campo de GHL" y "Llenar campo de GHL con IA" (elegir el campo
 * de una lista en vez de escribir el key a mano).
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { cuentas } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

interface GhlCampo { id: string; name: string; key: string; dataType: string }

type FetchResult =
  | { ok: true; campos: GhlCampo[] }
  | { ok: false; status: number; motivo: string };

async function fetchGhlCampos(locationId: string, token: string): Promise<FetchResult> {
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/locations/${locationId}/customFields?model=contact`,
      {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[ghl-campos] GHL ${res.status}: ${text.slice(0, 300)}`);
      const motivo = res.status === 401 || res.status === 403
        ? "El token de GHL no tiene permiso para leer custom fields (scope locations/customFields). Reinstala/actualiza la app con ese permiso."
        : `GHL respondió ${res.status}`;
      return { ok: false, status: res.status, motivo };
    }
    const data = (await res.json()) as {
      customFields?: Array<{ id?: string; name?: string; fieldKey?: string; dataType?: string; model?: string }>;
    };
    const campos = (data.customFields ?? [])
      .filter((f) => !f.model || f.model === "contact")
      .map((f) => ({
        id: f.id ?? "",
        name: f.name?.trim() ?? "",
        key: (f.fieldKey ?? "").trim(),
        dataType: f.dataType ?? "TEXT",
      }))
      .filter((f) => f.key && f.name);
    return { ok: true, campos };
  } catch (err) {
    console.warn(`[ghl-campos] error de red:`, err);
    return { ok: false, status: 0, motivo: "Error de red llamando a GHL" };
  }
}

export async function GET(req: Request) {
  return withAuth(req, async (idCuenta) => {
    const [cuenta] = await db
      .select({ locationid: cuentas.locationid, token_ghl: cuentas.token_ghl })
      .from(cuentas)
      .where(eq(cuentas.id_cuenta, idCuenta))
      .limit(1);

    const locationId = cuenta?.locationid?.trim();
    if (!locationId) return NextResponse.json({ campos: [], fuente: "sin_location", motivo: "La cuenta no tiene locationId de GHL." });

    const tokens: string[] = [];
    if (cuenta?.token_ghl?.trim()) tokens.push(cuenta.token_ghl);
    try {
      const oauthRows = await db.execute(
        sql`SELECT access_token FROM ghl_oauth_tokens WHERE id_cuenta = ${idCuenta} AND location_id NOT LIKE 'company:%' LIMIT 1`,
      );
      const oauthToken = (oauthRows.rows?.[0] as { access_token?: string } | undefined)?.access_token;
      if (oauthToken) tokens.push(oauthToken);
    } catch { /* tabla puede no existir en algún entorno */ }

    if (tokens.length === 0) return NextResponse.json({ campos: [], fuente: "sin_token", motivo: "La cuenta no tiene token de GHL configurado." });

    let ultimoMotivo = "No se encontraron campos personalizados en GHL.";
    for (const token of tokens) {
      const res = await fetchGhlCampos(locationId, token);
      if (res.ok && res.campos.length > 0) {
        return NextResponse.json({ campos: res.campos, fuente: "ghl" });
      }
      if (!res.ok) ultimoMotivo = res.motivo;
    }

    return NextResponse.json({ campos: [], fuente: "vacio", motivo: ultimoMotivo });
  });
}
