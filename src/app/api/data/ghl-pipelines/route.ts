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

async function fetchGhlPipelines(locationId: string, token: string): Promise<GhlPipeline[] | null> {
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
    if (!res.ok) return null;
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
    return pipelines;
  } catch {
    return null;
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
    if (!locationId) return NextResponse.json({ pipelines: [], fuente: "sin_location" });

    const tokens: string[] = [];
    if (cuenta?.token_ghl?.trim()) tokens.push(cuenta.token_ghl);
    try {
      const oauthRows = await db.execute(
        sql`SELECT access_token FROM ghl_oauth_tokens WHERE id_cuenta = ${idCuenta} AND location_id NOT LIKE 'company:%' LIMIT 1`,
      );
      const oauthToken = (oauthRows.rows?.[0] as { access_token?: string } | undefined)?.access_token;
      if (oauthToken) tokens.push(oauthToken);
    } catch { /* tabla puede no existir en algún entorno */ }

    for (const token of tokens) {
      const pipelines = await fetchGhlPipelines(locationId, token);
      if (pipelines && pipelines.length > 0) {
        return NextResponse.json({ pipelines, fuente: "ghl" });
      }
    }

    return NextResponse.json({ pipelines: [], fuente: "vacio" });
  });
}
