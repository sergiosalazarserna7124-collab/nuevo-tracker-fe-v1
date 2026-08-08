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

/**
 * Plan B sin scope de tags: agrega las etiquetas de los contactos de la
 * location (el scope de contactos SÍ está concedido). Hasta 3 páginas de 100.
 */
async function fetchTagsFromContacts(locationId: string, token: string): Promise<string[] | null> {
  const tags = new Set<string>();
  let startAfterId: string | null = null;
  try {
    for (let page = 0; page < 3; page++) {
      const url = new URL("https://services.leadconnectorhq.com/contacts/");
      url.searchParams.set("locationId", locationId);
      url.searchParams.set("limit", "100");
      if (startAfterId) url.searchParams.set("startAfterId", startAfterId);
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return tags.size > 0 ? [...tags] : null;
      const data = (await res.json()) as {
        contacts?: Array<{ id?: string; tags?: string[] }>;
        meta?: { startAfterId?: string };
      };
      const contacts = data.contacts ?? [];
      for (const ct of contacts) {
        for (const t of ct.tags ?? []) {
          const clean = t?.trim();
          if (clean) tags.add(clean);
        }
      }
      if (contacts.length < 100) break;
      startAfterId = data.meta?.startAfterId ?? contacts[contacts.length - 1]?.id ?? null;
      if (!startAfterId) break;
    }
  } catch {
    /* devolver lo acumulado */
  }
  return tags.size > 0 ? [...tags] : null;
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

      for (const token of tokens) {
        const tags = await fetchGhlTags(locationId, token);
        if (tags) {
          return NextResponse.json({
            etiquetas: [...new Set(tags.map((t) => t.toLowerCase()))].sort(),
            fuente: "ghl",
          });
        }
      }

      // Sin scope de tags → agregar etiquetas desde los contactos
      for (const token of tokens) {
        const tags = await fetchTagsFromContacts(locationId, token);
        if (tags) {
          return NextResponse.json({
            etiquetas: [...new Set(tags.map((t) => t.toLowerCase()))].sort(),
            fuente: "contactos",
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
