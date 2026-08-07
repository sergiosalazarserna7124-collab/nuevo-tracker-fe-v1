import { db } from "@/lib/db";
import { logLlamadas, registrosDeLlamada, cuentas, normalizeEmbudoEtapas, resumenesDiariosAgendas, usuariosDashboard } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, or, inArray, isNull, isNotNull, gt } from "drizzle-orm";
import { zonedDayRange } from "@/lib/date-range";
import { mapCategoria } from "@/lib/queries/videollamadas";
import type {
  ApiLlamadaLog,
  LlamadaEnrichment,
  LlamadasAdvisorMetrics,
  LlamadasResponse,
  ApiAdvisor,
  LlamadaLead,
  ResumenLlamada,
} from "@/types";

const VOZ_CONTESTADA_ESTADOS = new Set([
  "interesado",
  "no_interesado",
  "reagendado",
  "no_elegible",
]);

export function esLlamadaContestada(tipoEvento: string, estadoResultado?: string | null): boolean {
  if (tipoEvento.startsWith("efectiva_")) return true;
  if (tipoEvento === "voz_callai" && estadoResultado && VOZ_CONTESTADA_ESTADOS.has(estadoResultado)) return true;
  return false;
}

function mapTipoEvento(tipo: string, estadoResultado?: string | null): ApiLlamadaLog["outcome"] {
  if (esLlamadaContestada(tipo, estadoResultado)) return "answered";
  if (tipo === "no_contesto") return "no_answer";
  if (tipo === "buzon" || (tipo === "voz_callai" && estadoResultado === "buzon_voz")) return "voicemail";
  if (tipo === "pdte") return "pending";
  return "no_answer";
}

export async function getLlamadas(
  idCuenta: number,
  dateFrom: string,
  dateTo: string,
  closerEmails?: string[],
  tipoEvento?: string[],
): Promise<LlamadasResponse> {
  const [tzRow] = await db.select({ zona_horaria_iana: cuentas.zona_horaria_iana }).from(cuentas).where(eq(cuentas.id_cuenta, idCuenta)).limit(1);
  const { fromDate: fromTs, toDate: toTs } = zonedDayRange(dateFrom, dateTo, tzRow?.zona_horaria_iana);
  const emails = (closerEmails ?? []).map((e) => e.trim()).filter(Boolean);
  const tipoEventos = (tipoEvento ?? []).map((t) => t.trim()).filter(Boolean);

  // Excluir "pdte" y "contacto_creado" — son eventos de lead nuevo, NO llamadas realizadas
  const conditions = [
    eq(logLlamadas.id_cuenta, idCuenta),
    gte(logLlamadas.ts, fromTs),
    lte(logLlamadas.ts, toTs),
    sql`${logLlamadas.tipo_evento} NOT IN ('pdte', 'contacto_creado')`,
  ];
  // Filtro por tipo de evento aplicado ANTES del mapeo (mapTipoEvento colapsa efectiva_* en "answered")
  if (tipoEventos.length > 0) {
    conditions.push(inArray(logLlamadas.tipo_evento, tipoEventos));
  }
  if (emails.length > 0) {
    conditions.push(
      sql`LOWER(TRIM(COALESCE(${logLlamadas.closer_mail}, ''))) IN (${sql.join(emails.map((e) => sql`LOWER(TRIM(${e}))`), sql`, `)})`,
    );
  }

  const idCuentaStr = String(idCuenta);

  const [rows, cuentaRow] = await Promise.all([
    db
      .select()
      .from(logLlamadas)
      .where(and(...conditions))
      .orderBy(sql`${logLlamadas.ts} DESC`),
    db
      .select({ fuente_llamadas: cuentas.fuente_llamadas, embudo_personalizado: cuentas.embudo_personalizado, tipos_eventos_config: cuentas.tipos_eventos_config })
      .from(cuentas)
      .where(eq(cuentas.id_cuenta, idCuenta))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const fuenteLlamadas: "twilio" | "ghl" = cuentaRow?.fuente_llamadas === "ghl" ? "ghl" : "twilio";

  // Extraer etapas del embudo para mostrar en el selector del modal de edición
  const embudoRaw = Array.isArray(cuentaRow?.embudo_personalizado) ? normalizeEmbudoEtapas(cuentaRow.embudo_personalizado) : [];
  const embudoEtapas = embudoRaw.map((e) => ({
    id: String(e.id ?? ""),
    nombre: String(e.nombre ?? e.id ?? ""),
  })).filter((e) => e.id);

  const tiposEventosConfig = Array.isArray(cuentaRow?.tipos_eventos_config)
    ? (cuentaRow.tipos_eventos_config as { id: string; nombre: string; activo: boolean }[])
    : [];

  // Los registros a mostrar son los que tuvieron al menos una llamada en el rango de fechas
  // (se usa log_llamadas.ts como fecha de actividad, no fecha_evento del lead)
  const idsConLlamadaEnRango = [...new Set(rows.map((r) => r.id_registro).filter((id): id is number => id != null && id > 0))];

  const baseReg = [
    eq(registrosDeLlamada.id_cuenta, idCuentaStr),
    // Excluir leads descartados (etiqueta no_trackearlead / descarte manual).
    sql`registros_de_llamada.excluido_metricas IS NOT TRUE`,
  ];

  const regRows =
    idsConLlamadaEnRango.length > 0
      ? // Siempre filtrar por IDs con llamadas en el rango — nunca traer
        // registros extra por byCloser (causaría inflado de asesores sin actividad en el rango)
        db
          .select()
          .from(registrosDeLlamada)
          .where(and(...baseReg, inArray(registrosDeLlamada.id_registro, idsConLlamadaEnRango)))
          .orderBy(sql`${registrosDeLlamada.fecha_evento} DESC`)
      : // Sin llamadas en el rango — devolver vacío
        db
          .select()
          .from(registrosDeLlamada)
          .where(and(...baseReg, sql`false`))
          .orderBy(sql`${registrosDeLlamada.fecha_evento} DESC`);

  const regRowsResolved = await regRows;

  const registros: ApiLlamadaLog[] = rows.map((r) => {
    const gem = r.gemini_enriquecimiento as Record<string, unknown> | null;
    const enrichment: LlamadaEnrichment | null = gem
      ? {
          tono_lead: (gem.tono_lead as string) ?? null,
          engagement: (gem.engagement as string) ?? null,
          recepcion_lead: (gem.recepcion_lead as string) ?? null,
          calidad_cierre: (gem.calidad_cierre as string) ?? null,
          aceptacion_propuesta: (gem.aceptacion_propuesta as string) ?? null,
          razon_calificacion: (gem.razon_calificacion as string) ?? null,
          frases_relevantes: Array.isArray(gem.frases_relevantes) ? (gem.frases_relevantes as string[]) : [],
        }
      : null;
    const rawObjeciones = r.ia_objeciones as { objecion: string; frase_textual?: string | null }[] | null;
    const objeciones = Array.isArray(rawObjeciones) && rawObjeciones.length > 0
      ? rawObjeciones.map((o) => ({ objecion: o.objecion, frase_textual: o.frase_textual ?? null }))
      : null;
    return {
      id: r.id,
      id_registro: r.id_registro != null && r.id_registro > 0 ? r.id_registro : null,
      datetime: r.ts.toISOString(),
      leadName: r.nombre_lead,
      leadEmail: r.mail_lead,
      phone: r.phone,
      closerMail: r.closer_mail,
      closerName: r.nombre_closer,
      tipoEvento: r.tipo_evento,
      outcome: mapTipoEvento(r.tipo_evento, r.estado_resultado),
      transcripcion: r.transcripcion,
      iaDescripcion: r.ia_descripcion,
      speedToLeadMinutes: r.speed_to_lead ? parseFloat(r.speed_to_lead) || null : null,
      creativoOrigen: r.creativo_origen,
      estadoResultado: r.estado_resultado ?? null,
      duracionSegundos: r.duracion_segundos ?? null,
      enrichment,
      objeciones,
      resumenLlamada: (r.resumen_llamada as ResumenLlamada | null) ?? null,
    };
  });

  const leadKey = (r: ApiLlamadaLog) =>
    (r.leadEmail?.trim() && r.leadEmail) || (r.phone?.trim() && r.phone) || `id:${r.id}`;
  const regLeadKey = (r: { mail_lead: string | null; phone_raw_format: string | null; id_registro: number }) =>
    (r.mail_lead?.trim() && r.mail_lead) || (r.phone_raw_format?.trim() && r.phone_raw_format) || `reg:${r.id_registro}`;
  const uniqueLeadsFromLog = new Set(registros.map(leadKey));
  const uniqueLeadsFromReg = new Set(regRowsResolved.map(regLeadKey));
  const uniqueLeads = new Set([...uniqueLeadsFromLog, ...uniqueLeadsFromReg]);
  const answered = registros.filter((r) => r.outcome === "answered").length;

  const speedVals = registros
    .filter((r) => r.speedToLeadMinutes != null)
    .map((r) => r.speedToLeadMinutes!);
  const speedFromReg = regRowsResolved
    .filter((r) => r.estado?.toUpperCase() !== "PDTE" && r.speed_to_lead != null && String(r.speed_to_lead).trim() !== "")
    .map((r) => parseFloat(String(r.speed_to_lead)) || 0)
    .filter((n) => !Number.isNaN(n) && n >= 0);
  const speedAvg =
    speedVals.length > 0
      ? speedVals.reduce((s, v) => s + v, 0) / speedVals.length
      : speedFromReg.length > 0
        ? speedFromReg.reduce((s, v) => s + v, 0) / speedFromReg.length
        : 0;

  // Intentos promedio: total llamadas / leads únicos con al menos una llamada
  const attemptsByLead: Record<string, number> = {};
  for (const r of registros) {
    const key = r.leadEmail ?? r.phone ?? String(r.id);
    attemptsByLead[key] = (attemptsByLead[key] ?? 0) + 1;
  }
  const leadKeys = Object.keys(attemptsByLead);
  const attemptsAvg = leadKeys.length > 0
    ? Object.values(attemptsByLead).reduce((s, v) => s + v, 0) / leadKeys.length
    : 0;

  // Intentos hasta primer contacto: cuántas llamadas se necesitaron hasta la primera efectiva
  // Solo cuenta leads que tuvieron al menos una llamada contestada
  const callsPerLead: Record<string, ApiLlamadaLog[]> = {};
  const sortedRegistros = [...registros].sort(
    (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
  );
  for (const r of sortedRegistros) {
    const key = r.leadEmail ?? r.phone ?? String(r.id);
    if (!callsPerLead[key]) callsPerLead[key] = [];
    callsPerLead[key].push(r);
  }
  const attemptsToFirstContact: number[] = [];
  for (const calls of Object.values(callsPerLead)) {
    const firstAnsweredIdx = calls.findIndex((c) => c.outcome === "answered");
    if (firstAnsweredIdx >= 0) {
      attemptsToFirstContact.push(firstAnsweredIdx + 1); // 1-indexed
    }
  }
  const firstContactAttempts =
    attemptsToFirstContact.length > 0
      ? attemptsToFirstContact.reduce((s, v) => s + v, 0) / attemptsToFirstContact.length
      : 0;

  // Classify unique leads as nuevo/reactivado using the SAME lead-key base as totalLeads.
  // A lead is "nuevo" if its earliest fecha_primera_llamada falls within the date range.
  const fechaPrimeraByLeadKey = new Map<string, Date>();
  for (const r of regRowsResolved) {
    const k = regLeadKey(r);
    const fp = r.fecha_primera_llamada;
    if (fp) {
      const prev = fechaPrimeraByLeadKey.get(k);
      if (!prev || fp < prev) fechaPrimeraByLeadKey.set(k, fp);
    }
  }

  const leadKeyIsNuevo = new Map<string, boolean>();
  for (const k of uniqueLeads) {
    const fp = fechaPrimeraByLeadKey.get(k);
    leadKeyIsNuevo.set(k, !!(fp && fp >= fromTs && fp <= toTs));
  }

  const leadsNuevosCount = [...leadKeyIsNuevo.values()].filter(Boolean).length;
  const leadsReactivadosCount = uniqueLeads.size - leadsNuevosCount;

  let contestadasNuevos = 0;
  let contestadasReactivados = 0;
  for (const r of registros) {
    if (r.outcome !== "answered") continue;
    const k = leadKey(r);
    if (leadKeyIsNuevo.get(k)) contestadasNuevos++;
    else contestadasReactivados++;
  }

  const answerRateNuevos = (() => {
    let callsN = 0;
    for (const r of registros) {
      if (leadKeyIsNuevo.get(leadKey(r))) callsN++;
    }
    return callsN > 0 ? contestadasNuevos / callsN : 0;
  })();

  const answerRateReactivados = (() => {
    let callsR = 0;
    for (const r of registros) {
      if (!leadKeyIsNuevo.get(leadKey(r))) callsR++;
    }
    return callsR > 0 ? contestadasReactivados / callsR : 0;
  })();

  const agg = {
    totalLeads: uniqueLeads.size,
    totalCalls: registros.length,
    answered,
    speedAvg,
    attemptsAvg,
    firstContactAttempts,
    answerRate: registros.length > 0 ? answered / registros.length : 0,
    leadsNuevos: leadsNuevosCount,
    leadsReactivados: leadsReactivadosCount,
    contestadasNuevos,
    contestadasReactivados,
    answerRateNuevos,
    answerRateReactivados,
  };

  // Normalizar key de asesor: email en minúsculas tiene prioridad sobre nombre
  // para evitar duplicados cuando el mismo asesor tiene registros con/sin email
  function normalizeAdvisorKey(mail?: string | null, name?: string | null): string {
    const emailNorm = mail?.trim().toLowerCase();
    if (emailNorm) return emailNorm;
    const nameNorm = name?.trim().toLowerCase();
    if (nameNorm) return nameNorm;
    return "sin asignar";
  }

  const byAdvisor: Record<string, ApiLlamadaLog[]> = {};
  for (const r of registros) {
    const key = normalizeAdvisorKey(r.closerMail, r.closerName);
    if (!byAdvisor[key]) byAdvisor[key] = [];
    byAdvisor[key].push(r);
  }

  const leadsCountByAdvisorKey: Record<string, number> = {};
  for (const r of regRowsResolved) {
    const kNorm = normalizeAdvisorKey(r.closer_mail, r.nombre_closer);
    leadsCountByAdvisorKey[kNorm] = (leadsCountByAdvisorKey[kNorm] ?? 0) + 1;
  }

  const advisorMetrics: Record<string, LlamadasAdvisorMetrics> = {};
  const advisors: ApiAdvisor[] = [];

  for (const [key, calls] of Object.entries(byAdvisor)) {
    // Preferir email real sobre el key normalizado para mostrar en UI
    const name = calls.find((c) => c.closerName)?.closerName ?? key;
    const email = calls.find((c) => c.closerMail)?.closerMail ?? key;
    const contest = calls.filter((c) => c.outcome === "answered").length;
    const speeds = calls
      .filter((c) => c.speedToLeadMinutes != null)
      .map((c) => c.speedToLeadMinutes!);
    // key ya viene normalizado (lowercase email o name)
    const leadsAsignados = leadsCountByAdvisorKey[key] ?? 0;

    advisorMetrics[key] = {
      advisorName: name,
      advisorEmail: email,
      llamadas: calls.length,
      contestadas: contest,
      pctContestacion: calls.length > 0 ? (contest / calls.length) * 100 : 0,
      tiempoAlLead: speeds.length > 0 ? speeds.reduce((s, v) => s + v, 0) / speeds.length : null,
      leadsAsignados,
      agendas: 0,
      asistencia: 0,
    };
    advisors.push({ id: key, name, email });
  }

  for (const keyNorm of Object.keys(leadsCountByAdvisorKey)) {
    if (advisorMetrics[keyNorm]) continue; // ya existe (key ya es normalizado)
    const firstReg = regRowsResolved.find(
      (r) => normalizeAdvisorKey(r.closer_mail, r.nombre_closer) === keyNorm,
    );
    const displayName = firstReg?.nombre_closer ?? keyNorm;
    const displayEmail = firstReg?.closer_mail ?? keyNorm;
    advisorMetrics[keyNorm] = {
      advisorName: displayName,
      advisorEmail: displayEmail,
      llamadas: 0,
      contestadas: 0,
      pctContestacion: 0,
      tiempoAlLead: null,
      leadsAsignados: leadsCountByAdvisorKey[keyNorm] ?? 0,
      agendas: 0,
      asistencia: 0,
    };
    advisors.push({
      id: keyNorm,
      name: displayName,
      email: displayEmail,
    });
  }

  // ── Agenda/asistencia per advisor (reuse videollamadas aggregation pattern) ──
  const PHONE_CALL_IA_PREFIX = "# Análisis de la Llamada Telefónica";
  const excludePhoneCalls = sql`NOT (${resumenesDiariosAgendas.fathom_recording_id} IS NULL AND ${resumenesDiariosAgendas.fathom_ingestion_source} IS NULL AND ${resumenesDiariosAgendas.resumen_ia} IS NOT NULL AND ${resumenesDiariosAgendas.resumen_ia} LIKE ${PHONE_CALL_IA_PREFIX + "%"})`;
  const fechaFilter = or(
    and(
      isNotNull(resumenesDiariosAgendas.fecha_reunion),
      gte(resumenesDiariosAgendas.fecha_reunion, fromTs),
      lte(resumenesDiariosAgendas.fecha_reunion, toTs),
    ),
    and(
      eq(resumenesDiariosAgendas.categoria, 'PDTE'),
      isNotNull(resumenesDiariosAgendas.fecha_reunion),
      gt(resumenesDiariosAgendas.fecha_reunion, sql`NOW()`),
      gte(resumenesDiariosAgendas.fecha, dateFrom),
      lte(resumenesDiariosAgendas.fecha, dateTo),
    ),
    and(
      isNull(resumenesDiariosAgendas.fecha_reunion),
      gte(resumenesDiariosAgendas.fecha, dateFrom),
      lte(resumenesDiariosAgendas.fecha, dateTo),
    ),
  ) ?? sql`TRUE`;

  const agendaConditions = [
    eq(resumenesDiariosAgendas.id_cuenta, idCuenta),
    fechaFilter,
    excludePhoneCalls,
    eq(resumenesDiariosAgendas.excluida_dashboard, false),
  ];
  if (emails.length > 0) {
    const usuariosNorm = await db
      .select({ email: usuariosDashboard.email, nombre_closer: usuariosDashboard.nombre_closer })
      .from(usuariosDashboard)
      .where(and(eq(usuariosDashboard.id_cuenta, idCuenta), inArray(usuariosDashboard.email, emails)));
    const closerValues = [...emails];
    for (const u of usuariosNorm) {
      if (u.nombre_closer) closerValues.push(u.nombre_closer);
    }
    agendaConditions.push(inArray(resumenesDiariosAgendas.closer, closerValues));
  }

  const agendaRows = await db
    .select({
      closer: resumenesDiariosAgendas.closer,
      categoria: resumenesDiariosAgendas.categoria,
      idcliente: resumenesDiariosAgendas.idcliente,
      ghl_contact_id: resumenesDiariosAgendas.ghl_contact_id,
      email_lead: resumenesDiariosAgendas.email_lead,
      id_registro_agenda: resumenesDiariosAgendas.id_registro_agenda,
      fathom_recording_id: resumenesDiariosAgendas.fathom_recording_id,
      fathom_ingestion_source: resumenesDiariosAgendas.fathom_ingestion_source,
      resumen_ia: resumenesDiariosAgendas.resumen_ia,
      transcripcion_fathom: resumenesDiariosAgendas.transcripcion_fathom,
      link_llamada: resumenesDiariosAgendas.link_llamada,
    })
    .from(resumenesDiariosAgendas)
    .where(and(...agendaConditions));

  // Build nombre→email map for canonical key resolution (same as videollamadas.ts)
  const allUsuarios = await db
    .select({ email: usuariosDashboard.email, nombre_closer: usuariosDashboard.nombre_closer, nombre: usuariosDashboard.nombre })
    .from(usuariosDashboard)
    .where(eq(usuariosDashboard.id_cuenta, idCuenta));
  const nombreToEmailMap: Record<string, string> = {};
  for (const u of allUsuarios) {
    if (!u.email) continue;
    const emailKey = u.email.trim().toLowerCase();
    const displayName = u.nombre_closer?.trim() ?? u.nombre?.trim();
    if (displayName) nombreToEmailMap[displayName.toLowerCase()] = emailKey;
  }
  // Enrich with nombre_closer→closer_mail from log_llamadas (covers full names
  // like "Beatriz Jimenez" that usuarios_dashboard.nombre doesn't have)
  for (const r of rows) {
    const mail = r.closer_mail?.trim().toLowerCase();
    const name = r.nombre_closer?.trim().toLowerCase();
    if (mail && name && !name.includes("@") && !nombreToEmailMap[name]) {
      nombreToEmailMap[name] = mail;
    }
  }
  function agendaCanonicalKey(rawCloser: string): string {
    const lc = rawCloser.toLowerCase().trim();
    if (lc.includes("@")) return lc;
    return nombreToEmailMap[lc] ?? lc;
  }

  // Build effective-call set for real-interaction check (same as videollamadas.ts)
  const effectiveCallLeadKeys = new Set<string>();
  for (const r of rows) {
    if (r.tipo_evento.startsWith("efectiva_")) {
      if (r.mail_lead?.trim()) effectiveCallLeadKeys.add(r.mail_lead.trim().toLowerCase());
      if (r.phone?.trim()) effectiveCallLeadKeys.add(r.phone.trim());
      if (r.contact_id_ghl?.trim()) effectiveCallLeadKeys.add(r.contact_id_ghl.trim());
    }
  }

  const [cuentaEmbudo] = await db
    .select({ embudo_personalizado: cuentas.embudo_personalizado })
    .from(cuentas)
    .where(eq(cuentas.id_cuenta, idCuenta))
    .limit(1);
  const embudoNorm = Array.isArray(cuentaEmbudo?.embudo_personalizado)
    ? normalizeEmbudoEtapas(cuentaEmbudo.embudo_personalizado)
    : [];

  function isAttended(cat: string | null, row: typeof agendaRows[0]): boolean {
    const m = mapCategoria(cat, embudoNorm.length > 0 ? embudoNorm : null);
    if (!m.attended) return false;
    const hasTranscript = (row.transcripcion_fathom && row.transcripcion_fathom.trim() !== "") || (row.link_llamada && row.link_llamada.trim() !== "");
    const hasEffectiveCall = (row.email_lead?.trim() && effectiveCallLeadKeys.has(row.email_lead.trim().toLowerCase())) ||
      (row.idcliente?.trim() && effectiveCallLeadKeys.has(row.idcliente.trim())) ||
      (row.ghl_contact_id?.trim() && effectiveCallLeadKeys.has(row.ghl_contact_id.trim()));
    return !!(hasTranscript || hasEffectiveCall);
  }

  // Group agenda rows by advisor and compute agendas/asistencia
  const agendaByAdvisor: Record<string, { booked: Set<string>; attended: number }> = {};
  for (const r of agendaRows) {
    const rawCloser = r.closer?.trim();
    const key = rawCloser ? agendaCanonicalKey(rawCloser) : "sin asignar";
    if (!agendaByAdvisor[key]) agendaByAdvisor[key] = { booked: new Set(), attended: 0 };
    const cl = r.categoria?.trim().toLowerCase() ?? "";
    const isCanceled = cl === "cancelada" || cl.includes("cancel");
    if (!isCanceled) {
      const leadKey = r.idcliente?.trim() || r.ghl_contact_id?.trim() || r.email_lead?.trim().toLowerCase() || `nokey_${r.id_registro_agenda}`;
      agendaByAdvisor[key].booked.add(leadKey);
    }
    if (isAttended(r.categoria, r)) {
      agendaByAdvisor[key].attended++;
    }
  }

  // Merge agenda data into advisorMetrics
  for (const [advKey, agData] of Object.entries(agendaByAdvisor)) {
    if (advisorMetrics[advKey]) {
      advisorMetrics[advKey].agendas = agData.booked.size;
      advisorMetrics[advKey].asistencia = agData.attended;
    } else {
      // Advisor only has agendas, no calls — still show them
      advisorMetrics[advKey] = {
        advisorName: advKey,
        advisorEmail: advKey,
        llamadas: 0,
        contestadas: 0,
        pctContestacion: 0,
        tiempoAlLead: null,
        leadsAsignados: 0,
        agendas: agData.booked.size,
        asistencia: agData.attended,
      };
      advisors.push({ id: advKey, name: advKey, email: advKey });
    }
  }

  const leads: LlamadaLead[] = regRowsResolved.map((r) => ({
    id_registro: r.id_registro,
    nombre_lead: r.nombre_lead,
    mail_lead: r.mail_lead,
    estado: r.estado,
    phone: r.phone_raw_format,
    speed_to_lead_min: r.speed_to_lead ? parseFloat(r.speed_to_lead) || null : null,
    closer_mail: r.closer_mail,
    fecha_evento: r.fecha_evento?.toISOString() ?? null,
    id_user_ghl: r.id_user_ghl ?? null,
  }));

  // Leads pendientes por llamar: estado PDTE y fecha_evento en el rango de fechas.
  // Estos NO aparecen en log_llamadas (solo tienen evento 'pdte'/'contacto_creado' que
  // filtramos arriba), por lo que necesitan su propia consulta.
  const pendingConditions: Parameters<typeof and>[0][] = [
    eq(registrosDeLlamada.id_cuenta, idCuentaStr),
    sql`registros_de_llamada.excluido_metricas IS NOT TRUE`,
    sql`UPPER(TRIM(${registrosDeLlamada.estado})) = 'PDTE'`,
    gte(registrosDeLlamada.fecha_evento, fromTs),
    lte(registrosDeLlamada.fecha_evento, toTs),
  ];
  // Aplicar el mismo filtro de closer_mail que usamos en logLlamadas.
  // Sin esto, asesores sin permiso ver_todo ven pendientes de todos sus colegas.
  if (emails.length > 0) {
    pendingConditions.push(
      sql`LOWER(TRIM(COALESCE(${registrosDeLlamada.closer_mail}, ''))) IN (${sql.join(emails.map((e) => sql`LOWER(TRIM(${e}))`), sql`, `)})`,
    );
  }
  const pendingRows = await db
    .select()
    .from(registrosDeLlamada)
    .where(and(...pendingConditions))
    .orderBy(sql`${registrosDeLlamada.fecha_evento} DESC`);

  const pendingLeads: LlamadaLead[] = pendingRows.map((r) => ({
    id_registro: r.id_registro,
    nombre_lead: r.nombre_lead,
    mail_lead: r.mail_lead,
    estado: r.estado,
    phone: r.phone_raw_format,
    speed_to_lead_min: null,
    closer_mail: r.closer_mail,
    fecha_evento: r.fecha_evento?.toISOString() ?? null,
    id_user_ghl: r.id_user_ghl ?? null,
  }));

  return { registros, leads, pendingLeads, agg, advisorMetrics, advisors, fuente_llamadas: fuenteLlamadas, embudoEtapas, tipos_eventos_config: tiposEventosConfig };
}

export async function updateLlamada(
  id: number,
  idCuenta: number,
  data: { nombre_lead?: string; closer?: string; estado?: string },
): Promise<boolean> {
  const [row] = await db
    .select({ id: logLlamadas.id, id_cuenta: logLlamadas.id_cuenta, id_registro: logLlamadas.id_registro })
    .from(logLlamadas)
    .where(eq(logLlamadas.id, id))
    .limit(1);

  if (!row || row.id_cuenta !== idCuenta) return false;

  const setClause: Record<string, unknown> = {};
  if (data.nombre_lead !== undefined) setClause.nombre_lead = data.nombre_lead;
  if (data.closer !== undefined) {
    setClause.closer_mail = data.closer;
    setClause.nombre_closer = data.closer;
  }
  if (data.estado !== undefined) setClause.estado_resultado = data.estado;

  if (Object.keys(setClause).length > 0) {
    await db.update(logLlamadas).set(setClause).where(eq(logLlamadas.id, id));
  }

  if (row.id_registro && (data.nombre_lead || data.closer || data.estado)) {
    const regSet: Record<string, unknown> = {};
    if (data.nombre_lead) regSet.nombre_lead = data.nombre_lead;
    if (data.closer) {
      regSet.closer_mail = data.closer;
      regSet.nombre_closer = data.closer;
    }
    if (data.estado) regSet.estado = data.estado;
    await db.update(registrosDeLlamada).set(regSet).where(eq(registrosDeLlamada.id_registro, row.id_registro));
  }

  return true;
}

export type RegistroLlamadaUpdate = {
  nombre_lead?: string;
  mail_lead?: string;
  phone_raw_format?: string;
  estado?: string;
  closer_mail?: string;
  nombre_closer?: string;
  id_user_ghl?: string;
};

export async function updateRegistroLlamada(
  id_registro: number,
  idCuenta: number,
  data: RegistroLlamadaUpdate,
): Promise<boolean> {
  const [row] = await db
    .select({ id_registro: registrosDeLlamada.id_registro, id_cuenta: registrosDeLlamada.id_cuenta })
    .from(registrosDeLlamada)
    .where(eq(registrosDeLlamada.id_registro, id_registro))
    .limit(1);

  if (!row) return false;
  const cuentaNum = parseInt(String(row.id_cuenta), 10);
  if (Number.isNaN(cuentaNum) || cuentaNum !== idCuenta) return false;

  const setClause: Record<string, unknown> = {};
  if (data.nombre_lead !== undefined) setClause.nombre_lead = data.nombre_lead;
  if (data.mail_lead !== undefined) setClause.mail_lead = data.mail_lead;
  if (data.phone_raw_format !== undefined) setClause.phone_raw_format = data.phone_raw_format;
  if (data.estado !== undefined) setClause.estado = data.estado;
  if (data.closer_mail !== undefined) {
    setClause.closer_mail = data.closer_mail;
    setClause.nombre_closer = data.nombre_closer ?? data.closer_mail;
  }
  if (data.nombre_closer !== undefined) setClause.nombre_closer = data.nombre_closer;
  if (data.id_user_ghl !== undefined) setClause.id_user_ghl = data.id_user_ghl;

  if (Object.keys(setClause).length > 0) {
    await db.update(registrosDeLlamada).set(setClause).where(eq(registrosDeLlamada.id_registro, id_registro));
  }

  if (data.closer_mail !== undefined || data.nombre_lead !== undefined || data.estado !== undefined) {
    const logSet: Record<string, unknown> = {};
    if (data.nombre_lead !== undefined) logSet.nombre_lead = data.nombre_lead;
    if (data.closer_mail !== undefined) {
      logSet.closer_mail = data.closer_mail;
      logSet.nombre_closer = data.nombre_closer ?? data.closer_mail;
    }
    if (data.estado !== undefined) logSet.estado_resultado = data.estado;
    if (Object.keys(logSet).length > 0) {
      await db.update(logLlamadas).set(logSet).where(eq(logLlamadas.id_registro, id_registro));
    }
  }

  return true;
}

export async function deleteRegistroLlamada(id_registro: number, idCuenta: number): Promise<boolean> {
  const [row] = await db
    .select({ id_registro: registrosDeLlamada.id_registro, id_cuenta: registrosDeLlamada.id_cuenta })
    .from(registrosDeLlamada)
    .where(eq(registrosDeLlamada.id_registro, id_registro))
    .limit(1);

  if (!row) return false;
  const cuentaNum = parseInt(String(row.id_cuenta), 10);
  if (Number.isNaN(cuentaNum) || cuentaNum !== idCuenta) return false;

  await db.delete(registrosDeLlamada).where(eq(registrosDeLlamada.id_registro, id_registro));
  return true;
}
