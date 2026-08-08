/**
 * Actividad del dashboard (páginas visitadas y clics).
 *
 * POST — recibe lotes de eventos del tracker cliente (cualquier usuario autenticado).
 * GET  — consulta para el Registro de accesos (superadmin / platform admin).
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { actividadDashboard, cuentas } from "@/lib/db/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";

const TIPOS_VALIDOS = new Set(["page_view", "click"]);
const MAX_EVENTOS_POR_LOTE = 50;
const RETENCION_DIAS = 90;

interface EventoIn {
  tipo?: string;
  pagina?: string;
  detalle?: string;
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let eventos: EventoIn[];
  try {
    const body = await req.json();
    eventos = Array.isArray(body?.eventos) ? body.eventos : [];
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const values = eventos
    .slice(0, MAX_EVENTOS_POR_LOTE)
    .filter((e) => e && TIPOS_VALIDOS.has(e.tipo ?? ""))
    .map((e) => ({
      id_cuenta: session!.user.id_cuenta ?? null,
      email,
      tipo: e.tipo!,
      pagina: (e.pagina ?? "").slice(0, 200) || null,
      detalle: (e.detalle ?? "").slice(0, 120) || null,
    }));

  if (values.length > 0) {
    await db.insert(actividadDashboard).values(values);
  }

  // Limpieza probabilística: borrar actividad de más de RETENCION_DIAS
  if (Math.random() < 0.02) {
    db.delete(actividadDashboard)
      .where(sql`${actividadDashboard.created_at} < now() - interval '${sql.raw(String(RETENCION_DIAS))} days'`)
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, guardados: values.length });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const isPlatformAdmin = session.user.platformAdmin === true;
  const isSuperadmin = session.user.rol === "superadmin";
  if (!isPlatformAdmin && !isSuperadmin) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const url = new URL(req.url);
  const dias = Math.min(Number(url.searchParams.get("dias")) || 30, 90);
  const filterEmail = url.searchParams.get("email")?.trim().toLowerCase() || null;
  const filterTipo = url.searchParams.get("tipo");
  const filterCuenta = url.searchParams.get("id_cuenta");
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const conditions = [gte(actividadDashboard.created_at, desde)];

  if (!isPlatformAdmin) {
    if (!session.user.id_cuenta) {
      return NextResponse.json({ eventos: [] }, { status: 200 });
    }
    conditions.push(eq(actividadDashboard.id_cuenta, session.user.id_cuenta));
  } else if (filterCuenta) {
    conditions.push(eq(actividadDashboard.id_cuenta, Number(filterCuenta)));
  }
  if (filterEmail) conditions.push(eq(actividadDashboard.email, filterEmail));
  if (filterTipo && TIPOS_VALIDOS.has(filterTipo)) {
    conditions.push(eq(actividadDashboard.tipo, filterTipo));
  }

  const eventos = await db
    .select({
      id: actividadDashboard.id,
      id_cuenta: actividadDashboard.id_cuenta,
      nombre_cuenta: cuentas.nombre_cuenta,
      email: actividadDashboard.email,
      tipo: actividadDashboard.tipo,
      pagina: actividadDashboard.pagina,
      detalle: actividadDashboard.detalle,
      created_at: actividadDashboard.created_at,
    })
    .from(actividadDashboard)
    .leftJoin(cuentas, eq(actividadDashboard.id_cuenta, cuentas.id_cuenta))
    .where(and(...conditions))
    .orderBy(desc(actividadDashboard.created_at))
    .limit(1000);

  return NextResponse.json({ eventos });
}
