import { db } from "@/lib/db";
import { resumenesDiariosAgendas, cuentas, usuariosDashboard, logLlamadas, metricasWebhook } from "@/lib/db/schema";
import type { EmbudoEtapa, MetricaConfig } from "@/lib/db/schema";
import { normalizeEmbudoEtapas } from "@/lib/db/schema";
import { calcMetricaManual, calcMetricaAutomatica, parseMetricasConfig, type MetricaEngineContext } from "@/lib/metricas-engine";
import { eq, and, or, gt, gte, lte, sql, inArray, isNull, isNotNull } from "drizzle-orm";
import { zonedDayRange } from "@/lib/date-range";
import type {
  ApiVideollamada,
  VideollamadasAdvisorMetrics,
  VideollamadasResponse,
  ApiAdvisor,
} from "@/types";

const DEFAULT_ATTENDED_CATS = new Set(["Cerrada", "Ofertada", "No_Ofertada"]);

const PHONE_CALL_IA_PREFIX = "# Análisis de la Llamada Telefónica";

export function isPhoneCallRow(row: {
  fathom_recording_id: string | null;
  fathom_ingestion_source: string | null;
  resumen_ia: string | null;
}): boolean {
  return (
    row.fathom_recording_id === null &&
    row.fathom_ingestion_source === null &&
    row.resumen_ia !== null &&
    row.resumen_ia.startsWith(PHONE_CALL_IA_PREFIX)
  );
}

export function mapCategoria(cat: string | null, embudo: EmbudoEtapa[] | null) {
  if (!cat) return { attended: false, qualified: false, canceled: false, outcome: "pendiente" };
  const c = cat.trim();
  const cl = c.toLowerCase();

  // Embudo personalizado primero — buscar por nombre, name legacy o id (con fallback case-insensitive)
  if (embudo && embudo.length > 0) {
    const match = embudo.find(
      (e) =>
        (e.nombre != null && e.nombre === c) ||
        ((e as any).name != null && (e as any).name === c) ||
        (e.id != null && e.id === c) ||
        // case-insensitive fallback
        (e.nombre != null && e.nombre.toLowerCase() === cl) ||
        (e.id != null && e.id.toLowerCase() === cl),
    );
    if (match) {
      const label = match.nombre ?? (match as any).name ?? c;
      // Usar flags es_calificada, es_cerrada si están presentes
      const isCanceled = label.toLowerCase().includes("cancel");
      const isPending = label.toLowerCase() === "pendiente" || label.toLowerCase() === "pdte";
      const isQualified = match.es_calificada !== undefined ? match.es_calificada : (label.toLowerCase().includes("cerrad") || label.toLowerCase().includes("closed"));
      const isClosed = match.es_cerrada !== undefined ? match.es_cerrada : (label.toLowerCase().includes("cerrad") || label.toLowerCase().includes("closed"));
      return {
        attended: !isCanceled && !isPending,
        qualified: isQualified || isClosed,
        canceled: isCanceled,
        outcome: label.toLowerCase(),
      };
    }
  }

  // Nuevas etapas fijas del sistema
  if (cl === "calificada") return { attended: true, qualified: true, canceled: false, outcome: "calificada" };
  if (cl === "no_calificada") return { attended: true, qualified: false, canceled: false, outcome: "no_calificada" };
  if (cl === "cerrada") return { attended: true, qualified: true, canceled: false, outcome: "cerrada" };
  if (cl === "no_show" || cl === "noshow") return { attended: false, qualified: false, canceled: false, outcome: "no_show" };
  if (cl === "cancelada" || cl.includes("cancel")) return { attended: false, qualified: false, canceled: true, outcome: "cancelada" };
  if (cl === "pdte" || cl === "pendiente") return { attended: false, qualified: false, canceled: false, outcome: "pendiente" };
  // Backward compat etapas legacy
  if (cl === "closed") return { attended: true, qualified: true, canceled: false, outcome: "cerrada" };
  if (cl === "ofertada" || cl === "offered") return { attended: true, qualified: true, canceled: false, outcome: "calificada" };
  if (cl === "no_ofertada" || cl === "no ofertada") return { attended: true, qualified: false, canceled: false, outcome: "no_calificada" };
  return { attended: false, qualified: false, canceled: false, outcome: cl };
}


export async function getVideollamadas(
  idCuenta: number,
  dateFrom: string,
  dateTo: string,
  closerEmails?: string[],
  includeExcluded?: boolean,
): Promise<VideollamadasResponse> {
  const emails = (closerEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);

  // Resolver nombre_closer para cada email — Fathom a veces guarda nombre en lugar de email
  let closerValues: string[] = [...emails];
  if (emails.length > 0) {
    const usuariosRows = await db
      .select({ email: usuariosDashboard.email, nombre_closer: usuariosDashboard.nombre_closer })
      .from(usuariosDashboard)
      .where(and(eq(usuariosDashboard.id_cuenta, idCuenta), inArray(usuariosDashboard.email, emails)));
    for (const u of usuariosRows) {
      if (u.nombre_closer) closerValues.push(u.nombre_closer);
    }
  }

  // Mismo filtro de fecha que usa /dashboard para garantizar consistencia:
  // Caso 1: fecha_reunion conocida y dentro del rango (cita histórica o actual)
  // Caso 2: PDTE con fecha_reunion futura — insertada en el rango seleccionado.
  //   Una cita pendiente es prospectiva; excluirla por ser futura hace que no aparezca
  //   en el período en que se agendó. Mismo criterio que /dashboard (AUT-374).
  // Caso 3: sin fecha_reunion → usa fecha de inserción
  // AUT-1446: los límites del día se interpretan en la zona horaria del tenant
  // (no en UTC). Necesitamos la zona antes de construir el rango, por eso la
  // fila de `cuentas` se obtiene aquí en lugar de dentro del Promise.all de abajo.
  const [cuentaRow] = await db
    .select({
      embudo_personalizado: cuentas.embudo_personalizado,
      metricas_config: cuentas.metricas_config,
      metricas_manual_data: cuentas.metricas_manual_data,
      zona_horaria_iana: cuentas.zona_horaria_iana,
    })
    .from(cuentas)
    .where(eq(cuentas.id_cuenta, idCuenta))
    .limit(1);

  const { fromDate, toDate } = zonedDayRange(dateFrom, dateTo, cuentaRow?.zona_horaria_iana);
  const fechaFilter = or(
    and(
      isNotNull(resumenesDiariosAgendas.fecha_reunion),
      gte(resumenesDiariosAgendas.fecha_reunion, fromDate),
      lte(resumenesDiariosAgendas.fecha_reunion, toDate),
    ),
    and(
      eq(resumenesDiariosAgendas.categoria, 'PDTE'),
      isNotNull(resumenesDiariosAgendas.fecha_reunion),
      gt(resumenesDiariosAgendas.fecha_reunion, sql`NOW()`),
      // Usar el rango zonificado (fin de día), no las fechas crudas (medianoche):
      // si no, una cita agendada por la tarde del último día del rango queda excluida.
      gte(resumenesDiariosAgendas.fecha, fromDate.toISOString()),
      lte(resumenesDiariosAgendas.fecha, toDate.toISOString()),
    ),
    and(
      isNull(resumenesDiariosAgendas.fecha_reunion),
      gte(resumenesDiariosAgendas.fecha, fromDate.toISOString()),
      lte(resumenesDiariosAgendas.fecha, toDate.toISOString()),
    ),
  ) ?? sql`TRUE`;
  // AUT-632: exclude phone calls injected into agendas by the telephony pipeline
  const excludePhoneCalls = sql`NOT (${resumenesDiariosAgendas.fathom_recording_id} IS NULL AND ${resumenesDiariosAgendas.fathom_ingestion_source} IS NULL AND ${resumenesDiariosAgendas.resumen_ia} IS NOT NULL AND ${resumenesDiariosAgendas.resumen_ia} LIKE ${PHONE_CALL_IA_PREFIX + "%"})`;

  const agendaConditions = [
    eq(resumenesDiariosAgendas.id_cuenta, idCuenta),
    fechaFilter,
    excludePhoneCalls,
  ];
  if (!includeExcluded) {
    agendaConditions.push(eq(resumenesDiariosAgendas.excluida_dashboard, false));
  }
  if (closerValues.length > 0) agendaConditions.push(inArray(resumenesDiariosAgendas.closer, closerValues));

  const [rows, effectiveCalls] = await Promise.all([
    db
      .select()
      .from(resumenesDiariosAgendas)
      .where(and(...agendaConditions))
      .orderBy(sql`${resumenesDiariosAgendas.fecha_reunion} DESC`),
    db
      .select({ mail_lead: logLlamadas.mail_lead, phone: logLlamadas.phone, contact_id_ghl: logLlamadas.contact_id_ghl })
      .from(logLlamadas)
      .where(and(
        eq(logLlamadas.id_cuenta, idCuenta),
        gte(logLlamadas.ts, fromDate),
        lte(logLlamadas.ts, toDate),
        sql`${logLlamadas.tipo_evento} LIKE 'efectiva_%'`,
      )),
  ]);

  // AUT-603: Build set of lead keys with effective calls for real-interaction check
  const effectiveCallLeadKeys = new Set<string>();
  for (const c of effectiveCalls) {
    if (c.mail_lead?.trim()) effectiveCallLeadKeys.add(c.mail_lead.trim().toLowerCase());
    if (c.phone?.trim()) effectiveCallLeadKeys.add(c.phone.trim());
    if (c.contact_id_ghl?.trim()) effectiveCallLeadKeys.add(c.contact_id_ghl.trim());
  }

  const embudo = Array.isArray(cuentaRow?.embudo_personalizado)
    ? normalizeEmbudoEtapas(cuentaRow.embudo_personalizado)
    : null;

  // AUT-603: Check if a row has real interaction (Fathom or effective call)
  const rowHasRealInteraction = (r: (typeof rows)[0]): boolean => {
    if (r.transcripcion_fathom && r.transcripcion_fathom.trim() !== "") return true;
    if (r.link_llamada && r.link_llamada.trim() !== "") return true;
    if (r.email_lead?.trim() && effectiveCallLeadKeys.has(r.email_lead.trim().toLowerCase())) return true;
    if (r.idcliente?.trim() && effectiveCallLeadKeys.has(r.idcliente.trim())) return true;
    if (r.ghl_contact_id?.trim() && effectiveCallLeadKeys.has(r.ghl_contact_id.trim())) return true;
    return false;
  };

  const registros: ApiVideollamada[] = rows.map((r) => {
    const m = mapCategoria(r.categoria, embudo);
    const realInteraction = rowHasRealInteraction(r);
    return {
      id: r.id_registro_agenda,
      datetime: r.fecha_reunion?.toISOString() ?? r.fecha,
      leadName: r.nombre_de_lead,
      leadEmail: r.email_lead,
      idcliente: r.idcliente ?? null,
      ghl_contact_id: r.ghl_contact_id ?? null,
      closer: r.closer,
      closerCanonicalKey: null,
      categoria: r.categoria,
      attended: m.attended && realInteraction,
      qualified: m.qualified,
      canceled: m.canceled,
      outcome: m.outcome,
      facturacion: parseFloat(r.facturacion || "0") || 0,
      cashCollected: parseFloat(r.cash_collected || "0") || 0,
      resumenIa: r.resumen_ia,
      transcripcionFathom: r.transcripcion_fathom ?? null,
      linkLlamada: r.link_llamada,
      objeciones: Array.isArray(r.objeciones_ia) ? r.objeciones_ia : [],
      reportmarketing: r.reportmarketing,
      origen: r.origen,
      tags: r.tags,
      fathomReingestAt: r.fathom_reingest_at?.toISOString() ?? null,
      categoriaPrevia: r.categoria_previa ?? null,
      excludedFromDashboard: r.excluida_dashboard,
    };
  });

  const asistidas = registros.filter((r) => r.attended).length;
  // Deduplicar canceladas por lead único (igual que agendadas y noShows)
  const uniqueCanceledLeads = new Set(
    registros
      .filter((r) => r.canceled)
      .map((r) =>
        r.idcliente?.trim() ||
        r.ghl_contact_id?.trim() ||
        r.leadEmail?.trim().toLowerCase() ||
        `nokey_${r.id}`
      )
  );
  const canceladas = uniqueCanceledLeads.size;
  // Deduplicar no-shows por lead único. Excluir leads ya contados en canceladas para
  // evitar double-counting: un lead con registro no_show Y cancelada (rescheduled)
  // se cuenta solo en canceladas (estado más reciente/definitivo).
  // Mismo criterio que /dashboard para mantener consistencia entre vistas.
  const uniqueNoShowLeads = new Set(
    registros
      .filter((r) => r.outcome === "no_show")
      .map((r) =>
        r.idcliente?.trim() ||
        r.ghl_contact_id?.trim() ||
        r.leadEmail?.trim().toLowerCase() ||
        `nokey_${r.id}`
      )
      .filter((key) => !uniqueCanceledLeads.has(key))
  );
  const noShows = uniqueNoShowLeads.size;
  const efectivas = registros.filter((r) => r.attended && r.qualified).length;
  const cerradas = registros.filter((r) => r.outcome === "cerrado").length;
  // Solo sumar facturación de deals cerrados (consistente con /dashboard que usa closedSet)
  const registrosCerrados = registros.filter((r) => r.outcome === "cerrada" || r.outcome === "cerrado");
  const revenueFromClosed = registrosCerrados.reduce((s, r) => s + r.facturacion, 0);
  // Fallback: si ningún registro tiene outcome cerrado pero hay facturación, usar todos
  const revenue = revenueFromClosed > 0 ? revenueFromClosed : registros.reduce((s, r) => s + r.facturacion, 0);
  const cash = registros.reduce((s, r) => s + r.cashCollected, 0);

  // Leads únicos agendados: deduplicar por idcliente/email — mismo criterio que dashboard
  // IMPORTANTE: agendadas incluye TODOS los registros (asistidos, no-shows y cancelados)
  // para que se cumpla: agendadas = asistidas + noShows + canceladas + pendientes.
  // Antes excluíamos cancelados aquí, lo que causaba agendadas < suma de outcomes (AUT-208).
  const uniqueBookedLeads = new Set(
    registros
      .map((r) =>
        r.idcliente?.trim() ||
        r.ghl_contact_id?.trim() ||
        r.leadEmail?.trim().toLowerCase() ||
        `nokey_${r.id}`
      )
  );

  const agg = {
    agendadas: uniqueBookedLeads.size,
    asistidas,
    canceladas,
    efectivas,
    cerradas: registrosCerrados.length,
    noShows,
    revenue,
    cashCollected: cash,
    ticket: registrosCerrados.length > 0 ? Math.round(revenue / registrosCerrados.length) : 0,
  };

  // Cargar mapa nombre_closer → email para normalizar asesores que Fathom a veces
  // guarda como nombre y otras como email (mismo patrón que dashboard.ts:466-476).
  const usuariosNorm = await db
    .select({ email: usuariosDashboard.email, nombre_closer: usuariosDashboard.nombre_closer, nombre: usuariosDashboard.nombre })
    .from(usuariosDashboard)
    .where(eq(usuariosDashboard.id_cuenta, idCuenta));
  const nombreToEmail: Record<string, string> = {};
  const emailToNombre: Record<string, string> = {};
  for (const u of usuariosNorm) {
    if (!u.email) continue;
    const emailKey = u.email.trim().toLowerCase();
    const displayName = u.nombre_closer?.trim() ?? u.nombre?.trim();
    if (displayName) {
      emailToNombre[emailKey] = displayName;
      nombreToEmail[displayName.toLowerCase()] = emailKey;
    }
  }

  // Enrich with nombre_closer→closer_mail from log_llamadas (covers full names
  // like "Beatriz Jimenez" that usuarios_dashboard.nombre doesn't have)
  const closerPairs = await db
    .select({ nombre_closer: logLlamadas.nombre_closer, closer_mail: logLlamadas.closer_mail })
    .from(logLlamadas)
    .where(and(eq(logLlamadas.id_cuenta, idCuenta), isNotNull(logLlamadas.nombre_closer), isNotNull(logLlamadas.closer_mail)))
    .groupBy(logLlamadas.nombre_closer, logLlamadas.closer_mail);
  for (const p of closerPairs) {
    const name = p.nombre_closer?.trim().toLowerCase();
    const mail = p.closer_mail?.trim().toLowerCase();
    if (name && mail && !name.includes("@") && !nombreToEmail[name]) {
      nombreToEmail[name] = mail;
    }
  }

  // Canonical key: use email as the single source of truth.
  // rawCloser can be stored as a name ("Angel Llobet") or as an email
  // ("angel@serenthys.com") depending on the source system. We normalise
  // both to the email key so that duplicate rows caused by format differences
  // are merged into a single entry per advisor.
  function getCanonicalKey(rawCloser: string): string {
    const lc = rawCloser.toLowerCase().trim();
    // Already an email → use directly as canonical key
    if (lc.includes("@")) return lc;
    // Name → resolve to email via the lookup map; fall back to name itself
    return nombreToEmail[lc] ?? lc;
  }

  // Rellenar closerCanonicalKey ahora que getCanonicalKey está definido
  for (const r of registros) {
    r.closerCanonicalKey = r.closer?.trim() ? getCanonicalKey(r.closer.trim()) : null;
  }

  const byAdvisor: Record<string, ApiVideollamada[]> = {};
  for (const r of registros) {
    const rawCloser = r.closer?.trim();
    const key = rawCloser ? getCanonicalKey(rawCloser) : "Sin asignar";
    if (!byAdvisor[key]) byAdvisor[key] = [];
    byAdvisor[key].push(r);
  }

  const advisorMetrics: Record<string, VideollamadasAdvisorMetrics> = {};
  const advisors: ApiAdvisor[] = [];

  for (const [name, meetings] of Object.entries(byAdvisor)) {
    const asist = meetings.filter((m) => m.attended).length;
    const cerr = meetings.filter((m) => m.outcome === "cerrada" || m.outcome === "cerrado").length;
    // Deduplicar por asesor también. INCLUYE canceladas para alinear con el headline
    // agendadas (invariante AUT-208/AUT-701: una cita cancelada estuvo agendada).
    // Antes se excluían aquí, dejando el desglose per-asesor por debajo del headline
    // (AUT-1683). Un lead agendado con 2 closers suma en ambos ⇒ Opción A (Juan): cada
    // closer recibe crédito de su propia cita; la suma puede superar el headline.
    const uniqueBooked = new Set(
      meetings
        .map((m) => m.idcliente?.trim() || m.leadEmail?.trim().toLowerCase() || m.ghl_contact_id?.trim() || `nokey_${m.id}`)
    );
    // Omitir asesores sin actividad real (solo registros cancelados y sin asistencias)
    if (uniqueBooked.size === 0 && asist === 0) continue;

    advisorMetrics[name] = {
      advisorName: emailToNombre[name] ?? name,
      agendadas: uniqueBooked.size,
      asistencias: asist,
      cerradas: cerr,
      pctCierre: asist > 0 ? (cerr / asist) * 100 : 0,
      facturacion: meetings.filter((m) => m.outcome === "cerrada" || m.outcome === "cerrado").reduce((s, m) => s + m.facturacion, 0) || meetings.reduce((s, m) => s + m.facturacion, 0),
      cashCollected: meetings.reduce((s, m) => s + m.cashCollected, 0),
    };
    advisors.push({ id: name, name: emailToNombre[name] ?? name });
  }

  const configs: MetricaConfig[] = parseMetricasConfig(cuentaRow?.metricas_config);
  const manualData = (cuentaRow?.metricas_manual_data && typeof cuentaRow.metricas_manual_data === "object")
    ? (cuentaRow.metricas_manual_data as Record<string, { [k: string]: string | number | boolean | null }[]>)
    : {};
  const kpiKeysVideollamadas = new Set(["agendadas", "asistidas", "canceladas", "efectivas", "cerradas", "noShows", "revenue", "cashCollected", "ticket"]);
  const metricasValores: Record<string, string | number> = {};
  const metricasComputadas: { id: string; nombre: string; valor: string | number; descripcion?: string | null; ubicacion?: string }[] = [];

  const getDeps = (m: MetricaConfig): string[] => {
    if (m.tipo === "fija") return [];
    if (m.tipo !== "automatica" || !m.formula) return [];
    const f = m.formula;
    if (f.fuente && !kpiKeysVideollamadas.has(f.fuente)) return [f.fuente];
    if (f.fuentes) return f.fuentes.filter((k) => !kpiKeysVideollamadas.has(k));
    return [];
  };

  const sorted = [...configs]
    .filter((m) => m.ubicacion === "rendimiento" || m.ubicacion === "ambos" || m.paneles?.includes("rendimiento"))
    .sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));

  const webhookCampos = sorted.filter((m) => m.tipo === "webhook" && m.webhookCampo).map((m) => m.webhookCampo!);
  const webhookSumas: Record<string, number> = {};
  if (webhookCampos.length > 0) {
    const webhookRows = await db
      .select({ campo: metricasWebhook.campo, valor: metricasWebhook.valor, ghl_user_id: metricasWebhook.ghl_user_id })
      .from(metricasWebhook)
      .where(and(
        eq(metricasWebhook.id_cuenta, idCuenta),
        gte(metricasWebhook.fecha, dateFrom),
        lte(metricasWebhook.fecha, dateTo),
        isNull(metricasWebhook.ghl_user_id),
      ));
    for (const row of webhookRows) {
      webhookSumas[row.campo] = (webhookSumas[row.campo] ?? 0) + parseFloat(String(row.valor ?? 0));
    }
  }

  const metricaCtx: MetricaEngineContext = {
    id_cuenta: idCuenta,
    allConfigIds: new Set(configs.map((m) => m.id)),
  };
  const computed = new Set<string>();
  let pass = 0;
  const maxPasses = sorted.length + 1;

  while (computed.size < sorted.length && pass < maxPasses) {
    pass++;
    for (const m of sorted) {
      if (computed.has(m.id)) continue;
      const deps = getDeps(m);
      if (deps.some((d) => !computed.has(d))) continue;
      let valor: string | number;
      if (m.tipo === "fija") {
        valor = m.valorFijo ?? 0;
      } else if (m.tipo === "manual") {
        const entries = manualData[m.id] ?? [];
        valor = calcMetricaManual(m, entries, dateFrom, dateTo);
      } else if (m.tipo === "webhook") {
        valor = m.webhookCampo ? (webhookSumas[m.webhookCampo] ?? 0) : 0;
      } else {
        valor = calcMetricaAutomatica(m, agg as Record<string, number>, metricasValores, dateFrom, dateTo, metricaCtx);
      }
      metricasValores[m.id] = typeof valor === "number" ? valor : parseFloat(String(valor)) || 0;
      metricasComputadas.push({ id: m.id, nombre: m.nombre, valor, descripcion: m.descripcion, ubicacion: m.ubicacion });
      computed.add(m.id);
    }
  }

  for (const m of sorted) {
    if (computed.has(m.id)) continue;
    metricasComputadas.push({ id: m.id, nombre: m.nombre, valor: "—", descripcion: m.descripcion, ubicacion: m.ubicacion });
  }

  return { registros, agg, advisorMetrics, advisors, metricasComputadas };
}

export async function updateVideollamada(
  id: number,
  idCuenta: number,
  data: { nombre_lead?: string; closer?: string; estado?: string; facturacion?: number; cash_collected?: number },
): Promise<boolean> {
  const [row] = await db
    .select({ id: resumenesDiariosAgendas.id_registro_agenda, id_cuenta: resumenesDiariosAgendas.id_cuenta })
    .from(resumenesDiariosAgendas)
    .where(eq(resumenesDiariosAgendas.id_registro_agenda, id))
    .limit(1);

  if (!row || row.id_cuenta !== idCuenta) return false;

  const setClause: Record<string, unknown> = {};
  if (data.nombre_lead !== undefined) setClause.nombre_de_lead = data.nombre_lead;
  if (data.closer !== undefined) setClause.closer = data.closer;
  if (data.estado !== undefined) setClause.categoria = data.estado;
  if (data.facturacion !== undefined) setClause.facturacion = String(data.facturacion);
  if (data.cash_collected !== undefined) setClause.cash_collected = String(data.cash_collected);

  if (Object.keys(setClause).length > 0) {
    await db
      .update(resumenesDiariosAgendas)
      .set(setClause)
      .where(eq(resumenesDiariosAgendas.id_registro_agenda, id));
  }

  return true;
}

export async function toggleExcluirVideollamada(
  id: number,
  idCuenta: number,
  excluir: boolean,
): Promise<boolean> {
  const [row] = await db
    .select({ id: resumenesDiariosAgendas.id_registro_agenda, id_cuenta: resumenesDiariosAgendas.id_cuenta })
    .from(resumenesDiariosAgendas)
    .where(eq(resumenesDiariosAgendas.id_registro_agenda, id))
    .limit(1);

  if (!row || row.id_cuenta !== idCuenta) return false;

  await db
    .update(resumenesDiariosAgendas)
    .set({ excluida_dashboard: excluir })
    .where(eq(resumenesDiariosAgendas.id_registro_agenda, id));

  return true;
}
