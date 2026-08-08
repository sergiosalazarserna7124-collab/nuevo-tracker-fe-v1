/**
 * GET /api/data/ghl-pipelines
 * Lista de pipelines (con sus etapas) de GHL de la cuenta, para la acción
 * "Actualizar pipeline" de las reglas de etiquetas.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { cuentas } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

interface GhlPipeline {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string }>;
}

type FetchResult =
  | { ok: true; pipelines: GhlPipeline[] }
  | { ok: false; status: number; motivo: string };

async function fetchGhlPipelines(locationId: string, token: string): Promise<FetchResult> {
  try {
    const url = new URL("https://services.leadconnectorhq.com/opportunities/pipelines");
    url.searchParams.set("locationId", locationId);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[ghl-pipelines] GHL ${res.status}: ${text.slice(0, 300)}`);
      const motivo = res.status === 401 || res.status === 403
        ? "El token de GHL no tiene permiso para leer pipelines (scope opportunities). Reinstala/actualiza la app con ese permiso."
        : `GHL respondió ${res.status}`;
      return { ok: false, status: res.status, motivo };
    }
    const data = (await res.json()) as {
      pipelines?: Array<{ id?: string; name?: string; stages?: Array<{ id?: string; name?: string }> }>;
    };
    const pipelines = (data.pipelines ?? [])
      .map((p) => ({
        id: p.id ?? "",
        name: p.name?.trim() ?? "",
        stages: (p.stages ?? [])
          .map((s) => ({ id: s.id ?? "", name: s.name?.trim() ?? "" }))
          .filter((s) => s.id && s.name),
      }))
      .filter((p) => p.id && p.name);
    return { ok: true, pipelines };
  } catch (err) {
    console.warn(`[ghl-pipelines] error de red:`, err);
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
    if (!locationId) return NextResponse.json({ pipelines: [], fuente: "sin_location", motivo: "La cuenta no tiene locationId de GHL." });

    // OAuth primero (token de la app, se auto-refresca en el backend); el PIT
    // (token_ghl) queda solo como último recurso.
    const tokens: string[] = [];
    try {
      const oauthRows = await db.execute(
        sql`SELECT access_token FROM ghl_oauth_tokens WHERE id_cuenta = ${idCuenta} AND location_id NOT LIKE 'company:%' LIMIT 1`,
      );
      const oauthToken = (oauthRows.rows?.[0] as { access_token?: string } | undefined)?.access_token;
      if (oauthToken) tokens.push(oauthToken);
    } catch { /* tabla puede no existir en algún entorno */ }
    if (cuenta?.token_ghl?.trim()) tokens.push(cuenta.token_ghl);

    if (tokens.length === 0) return NextResponse.json({ pipelines: [], fuente: "sin_token", motivo: "La cuenta no tiene token de GHL configurado." });

    let ultimoMotivo = "No se encontraron pipelines en GHL.";
    for (const token of tokens) {
      const res = await fetchGhlPipelines(locationId, token);
      if (res.ok && res.pipelines.length > 0) {
        return NextResponse.json({ pipelines: res.pipelines, fuente: "ghl" });
      }
      if (!res.ok) ultimoMotivo = res.motivo;
    }

    return NextResponse.json({ pipelines: [], fuente: "vacio", motivo: ultimoMotivo });
  });
}
