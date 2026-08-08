/**
 * GET /api/data/ghl-etiquetas
 * Lista de etiquetas de GHL de la cuenta, para los selectores de categorías
 * (evita escribir etiquetas a mano y cometer typos).
 *
 * 1) Intenta la API de GHL (locations/:id/tags) con el token de la cuenta y
 *    con el token OAuth de la app del marketplace.
 * 2) Fallback: etiquetas vistas en los datos ya sincronizados (agendas).
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { cuentas, resumenesDiariosAgendas } from "@/lib/db/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";

async function fetchGhlTags(locationId: string, token: string): Promise<string[] | null> {
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/locations/${locationId}/tags`,
      {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { tags?: Array<{ name?: string }> };
    const names = (data.tags ?? [])
      .map((t) => t.name?.trim())
      .filter((n): n is string => Boolean(n));
    return names.length > 0 ? names : null;
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

    // 1) API de GHL — token de la cuenta y token OAuth del marketplace
    if (locationId) {
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
        const tags = await fetchGhlTags(locationId, token);
        if (tags) {
          return NextResponse.json({
            etiquetas: [...new Set(tags.map((t) => t.toLowerCase()))].sort(),
            fuente: "ghl",
          });
        }
      }
    }

    // 2) Fallback: etiquetas vistas en agendas sincronizadas
    const rows = await db
      .select({ tags: resumenesDiariosAgendas.tags })
      .from(resumenesDiariosAgendas)
      .where(and(eq(resumenesDiariosAgendas.id_cuenta, idCuenta), isNotNull(resumenesDiariosAgendas.tags)))
      .limit(2000);

    const set = new Set<string>();
    for (const r of rows) {
      for (const t of (r.tags ?? "").split(",")) {
        const clean = t.trim().toLowerCase();
        if (clean) set.add(clean);
      }
    }

    return NextResponse.json({ etiquetas: [...set].sort(), fuente: "datos" });
  });
}
