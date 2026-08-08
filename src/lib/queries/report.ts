/**
 * src/lib/queries/report.ts
 *
 * Capa de consultas de agregación para Reportes v2.
 * Cada función recibe (idCuenta, from, to) y retorna datos tipados.
 * Todas las consultas son de solo lectura.
 */

import { db } from "@/lib/db";
import {
  logLlamadas,
  registrosDeLlamada,
  chatsLogs,
  resumenesDiariosAgendas,
} from "@/lib/db/schema";
import { eq, and, gte, lte, sql, isNull, isNotNull, or, gt } from "drizzle-orm";
import { agendaDedupKey } from "./agenda-dedup-key";
import { zonedDayRange } from "@/lib/date-range";
import { sinNoTrackeadosSql } from "@/lib/queries/no-trackeado";

/* ------------------------------------------------------------------ */
/*  1. getReportAds                                                    */
/* ------------------------------------------------------------------ */

export interface ReportAdsCampaign {
  campana: string | null;
  plataforma: string | null;
  gastoTotal: number;
  impresiones: number;
  clicks: number;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
}

export interface ReportAdsCreativo {
  nombre: string;
  gastoTotal: number;
  leadsCount: number;
}

export interface ReportAds {
  totalGasto: number;
  totalImpresiones: number;
  totalClicks: number;
  avgCtr: number | null;
  avgCpm: number | null;
  avgCpc: number | null;
  porCampana: ReportAdsCampaign[];
  porCreativo: ReportAdsCreativo[];
}

export async function getReportAds(
  idCuenta: number,
  from: string,
  to: string,
  tz?: string | null,
): Promise<ReportAds> {
  const { fromDate, toDate } = zonedDayRange(from, to, tz);
  const [campanaRows, creativoRows, leadsPorCreativo] = await Promise.all([
    // Agregado por campaña desde resumenes_diarios_ads (no está en schema Drizzle → raw SQL)
    db.execute(sql`
      SELECT
        campana,
        plataforma,
        SUM(gasto_total_ad)::numeric          AS gasto_total,
        SUM(impresiones_totales)::bigint      AS impresiones,
        SUM(clicks_unicos)::bigint            AS clicks,
        AVG(CASE WHEN gasto_total_ad > 0 THEN ctr END)::numeric AS ctr,
        AVG(CASE WHEN gasto_total_ad > 0 THEN cpm END)::numeric AS cpm,
        AVG(CASE WHEN gasto_total_ad > 0 THEN cpc END)::numeric AS cpc
      FROM resumenes_diarios_ads
      WHERE id_cuenta = ${idCuenta}
        AND fecha BETWEEN ${from}::date AND ${to}::date
      GROUP BY campana, plataforma
      ORDER BY gasto_total DESC
    `),

    // Gasto por creativo
    db.execute(sql`
      SELECT
        nombre_de_creativo,
        SUM(gasto_total_creativo)::numeric AS gasto_total
      FROM resumenes_diarios_creativos
      WHERE id_cuenta = ${idCuenta}
        AND fecha BETWEEN ${from}::date AND ${to}::date
      GROUP BY nombre_de_creativo
      ORDER BY gasto_total DESC
    `),

    // Leads por creativo_origen en log_llamadas
    db.execute(sql`
      SELECT
        creativo_origen,
        COUNT(DISTINCT COALESCE(contact_id_ghl, mail_lead, phone))::int AS leads_count
      FROM log_llamadas
      WHERE id_cuenta = ${idCuenta}
        AND ts BETWEEN ${fromDate} AND ${toDate}
        AND creativo_origen IS NOT NULL
        AND creativo_origen <> ''
        AND tipo_evento NOT IN ('pdte', 'contacto_creado')
        AND ${sinNoTrackeadosSql(idCuenta)}
      GROUP BY creativo_origen
      ORDER BY leads_count DESC
    `),
  ]);

  type CampanaRow = {
    campana: string | null;
    plataforma: string | null;
    gasto_total: string | null;
    impresiones: string | null;
    clicks: string | null;
    ctr: string | null;
    cpm: string | null;
    cpc: string | null;
  };

  type CreativoRow = { nombre_de_creativo: string; gasto_total: string | null };
  type LeadCreativoRow = { creativo_origen: string; leads_count: number };

  const porCampana: ReportAdsCampaign[] = (campanaRows.rows as CampanaRow[]).map((r) => ({
    campana: r.campana,
    plataforma: r.plataforma,
    gastoTotal: parseFloat(r.gasto_total ?? "0") || 0,
    impresiones: Number(r.impresiones ?? 0),
    clicks: Number(r.clicks ?? 0),
    ctr: r.ctr != null ? parseFloat(r.ctr) : null,
    cpm: r.cpm != null ? parseFloat(r.cpm) : null,
    cpc: r.cpc != null ? parseFloat(r.cpc) : null,
  }));

  // Mapa de leads por creativo — normalizado a lowercase+trim para tolerar diferencias de capitalización
  const leadsMap: Record<string, number> = {};
  for (const r of leadsPorCreativo.rows as LeadCreativoRow[]) {
    leadsMap[r.creativo_origen.trim().toLowerCase()] = r.leads_count;
  }

  const porCreativo: ReportAdsCreativo[] = (creativoRows.rows as CreativoRow[]).map((r) => ({
    nombre: r.nombre_de_creativo,
    gastoTotal: parseFloat(r.gasto_total ?? "0") || 0,
    leadsCount: leadsMap[r.nombre_de_creativo.trim().toLowerCase()] ?? 0,
  }));

  const totalGasto = porCampana.reduce((s, r) => s + r.gastoTotal, 0);
  const totalImpresiones = porCampana.reduce((s, r) => s + r.impresiones, 0);
  const totalClicks = porCampana.reduce((s, r) => s + r.clicks, 0);

  const ctrs = porCampana.filter((r) => r.ctr != null).map((r) => r.ctr!);
  const cpms = porCampana.filter((r) => r.cpm != null).map((r) => r.cpm!);
  const cpcs = porCampana.filter((r) => r.cpc != null).map((r) => r.cpc!);

  return {
    totalGasto,
    totalImpresiones,
    totalClicks,
    avgCtr: ctrs.length > 0 ? ctrs.reduce((s, v) => s + v, 0) / ctrs.length : null,
    avgCpm: cpms.length > 0 ? cpms.reduce((s, v) => s + v, 0) / cpms.length : null,
    avgCpc: cpcs.length > 0 ? cpcs.reduce((s, v) => s + v, 0) / cpcs.length : null,
    porCampana,
    porCreativo,
  };
}

/* ------------------------------------------------------------------ */
/*  2. getReportCalls                                                  */
/* ------------------------------------------------------------------ */

export interface ReportCallsAdvisor {
  closerMail: string | null;
  closerName: string | null;
  totalLlamadas: number;
  contestadas: number;
  tasaContacto: number;
  speedToLeadAvgMin: number | null;
  intentosProm: number;
  leadsNuevos: number;
  leadsSeguimiento: number;
}

export interface ReportCalls {
  totalLlamadas: number;
  totalContestadas: number;
  tasaContactoGlobal: number;
  speedToLeadAvgMin: number | null;
  intentosPromGlobal: number;
  porCloser: ReportCallsAdvisor[];
}

export async function getReportCalls(
  idCuenta: number,
  from: string,
  to: string,
  tz?: string | null,
): Promise<ReportCalls> {
  const { fromDate: fromTs, toDate: toTs } = zonedDayRange(from, to, tz);

  // Llamadas realizadas en el rango (excluir pdte y contacto_creado que son solo creación de lead)
  // Proyección explícita para no cargar transcripcion (texto completo, caro en memoria con volumen alto)
  const rows = await db
    .select({
      id: logLlamadas.id,
      id_registro: logLlamadas.id_registro,
      tipo_evento: logLlamadas.tipo_evento,
      closer_mail: logLlamadas.closer_mail,
      nombre_closer: logLlamadas.nombre_closer,
      contact_id_ghl: logLlamadas.contact_id_ghl,
      mail_lead: logLlamadas.mail_lead,
      phone: logLlamadas.phone,
      speed_to_lead: logLlamadas.speed_to_lead,
    })
    .from(logLlamadas)
    .where(
      and(
        eq(logLlamadas.id_cuenta, idCuenta),
        gte(logLlamadas.ts, fromTs),
        lte(logLlamadas.ts, toTs),
        sql`${logLlamadas.tipo_evento} NOT IN ('pdte', 'contacto_creado')`,
        sinNoTrackeadosSql(idCuenta),
      ),
    );

  // Nuevos leads en el rango (tipo_evento = 'pdte' o 'contacto_creado')
  const nuevosResult = await db.execute(sql`
    SELECT
      LOWER(TRIM(COALESCE(closer_mail, nombre_closer, ''))) AS closer_key,
      MIN(closer_mail)  AS closer_mail,
      MIN(nombre_closer) AS closer_name,
      COUNT(DISTINCT COALESCE(contact_id_ghl, mail_lead, phone))::int AS leads_nuevos
    FROM log_llamadas
    WHERE id_cuenta = ${idCuenta}
      AND ts BETWEEN ${fromTs} AND ${toTs}
      AND tipo_evento IN ('pdte', 'contacto_creado')
      AND ${sinNoTrackeadosSql(idCuenta)}
    GROUP BY LOWER(TRIM(COALESCE(closer_mail, nombre_closer, '')))
  `);

  type NuevoRow = {
    closer_key: string;
    closer_mail: string | null;
    closer_name: string | null;
    leads_nuevos: number;
  };

  const nuevosMap: Record<string, number> = {};
  for (const r of nuevosResult.rows as NuevoRow[]) {
    nuevosMap[r.closer_key] = r.leads_nuevos;
  }

  // Leads de seguimiento = leads únicos en log_llamadas (excluyendo pdte/contacto_creado)
  // que YA existían antes del rango (tienen id_registro con fecha_primera_llamada previa)
  const seguimientoResult = await db.execute(sql`
    SELECT
      LOWER(TRIM(COALESCE(ll.closer_mail, ll.nombre_closer, ''))) AS closer_key,
      COUNT(DISTINCT COALESCE(ll.contact_id_ghl, ll.mail_lead, ll.phone))::int AS leads_seguimiento
    FROM log_llamadas ll
    LEFT JOIN registros_de_llamada rr ON rr.id_registro = ll.id_registro
    WHERE ll.id_cuenta = ${idCuenta}
      AND ll.ts BETWEEN ${fromTs} AND ${toTs}
      AND ll.tipo_evento NOT IN ('pdte', 'contacto_creado')
      AND ${sinNoTrackeadosSql(idCuenta, "ll.contact_id_ghl")}
      AND rr.fecha_primera_llamada < ${fromTs}
    GROUP BY LOWER(TRIM(COALESCE(ll.closer_mail, ll.nombre_closer, '')))
  `);

  type SeguimientoRow = { closer_key: string; leads_seguimiento: number };
  const seguimientoMap: Record<string, number> = {};
  for (const r of seguimientoResult.rows as SeguimientoRow[]) {
    seguimientoMap[r.closer_key] = r.leads_seguimiento;
  }

  // Agrupar por closer
  function normalizeCloserKey(mail?: string | null, name?: string | null): string {
    const m = mail?.trim().toLowerCase();
    if (m) return m;
    const n = name?.trim().toLowerCase();
    if (n) return n;
    return "sin asignar";
  }

  const byCloser: Record<
    string,
    {
      closerMail: string | null;
      closerName: string | null;
      llamadas: number;
      contestadas: number;
      speeds: number[];
      leadsSet: Set<string>;
    }
  > = {};

  for (const r of rows) {
    const key = normalizeCloserKey(r.closer_mail, r.nombre_closer);
    if (!byCloser[key]) {
      byCloser[key] = {
        closerMail: r.closer_mail,
        closerName: r.nombre_closer,
        llamadas: 0,
        contestadas: 0,
        speeds: [],
        leadsSet: new Set(),
      };
    }
    const entry = byCloser[key];
    if (!entry) continue;
    entry.llamadas++;
    if (r.tipo_evento.startsWith("efectiva_")) entry.contestadas++;
    if (r.speed_to_lead) {
      const s = parseFloat(r.speed_to_lead);
      if (!isNaN(s) && s >= 0) entry.speeds.push(s);
    }
    const leadId = r.contact_id_ghl ?? r.mail_lead ?? r.phone ?? String(r.id);
    entry.leadsSet.add(leadId);
  }

  const porCloser: ReportCallsAdvisor[] = Object.entries(byCloser).map(([key, v]) => {
    const totalLeads = v.leadsSet.size || 1;
    return {
      closerMail: v.closerMail,
      closerName: v.closerName,
      totalLlamadas: v.llamadas,
      contestadas: v.contestadas,
      tasaContacto: v.llamadas > 0 ? (v.contestadas / v.llamadas) * 100 : 0,
      speedToLeadAvgMin:
        v.speeds.length > 0 ? v.speeds.reduce((s, x) => s + x, 0) / v.speeds.length : null,
      intentosProm: v.llamadas / totalLeads,
      leadsNuevos: nuevosMap[key] ?? 0,
      leadsSeguimiento: seguimientoMap[key] ?? 0,
    };
  });

  const totalLlamadas = rows.length;
  const totalContestadas = rows.filter((r) => r.tipo_evento.startsWith("efectiva_")).length;
  const allSpeeds = rows
    .filter((r) => r.speed_to_lead != null)
    .map((r) => parseFloat(r.speed_to_lead as string))
    .filter((n) => !isNaN(n) && n >= 0);

  const uniqueLeads = new Set(
    rows.map((r) => r.contact_id_ghl ?? r.mail_lead ?? r.phone ?? String(r.id)),
  );

  return {
    totalLlamadas,
    totalContestadas,
    tasaContactoGlobal: totalLlamadas > 0 ? (totalContestadas / totalLlamadas) * 100 : 0,
    speedToLeadAvgMin:
      allSpeeds.length > 0 ? allSpeeds.reduce((s, v) => s + v, 0) / allSpeeds.length : null,
    intentosPromGlobal: uniqueLeads.size > 0 ? totalLlamadas / uniqueLeads.size : 0,
    porCloser,
  };
}

/* ------------------------------------------------------------------ */
/*  3. getReportChats                                                  */
/* ------------------------------------------------------------------ */

export interface ReportChatsAdvisor {
  asesor: string | null;
  totalChats: number;
  speedToLeadAvgMin: number | null;
  porCategoria: Record<string, number>;
}

export interface ReportChats {
  totalChats: number;
  speedToLeadAvgMin: number | null;
  porAsesor: ReportChatsAdvisor[];
  porCategoria: Record<string, number>;
}

export async function getReportChats(
  idCuenta: number,
  from: string,
  to: string,
  tz?: string | null,
): Promise<ReportChats> {
  const { fromDate: fromTs, toDate: toTs } = zonedDayRange(from, to, tz);

  const rows = await db
    .select({
      asesor_asignado: chatsLogs.asesor_asignado,
      primer_msg_lead_at: chatsLogs.primer_msg_lead_at,
      primer_msg_at: chatsLogs.primer_msg_at,
      ia_categoria: chatsLogs.ia_categoria,
    })
    .from(chatsLogs)
    .where(
      and(
        eq(chatsLogs.id_cuenta, idCuenta),
        gte(chatsLogs.fecha_y_hora_z, fromTs),
        lte(chatsLogs.fecha_y_hora_z, toTs),
      ),
    );

  // Agrupar por asesor
  const byAsesor: Record<
    string,
    { asesor: string | null; speeds: number[]; categorias: Record<string, number> }
  > = {};

  const globalCategorias: Record<string, number> = {};
  const allSpeeds: number[] = [];

  for (const r of rows) {
    const key = r.asesor_asignado?.trim() ?? "__sin_asignar__";
    if (!byAsesor[key]) {
      byAsesor[key] = { asesor: r.asesor_asignado, speeds: [], categorias: {} };
    }
    const entry = byAsesor[key];
    if (!entry) continue;

    // Speed-to-lead = primer_msg_at - primer_msg_lead_at (en minutos)
    if (r.primer_msg_lead_at && r.primer_msg_at) {
      const diffMs = r.primer_msg_at.getTime() - r.primer_msg_lead_at.getTime();
      if (diffMs >= 0) {
        const mins = diffMs / 60000;
        entry.speeds.push(mins);
        allSpeeds.push(mins);
      }
    }

    const cat = r.ia_categoria ?? "sin categoría";
    entry.categorias[cat] = (entry.categorias[cat] ?? 0) + 1;
    globalCategorias[cat] = (globalCategorias[cat] ?? 0) + 1;
  }

  const porAsesor: ReportChatsAdvisor[] = Object.values(byAsesor).map((v) => ({
    asesor: v.asesor,
    totalChats: Object.values(v.categorias).reduce((s, n) => s + n, 0),
    speedToLeadAvgMin:
      v.speeds.length > 0 ? v.speeds.reduce((s, x) => s + x, 0) / v.speeds.length : null,
    porCategoria: v.categorias,
  }));

  return {
    totalChats: rows.length,
    speedToLeadAvgMin:
      allSpeeds.length > 0 ? allSpeeds.reduce((s, v) => s + v, 0) / allSpeeds.length : null,
    porAsesor,
    porCategoria: globalCategorias,
  };
}

/* ------------------------------------------------------------------ */
/*  4. getReportVideocalls                                             */
/* ------------------------------------------------------------------ */

export interface ReportVideocallsCloser {
  closer: string | null;
  total: number;
  calificadas: number;
  noShows: number;
  cerradas: number;
  canceladas: number;
  porCategoria: Record<string, number>;
}

export interface ReportVideocalls {
  total: number;
  calificadas: number;
  calificadosReales: number;
  noCalificadosReales: number;
  noShows: number;
  cerradas: number;
  canceladas: number;
  tasaCierre: number;
  porCloser: ReportVideocallsCloser[];
}

function clasificarCategoria(cat: string | null): {
  calificada: boolean;
  noShow: boolean;
  cerrada: boolean;
  cancelada: boolean;
  esCalificadoReal: boolean;
  esNoCalificadoReal: boolean;
} {
  if (!cat) return { calificada: false, noShow: false, cerrada: false, cancelada: false, esCalificadoReal: false, esNoCalificadoReal: false };
  const cl = cat.trim().toLowerCase();
  const cancelada = cl.includes("cancel");
  const noShow = cl === "no_show" || cl === "noshow" || cl === "no show";
  const cerrada = cl === "cerrada" || cl === "closed";
  // "calificada" = la videollamada ocurrió y fue evaluada (tanto calificadas como no_calificadas)
  const calificada =
    !cancelada &&
    !noShow &&
    !cerrada &&
    (cl === "calificada" ||
      cl === "ofertada" ||
      cl === "offered" ||
      cl === "no_calificada" ||
      cl === "no_ofertada" ||
      cl === "no ofertada");
  const esCalificadoReal = cerrada || cl === "calificada" || cl === "ofertada" || cl === "offered";
  const esNoCalificadoReal = cl === "no_calificada" || cl === "no_ofertada" || cl === "no ofertada";
  return { calificada, noShow, cerrada, cancelada, esCalificadoReal, esNoCalificadoReal };
}

export async function getReportVideocalls(
  idCuenta: number,
  from: string,
  to: string,
  tz?: string | null,
): Promise<ReportVideocalls> {
  // Use the same 3-condition date filter as getDashboard so both screens show
  // consistent numbers. Dashboard filters by fecha_reunion (actual meeting date)
  // with fallback to fecha (insertion date); filtering only by fecha caused a
  // systematic 2-meeting discrepancy for records inserted outside the period but
  // with a meeting date inside it (or vice-versa).
  const { fromDate, toDate } = zonedDayRange(from, to, tz);
  const fechaFilter = or(
    // Caso 1: fecha_reunion conocida y dentro del rango
    and(
      isNotNull(resumenesDiariosAgendas.fecha_reunion),
      gte(resumenesDiariosAgendas.fecha_reunion, fromDate),
      lte(resumenesDiariosAgendas.fecha_reunion, toDate),
    ),
    // Caso 2: PDTE con fecha_reunion futura — insertada en el rango seleccionado
    and(
      eq(resumenesDiariosAgendas.categoria, 'PDTE'),
      isNotNull(resumenesDiariosAgendas.fecha_reunion),
      gt(resumenesDiariosAgendas.fecha_reunion, sql`NOW()`),
      gte(resumenesDiariosAgendas.fecha, from),
      lte(resumenesDiariosAgendas.fecha, to),
    ),
    // Caso 3: sin fecha_reunion → usa fecha de inserción
    and(
      isNull(resumenesDiariosAgendas.fecha_reunion),
      gte(resumenesDiariosAgendas.fecha, from),
      lte(resumenesDiariosAgendas.fecha, to),
    ),
  )!;

  const rows = await db
    .select({
      closer: resumenesDiariosAgendas.closer,
      categoria: resumenesDiariosAgendas.categoria,
      idcliente: resumenesDiariosAgendas.idcliente,
      ghl_contact_id: resumenesDiariosAgendas.ghl_contact_id,
      email_lead: resumenesDiariosAgendas.email_lead,
      id_registro_agenda: resumenesDiariosAgendas.id_registro_agenda,
    })
    .from(resumenesDiariosAgendas)
    .where(
      and(
        eq(resumenesDiariosAgendas.id_cuenta, idCuenta),
        fechaFilter,
      ),
    );

  const getLeadKey = agendaDedupKey;

  // Build global cancelled-lead set first so no-show dedup can exclude them
  // (matches getDashboard invariant: a rescheduled lead appears only in canceladas)
  const uniqueCanceledLeadKeys = new Set<string>();
  for (const r of rows) {
    if ((r.categoria ?? "").toLowerCase().trim().includes("cancel")) {
      uniqueCanceledLeadKeys.add(getLeadKey(r));
    }
  }

  const byCloser: Record<
    string,
    {
      closer: string | null;
      total: number;
      calificadas: number;
      noShows: number;
      cerradas: number;
      canceladas: number;
      porCategoria: Record<string, number>;
    }
  > = {};

  let totalCalificadas = 0;
  let totalCalificadosReales = 0;
  let totalNoCalificadosReales = 0;
  let totalCerradas = 0;
  let totalCanceladas = 0;

  // Global sets for dedup-based totals (mirrors getDashboard logic)
  const uniqueBookedLeadKeys = new Set<string>(); // all non-cancelled leads
  const uniqueNoShowLeadKeys = new Set<string>();  // no_show leads not in cancelled

  for (const r of rows) {
    const key = r.closer?.trim() ?? "__sin_closer__";
    if (!byCloser[key]) {
      byCloser[key] = {
        closer: r.closer,
        total: 0,
        calificadas: 0,
        noShows: 0,
        cerradas: 0,
        canceladas: 0,
        porCategoria: {},
      };
    }
    const entry = byCloser[key];
    if (!entry) continue;
    entry.total++;

    const cl = clasificarCategoria(r.categoria);
    if (cl.calificada) { entry.calificadas++; totalCalificadas++; }
    if (cl.esCalificadoReal) { totalCalificadosReales++; }
    if (cl.esNoCalificadoReal) { totalNoCalificadosReales++; }
    if (cl.noShow)     { entry.noShows++; }
    if (cl.cerrada)    { entry.cerradas++; totalCerradas++; }
    if (cl.cancelada)  { entry.canceladas++; totalCanceladas++; }

    const lk = getLeadKey(r);
    if (!cl.cancelada) uniqueBookedLeadKeys.add(lk);
    if (cl.noShow && !uniqueCanceledLeadKeys.has(lk)) uniqueNoShowLeadKeys.add(lk);

    const catKey = r.categoria ?? "sin categoría";
    entry.porCategoria[catKey] = (entry.porCategoria[catKey] ?? 0) + 1;
  }

  // Global totals use dedup counts to match getDashboard's meetingsBooked / noShows
  const totalDeduped = uniqueBookedLeadKeys.size;
  const totalNoShows = uniqueNoShowLeadKeys.size;

  const porCloser: ReportVideocallsCloser[] = Object.values(byCloser);

  return {
    total: totalDeduped,
    calificadas: totalCalificadas,
    calificadosReales: totalCalificadosReales,
    noCalificadosReales: totalNoCalificadosReales,
    noShows: totalNoShows,
    cerradas: totalCerradas,
    canceladas: totalCanceladas,
    tasaCierre: totalDeduped > 0 ? (totalCerradas / totalDeduped) * 100 : 0,
    porCloser,
  };
}

/* ------------------------------------------------------------------ */
/*  5. getReportFunnel                                                 */
/* ------------------------------------------------------------------ */

export interface ReportFunnelNodo {
  categoria: string;
  total: number;
  porcentaje: number;
}

export interface ReportFunnelCanal {
  contactados: number;
  sinContacto: number;
  porCategoria: ReportFunnelNodo[];
}

export interface ReportFunnel {
  llamadas: ReportFunnelCanal;
  chats: ReportFunnelCanal;
  videollamadas: ReportFunnelCanal;
}

export async function getReportFunnel(
  idCuenta: number,
  from: string,
  to: string,
  tz?: string | null,
): Promise<ReportFunnel> {
  const { fromDate: fromTs, toDate: toTs } = zonedDayRange(from, to, tz);

  const [llamadasResult, chatsResult, videoResult] = await Promise.all([
    // Distribución por estado en registros_de_llamada creados en el rango
    db.execute(sql`
      SELECT
        LOWER(TRIM(COALESCE(estado, 'sin estado'))) AS estado,
        COUNT(*)::int AS total
      FROM registros_de_llamada
      WHERE id_cuenta = ${String(idCuenta)}
        AND fecha_evento BETWEEN ${fromTs} AND ${toTs}
      GROUP BY LOWER(TRIM(COALESCE(estado, 'sin estado')))
      ORDER BY total DESC
    `),

    // Distribución por estado en chats_logs
    db
      .select({
        estado: chatsLogs.estado,
        ia_categoria: chatsLogs.ia_categoria,
      })
      .from(chatsLogs)
      .where(
        and(
          eq(chatsLogs.id_cuenta, idCuenta),
          gte(chatsLogs.fecha_y_hora_z, fromTs),
          lte(chatsLogs.fecha_y_hora_z, toTs),
        ),
      ),

    // Distribución por categoría en resumenes_diarios_agendas
    db
      .select({ categoria: resumenesDiariosAgendas.categoria })
      .from(resumenesDiariosAgendas)
      .where(
        and(
          eq(resumenesDiariosAgendas.id_cuenta, idCuenta),
          gte(resumenesDiariosAgendas.fecha, from),
          lte(resumenesDiariosAgendas.fecha, to),
        ),
      ),
  ]);

  type EstadoRow = { estado: string; total: number };

  // --- Llamadas ---
  const llamadasCategorias: Record<string, number> = {};
  for (const r of llamadasResult.rows as EstadoRow[]) {
    llamadasCategorias[r.estado] = r.total;
  }
  const llamadasTotal = Object.values(llamadasCategorias).reduce((s, n) => s + n, 0);
  // Contactados = estado efectiva_* o seguimiento
  const estadosContactados = new Set(["seguimiento", "efectiva", "cerrado", "vendido"]);
  const llamadasContactados = Object.entries(llamadasCategorias)
    .filter(([k]) => estadosContactados.has(k) || k.startsWith("efectiva"))
    .reduce((s, [, n]) => s + n, 0);
  const estadosTerminalesNoPendientes = new Set(["perdido", "perdida", "no_interesado", "no interesado"]);
  const llamadasTerminales = Object.entries(llamadasCategorias)
    .filter(([k]) => estadosTerminalesNoPendientes.has(k))
    .reduce((s, [, n]) => s + n, 0);

  // --- Chats ---
  const chatsCategorias: Record<string, number> = {};
  let chatsContactados = 0;
  for (const r of chatsResult) {
    const cat = r.ia_categoria ?? r.estado ?? "sin categoría";
    chatsCategorias[cat] = (chatsCategorias[cat] ?? 0) + 1;
    // Chats contactados = tiene estado o ia_categoria distinta de "pendiente"
    if (r.estado && r.estado.toLowerCase() !== "pendiente" && r.estado.toLowerCase() !== "pdte") {
      chatsContactados++;
    }
  }
  const chatsTotal = chatsResult.length;

  // --- Videollamadas ---
  const videoCategorias: Record<string, number> = {};
  let videoContactados = 0;
  for (const r of videoResult) {
    const cat = r.categoria ?? "sin categoría";
    videoCategorias[cat] = (videoCategorias[cat] ?? 0) + 1;
    const cl = clasificarCategoria(r.categoria);
    if (!cl.noShow && !cl.cancelada && r.categoria != null) videoContactados++;
  }
  const videoTotal = videoResult.length;

  function buildNodos(cats: Record<string, number>, total: number): ReportFunnelNodo[] {
    return Object.entries(cats)
      .sort(([, a], [, b]) => b - a)
      .map(([categoria, n]) => ({
        categoria,
        total: n,
        porcentaje: total > 0 ? (n / total) * 100 : 0,
      }));
  }

  return {
    llamadas: {
      contactados: llamadasContactados,
      sinContacto: llamadasTotal - llamadasContactados - llamadasTerminales,
      porCategoria: buildNodos(llamadasCategorias, llamadasTotal),
    },
    chats: {
      contactados: chatsContactados,
      sinContacto: chatsTotal - chatsContactados,
      porCategoria: buildNodos(chatsCategorias, chatsTotal),
    },
    videollamadas: {
      contactados: videoContactados,
      sinContacto: videoTotal - videoContactados,
      porCategoria: buildNodos(videoCategorias, videoTotal),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  6. getReportCrmHealth                                              */
/* ------------------------------------------------------------------ */

export interface ReportCrmHealthAdvisor {
  asesor: string | null;
  sinEstado: number;
  sinAccion: number;
  enLimbo: number;
}

export interface ReportCrmHealthLeadDetalle {
  nombre: string;
  asesor: string | null;
  diasSinActividad: number;
}

export interface ReportCrmHealth {
  sinEstado: number;
  sinAccion: number;
  enLimbo: number;
  porAsesor: ReportCrmHealthAdvisor[];
  leadsDetalle: ReportCrmHealthLeadDetalle[];
  leadsEnLimboDetalle: ReportCrmHealthLeadDetalle[];
}

export async function getReportCrmHealth(
  idCuenta: number,
  from: string,
  to: string,
  tz?: string | null,
): Promise<ReportCrmHealth> {
  const { fromDate: fromTs, toDate: toTs } = zonedDayRange(from, to, tz);
  const limboThreshold = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // hace 5 días

  const [sinEstadoResult, sinAccionResult, enLimboResult, leadsDetalleResult, leadsEnLimboDetalleResult] = await Promise.all([
    // Leads sin estado (estado null o vacío)
    db.execute(sql`
      SELECT
        COALESCE(nombre_closer, closer_mail, 'sin asignar') AS asesor,
        COUNT(*)::int AS total
      FROM registros_de_llamada
      WHERE id_cuenta = ${String(idCuenta)}
        AND fecha_evento BETWEEN ${fromTs} AND ${toTs}
        AND (estado IS NULL OR TRIM(estado) = '')
      GROUP BY COALESCE(nombre_closer, closer_mail, 'sin asignar')
      ORDER BY total DESC
    `),

    // Leads sin acción = lead en registros_de_llamada sin ninguna entrada en log_llamadas
    // Excluir leads con estado terminal (perdido/perdida) — no requieren acción
    db.execute(sql`
      SELECT
        COALESCE(rr.nombre_closer, rr.closer_mail, 'sin asignar') AS asesor,
        COUNT(*)::int AS total
      FROM registros_de_llamada rr
      WHERE rr.id_cuenta = ${String(idCuenta)}
        AND rr.fecha_evento BETWEEN ${fromTs} AND ${toTs}
        AND rr.calificacion_manual IS DISTINCT FROM 'no_trackeado'
        AND LOWER(TRIM(COALESCE(rr.estado, ''))) NOT IN ('perdido', 'perdida')
        AND NOT EXISTS (
          SELECT 1 FROM log_llamadas ll
          WHERE ll.id_registro = rr.id_registro
            AND ll.id_cuenta = ${idCuenta}
        )
        AND NOT EXISTS (
          SELECT 1 FROM chats_logs cl
          WHERE cl.id_lead = rr.id_user_ghl
            AND cl.id_cuenta = ${idCuenta}
        )
      GROUP BY COALESCE(rr.nombre_closer, rr.closer_mail, 'sin asignar')
      ORDER BY total DESC
    `),

    // Leads en limbo: tuvo actividad pero hace >5 días que no se actualiza y no está cerrado
    db.execute(sql`
      SELECT
        COALESCE(rr.nombre_closer, rr.closer_mail, 'sin asignar') AS asesor,
        COUNT(*)::int AS total
      FROM registros_de_llamada rr
      WHERE rr.id_cuenta = ${String(idCuenta)}
        AND rr.fecha_evento BETWEEN ${fromTs} AND ${toTs}
        AND rr.calificacion_manual IS DISTINCT FROM 'no_trackeado'
        AND LOWER(TRIM(COALESCE(rr.estado, ''))) NOT IN ('cerrado', 'vendido', 'ganado', 'done', 'perdido', 'perdida')
        AND (
          EXISTS (
            SELECT 1 FROM log_llamadas ll
            WHERE ll.id_registro = rr.id_registro
              AND ll.id_cuenta = ${idCuenta}
          )
          OR EXISTS (
            SELECT 1 FROM chats_logs cl
            WHERE cl.id_lead = rr.id_user_ghl
              AND cl.id_cuenta = ${idCuenta}
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM log_llamadas ll2
          WHERE ll2.id_registro = rr.id_registro
            AND ll2.id_cuenta = ${idCuenta}
            AND ll2.ts >= ${limboThreshold}
        )
        AND NOT EXISTS (
          SELECT 1 FROM chats_logs cl2
          WHERE cl2.id_lead = rr.id_user_ghl
            AND cl2.id_cuenta = ${idCuenta}
            AND cl2.fecha_y_hora_z >= ${limboThreshold}
        )
      GROUP BY COALESCE(rr.nombre_closer, rr.closer_mail, 'sin asignar')
      ORDER BY total DESC
    `),

    // Top 10 leads individuales sin acción (más antiguos primero)
    // Excluir leads con estado terminal (perdido/perdida)
    db.execute(sql`
      SELECT
        COALESCE(rr.nombre_lead, 'Lead sin nombre') AS nombre,
        COALESCE(rr.nombre_closer, rr.closer_mail) AS asesor,
        EXTRACT(EPOCH FROM (NOW() - rr.fecha_evento))::int / 86400 AS dias_sin_actividad
      FROM registros_de_llamada rr
      WHERE rr.id_cuenta = ${String(idCuenta)}
        AND rr.fecha_evento BETWEEN ${fromTs} AND ${toTs}
        AND rr.calificacion_manual IS DISTINCT FROM 'no_trackeado'
        AND LOWER(TRIM(COALESCE(rr.estado, ''))) NOT IN ('perdido', 'perdida')
        AND NOT EXISTS (
          SELECT 1 FROM log_llamadas ll
          WHERE ll.id_registro = rr.id_registro
            AND ll.id_cuenta = ${idCuenta}
        )
        AND NOT EXISTS (
          SELECT 1 FROM chats_logs cl
          WHERE cl.id_lead = rr.id_user_ghl
            AND cl.id_cuenta = ${idCuenta}
        )
      ORDER BY rr.fecha_evento ASC
      LIMIT 10
    `),

    // Top 10 leads individuales en limbo (más tiempo sin actividad primero)
    db.execute(sql`
      SELECT
        COALESCE(rr.nombre_lead, 'Lead sin nombre') AS nombre,
        COALESCE(rr.nombre_closer, rr.closer_mail) AS asesor,
        EXTRACT(EPOCH FROM (NOW() - GREATEST(
          COALESCE((
            SELECT MAX(ll2.ts) FROM log_llamadas ll2
            WHERE ll2.id_registro = rr.id_registro AND ll2.id_cuenta = ${idCuenta}
          ), rr.fecha_evento),
          COALESCE((
            SELECT MAX(cl2.fecha_y_hora_z) FROM chats_logs cl2
            WHERE cl2.id_lead = rr.id_user_ghl AND cl2.id_cuenta = ${idCuenta}
          ), rr.fecha_evento)
        )))::int / 86400 AS dias_sin_actividad
      FROM registros_de_llamada rr
      WHERE rr.id_cuenta = ${String(idCuenta)}
        AND rr.fecha_evento BETWEEN ${fromTs} AND ${toTs}
        AND rr.calificacion_manual IS DISTINCT FROM 'no_trackeado'
        AND LOWER(TRIM(COALESCE(rr.estado, ''))) NOT IN ('cerrado', 'vendido', 'ganado', 'done', 'perdido', 'perdida')
        AND (
          EXISTS (
            SELECT 1 FROM log_llamadas ll
            WHERE ll.id_registro = rr.id_registro AND ll.id_cuenta = ${idCuenta}
          )
          OR EXISTS (
            SELECT 1 FROM chats_logs cl
            WHERE cl.id_lead = rr.id_user_ghl AND cl.id_cuenta = ${idCuenta}
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM log_llamadas ll2
          WHERE ll2.id_registro = rr.id_registro
            AND ll2.id_cuenta = ${idCuenta}
            AND ll2.ts >= ${limboThreshold}
        )
        AND NOT EXISTS (
          SELECT 1 FROM chats_logs cl2
          WHERE cl2.id_lead = rr.id_user_ghl
            AND cl2.id_cuenta = ${idCuenta}
            AND cl2.fecha_y_hora_z >= ${limboThreshold}
        )
      ORDER BY dias_sin_actividad DESC
      LIMIT 10
    `),
  ]);

  type AsesorRow = { asesor: string | null; total: number };

  const asesorMap: Record<
    string,
    { sinEstado: number; sinAccion: number; enLimbo: number }
  > = {};

  const updateMap = (rows: AsesorRow[], field: "sinEstado" | "sinAccion" | "enLimbo") => {
    for (const r of rows) {
      const key = r.asesor ?? "sin asignar";
      if (!asesorMap[key]) asesorMap[key] = { sinEstado: 0, sinAccion: 0, enLimbo: 0 };
      asesorMap[key]![field] += r.total;
    }
  };

  updateMap(sinEstadoResult.rows as AsesorRow[], "sinEstado");
  updateMap(sinAccionResult.rows as AsesorRow[], "sinAccion");
  updateMap(enLimboResult.rows as AsesorRow[], "enLimbo");

  const porAsesor: ReportCrmHealthAdvisor[] = Object.entries(asesorMap).map(([key, v]) => ({
    asesor: key === "sin asignar" ? null : key,
    ...v,
  }));

  const totalSinEstado = (sinEstadoResult.rows as AsesorRow[]).reduce((s, r) => s + r.total, 0);
  const totalSinAccion = (sinAccionResult.rows as AsesorRow[]).reduce((s, r) => s + r.total, 0);
  const totalEnLimbo = (enLimboResult.rows as AsesorRow[]).reduce((s, r) => s + r.total, 0);

  type LeadDetalleRow = { nombre: string; asesor: string | null; dias_sin_actividad: number };
  const leadsDetalle: ReportCrmHealthLeadDetalle[] = (leadsDetalleResult.rows as LeadDetalleRow[]).map((r) => ({
    nombre: r.nombre,
    asesor: r.asesor ?? null,
    diasSinActividad: r.dias_sin_actividad,
  }));

  const leadsEnLimboDetalle: ReportCrmHealthLeadDetalle[] = (leadsEnLimboDetalleResult.rows as LeadDetalleRow[]).map((r) => ({
    nombre: r.nombre,
    asesor: r.asesor ?? null,
    diasSinActividad: r.dias_sin_actividad,
  }));

  return {
    sinEstado: totalSinEstado,
    sinAccion: totalSinAccion,
    enLimbo: totalEnLimbo,
    porAsesor,
    leadsDetalle,
    leadsEnLimboDetalle,
  };
}

/* ------------------------------------------------------------------ */
/*  7. getReportConversationAnalysis                                   */
/* ------------------------------------------------------------------ */

export interface ObjecionCount {
  objecion: string;
  categoria: string;
  count: number;
}

export interface ReportConversationAnalysis {
  totalConversaciones: number;
  conObjeciones: number;
  objeciones: ObjecionCount[];
  porCategoria: Record<string, number>;
}

export async function getReportConversationAnalysis(
  idCuenta: number,
  from: string,
  to: string,
  tz?: string | null,
): Promise<ReportConversationAnalysis> {
  const { fromDate: fromTs, toDate: toTs } = zonedDayRange(from, to, tz);

  // Objeciones de chats (ia_objeciones JSONB en chats_logs)
  const chatsObjecionesResult = await db.execute(sql`
    SELECT
      obj->>'objecion'  AS objecion,
      obj->>'categoria' AS categoria,
      COUNT(*)::int     AS cnt
    FROM chats_logs,
         jsonb_array_elements(CASE WHEN jsonb_typeof(ia_objeciones) = 'array' THEN ia_objeciones ELSE '[]'::jsonb END) AS obj
    WHERE id_cuenta = ${idCuenta}
      AND fecha_y_hora_z BETWEEN ${fromTs} AND ${toTs}
      AND jsonb_typeof(ia_objeciones) = 'array'
      AND ia_objeciones <> '[]'::jsonb
    GROUP BY obj->>'objecion', obj->>'categoria'
    ORDER BY cnt DESC
  `);

  // Objeciones de videollamadas (objeciones_ia JSONB en resumenes_diarios_agendas)
  const videoObjecionesResult = await db.execute(sql`
    SELECT
      obj->>'objecion'  AS objecion,
      obj->>'categoria' AS categoria,
      COUNT(*)::int     AS cnt
    FROM resumenes_diarios_agendas,
         jsonb_array_elements(CASE WHEN jsonb_typeof(objeciones_ia) = 'array' THEN objeciones_ia ELSE '[]'::jsonb END) AS obj
    WHERE id_cuenta = ${idCuenta}
      AND fecha BETWEEN ${from}::date AND ${to}::date
      AND jsonb_typeof(objeciones_ia) = 'array'
      AND objeciones_ia <> '[]'::jsonb
    GROUP BY obj->>'objecion', obj->>'categoria'
    ORDER BY cnt DESC
  `);

  type ObjecionRow = { objecion: string | null; categoria: string | null; cnt: number };

  // Merge conteos de ambas fuentes
  const merged: Record<string, ObjecionCount> = {};

  const addRows = (rows: ObjecionRow[]) => {
    for (const r of rows) {
      const key = `${r.objecion ?? ""}|${r.categoria ?? ""}`;
      if (merged[key]) {
        merged[key]!.count += r.cnt;
      } else {
        merged[key] = {
          objecion: r.objecion ?? "desconocida",
          categoria: r.categoria ?? "sin categoría",
          count: r.cnt,
        };
      }
    }
  };

  addRows(chatsObjecionesResult.rows as ObjecionRow[]);
  addRows(videoObjecionesResult.rows as ObjecionRow[]);

  const objeciones = Object.values(merged).sort((a, b) => b.count - a.count);

  // Acumular por categoría
  const porCategoria: Record<string, number> = {};
  for (const o of objeciones) {
    porCategoria[o.categoria] = (porCategoria[o.categoria] ?? 0) + o.count;
  }

  // Conteo de conversaciones con al menos una objeción
  const [chatsConResult, videoConResult] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM chats_logs
      WHERE id_cuenta = ${idCuenta}
        AND fecha_y_hora_z BETWEEN ${fromTs} AND ${toTs}
        AND jsonb_typeof(ia_objeciones) = 'array'
        AND ia_objeciones <> '[]'::jsonb
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM resumenes_diarios_agendas
      WHERE id_cuenta = ${idCuenta}
        AND fecha BETWEEN ${from}::date AND ${to}::date
        AND jsonb_typeof(objeciones_ia) = 'array'
        AND objeciones_ia <> '[]'::jsonb
    `),
  ]);

  // Total de conversaciones en el rango (chats + videollamadas)
  const [chatsTotalResult, videoTotalResult] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM chats_logs
      WHERE id_cuenta = ${idCuenta}
        AND fecha_y_hora_z BETWEEN ${fromTs} AND ${toTs}
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM resumenes_diarios_agendas
      WHERE id_cuenta = ${idCuenta}
        AND fecha BETWEEN ${from}::date AND ${to}::date
    `),
  ]);

  type TotalRow = { total: number };

  const conObjeciones =
    Number((chatsConResult.rows[0] as TotalRow)?.total ?? 0) +
    Number((videoConResult.rows[0] as TotalRow)?.total ?? 0);

  const totalConversaciones =
    Number((chatsTotalResult.rows[0] as TotalRow)?.total ?? 0) +
    Number((videoTotalResult.rows[0] as TotalRow)?.total ?? 0);

  return {
    totalConversaciones,
    conObjeciones,
    objeciones,
    porCategoria,
  };
}

/* ------------------------------------------------------------------ */
/*  8. getReportContactabilidadCanal                                    */
/* ------------------------------------------------------------------ */

export interface ReportContactabilidadCanal {
  canal: 'llamadas' | 'chats';
  total: number;
  contesto: number;
  noContesto: number;
  califico: number;
  noCalifco: number;
  tasaRespuesta: number; // 0-1
  tasaCalificacion: number; // 0-1 relative to total canal
}

export interface ReportContactabilidadCanales {
  canales: ReportContactabilidadCanal[];
  totalGeneral: number;
  contestoGeneral: number;
  calificoGeneral: number;
  tasaRespuestaGlobal: number;
  tasaCalificacionGlobal: number;
}

export async function getReportContactabilidadCanal(
  idCuenta: number,
  from: string,
  to: string,
  tz?: string | null,
): Promise<ReportContactabilidadCanales> {
  const { fromDate: fromTs, toDate: toTs } = zonedDayRange(from, to, tz);

  const [llamadasResult, chatsResult] = await Promise.all([
    // Llamadas: contar por tipo_evento (excluir pdte y contacto_creado que no son intentos reales)
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN tipo_evento LIKE 'efectiva_%' THEN 1 ELSE 0 END)::int AS contesto,
        SUM(CASE WHEN tipo_evento NOT LIKE 'efectiva_%' THEN 1 ELSE 0 END)::int AS no_contesto,
        SUM(CASE WHEN tipo_evento = 'efectiva_calificada' THEN 1 ELSE 0 END)::int AS califico,
        SUM(CASE WHEN tipo_evento = 'efectiva_no_calificada' THEN 1 ELSE 0 END)::int AS no_califco
      FROM log_llamadas
      WHERE id_cuenta = ${idCuenta}
        AND ts BETWEEN ${fromTs} AND ${toTs}
        AND tipo_evento NOT IN ('pdte', 'contacto_creado')
        AND ${sinNoTrackeadosSql(idCuenta)}
    `),

    // Chats: contestó = lead respondió (primer_msg_lead_at NOT NULL)
    // calificó = ia_categoria = 'calificada' OR estado = 'calificada'
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN primer_msg_lead_at IS NOT NULL THEN 1 ELSE 0 END)::int AS contesto,
        SUM(CASE WHEN primer_msg_lead_at IS NULL THEN 1 ELSE 0 END)::int AS no_contesto,
        SUM(CASE
          WHEN ia_categoria = 'calificada' OR estado = 'calificada' THEN 1
          ELSE 0
        END)::int AS califico,
        SUM(CASE
          WHEN ia_categoria = 'no_calificada' OR estado = 'no_calificada' THEN 1
          ELSE 0
        END)::int AS no_califco
      FROM chats_logs
      WHERE id_cuenta = ${idCuenta}
        AND fecha_y_hora_z BETWEEN ${fromTs} AND ${toTs}
        AND excluida_dashboard IS NOT TRUE
    `),
  ]);

  type CanalRow = {
    total: number;
    contesto: number;
    no_contesto: number;
    califico: number;
    no_califco: number;
  };

  const ll = llamadasResult.rows[0] as CanalRow | undefined;
  const ch = chatsResult.rows[0] as CanalRow | undefined;

  function buildCanal(
    canal: 'llamadas' | 'chats',
    row: CanalRow | undefined,
  ): ReportContactabilidadCanal {
    const total = Number(row?.total ?? 0);
    const contesto = Number(row?.contesto ?? 0);
    const noContesto = Number(row?.no_contesto ?? 0);
    const califico = Number(row?.califico ?? 0);
    const noCalifco = Number(row?.no_califco ?? 0);
    return {
      canal,
      total,
      contesto,
      noContesto,
      califico,
      noCalifco,
      tasaRespuesta: total > 0 ? contesto / total : 0,
      tasaCalificacion: total > 0 ? califico / total : 0,
    };
  }

  const canales: ReportContactabilidadCanal[] = [];
  const llCanal = buildCanal('llamadas', ll);
  const chCanal = buildCanal('chats', ch);

  if (llCanal.total > 0) canales.push(llCanal);
  if (chCanal.total > 0) canales.push(chCanal);

  const totalGeneral = llCanal.total + chCanal.total;
  const contestoGeneral = llCanal.contesto + chCanal.contesto;
  const calificoGeneral = llCanal.califico + chCanal.califico;

  return {
    canales,
    totalGeneral,
    contestoGeneral,
    calificoGeneral,
    tasaRespuestaGlobal: totalGeneral > 0 ? contestoGeneral / totalGeneral : 0,
    tasaCalificacionGlobal: totalGeneral > 0 ? calificoGeneral / totalGeneral : 0,
  };
}
