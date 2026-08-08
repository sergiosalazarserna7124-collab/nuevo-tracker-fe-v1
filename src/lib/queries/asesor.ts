import { db } from "@/lib/db";
import { logLlamadas, registrosDeLlamada, resumenesDiariosAgendas, chatsLogs, cuentas, usuariosDashboard, metricasWebhook, normalizeEmbudoEtapas } from "@/lib/db/schema";
import type { EmbudoEtapa, MetricaConfig } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, or, isNull, isNotNull, inArray } from "drizzle-orm";
import { zonedDayRange } from "@/lib/date-range";
import { agendaDedupKey } from "./agenda-dedup-key";
import type {
  AsesorKpis,
  AsesorLeadCRM,
  AsesorVideollamada,
  AsesorChat,
  AsesorMetricaCustom,
  AsesorCanales,
  AsesorResponse,
  AsesorBreakdown,
  ApiAdvisor,
} from "@/types";

// ─── Normalización de estados ────────────────────────────────────────────────
// Convierte cualquier valor de estado (con basura de GHL) al canónico

type EstadoNormalizado = AsesorLeadCRM["estadoNormalizado"];

function normalizarEstado(estado: string | null): EstadoNormalizado {
  if (!estado) return "pendiente";
  // Limpiar: quitar llaves {valor} que GHL a veces manda
  const limpio = estado.replace(/^\{(.+)\}$/, "$1").trim().toLowerCase();

  if (limpio === "pdte" || limpio === "pendiente") return "pendiente";
  if (["no_contestado", "no_contesto", "nocontest", "no_contestada", "no contestado"].includes(limpio)) return "no_contesto";
  if (limpio === "buzon" || limpio === "buzón") return "buzon";
  if (limpio.startsWith("seguimiento")) return "seguimiento"; // seguimiento, seguimiento_1..10
  if (limpio === "interesado") return "interesado";
  if (limpio === "programado") return "programado";
  // Embudo viejo con prefijo "default-" (High-Line y otros clientes migrados)
  if (limpio === "calificada" || limpio === "default-agendada" || limpio === "default-asistida" || limpio === "default-ofertada") return "calificada";
  if (limpio === "no_calificada") return "no_calificada";
  if (limpio === "cerrada" || limpio === "complet") return "cerrada";
  if (["no_interesado", "no interesado", "perdido", "perdida"].includes(limpio)) return "no_interesado";
  if (limpio === "no_show" || limpio === "default-no-show") return "no_contesto"; // en llamadas, no_show = no contestó la cita
  if (limpio === "cancelada" || limpio === "default-cancelada") return "no_interesado";
  return "otro";
}

// ─── Resolver nombre→email y email→nombre para matching cross-canal ──────────

async function buildCloserMaps(idCuenta: number): Promise<{
  emailToNombre: Record<string, string>;
  nombreToEmail: Record<string, string>;
}> {
  const usuarios = await db
    .select({ email: usuariosDashboard.email, nombre_closer: usuariosDashboard.nombre_closer })
    .from(usuariosDashboard)
    .where(and(eq(usuariosDashboard.id_cuenta, idCuenta)));

  const emailToNombre: Record<string, string> = {};
  const nombreToEmail: Record<string, string> = {};

  for (const u of usuarios) {
    if (u.email && u.nombre_closer) {
      emailToNombre[u.email.toLowerCase()] = u.nombre_closer;
      nombreToEmail[u.nombre_closer.toLowerCase()] = u.email;
    }
  }

  const pares = await db
    .selectDistinct({ email: logLlamadas.closer_mail, nombre: logLlamadas.nombre_closer })
    .from(logLlamadas)
    .where(and(
      eq(logLlamadas.id_cuenta, idCuenta),
      isNotNull(logLlamadas.closer_mail),
      isNotNull(logLlamadas.nombre_closer),
    ));
  for (const p of pares) {
    if (!p.email || !p.nombre) continue;
    const e = p.email.toLowerCase();
    const n = p.nombre.toLowerCase();
    if (!emailToNombre[e]) emailToNombre[e] = p.nombre;
    if (!nombreToEmail[n]) nombreToEmail[n] = p.email;
  }

  return { emailToNombre, nombreToEmail };
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function getAsesorData(
  idCuenta: number,
  dateFrom: string,
  dateTo: string,
  advisorEmails?: string[],
): Promise<AsesorResponse> {
  const emails = (advisorEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);

  // ── Cargar cuenta + embudo + métricas config ────────────────────────────────
  const [cuentaRow] = await db
    .select({
      fuente_llamadas: cuentas.fuente_llamadas,
      ghl_location_id: cuentas.ghl_location_id,
      locationid: cuentas.locationid,
      embudo_personalizado: cuentas.embudo_personalizado,
      metricas_config: cuentas.metricas_config,
      configuracion_ui: cuentas.configuracion_ui,
      zona_horaria_iana: cuentas.zona_horaria_iana,
    })
    .from(cuentas)
    .where(eq(cuentas.id_cuenta, idCuenta))
    .limit(1);

  const { fromDate: fromTs, toDate: toTs } = zonedDayRange(dateFrom, dateTo, cuentaRow?.zona_horaria_iana);

  const fuenteLlamadas: "twilio" | "ghl" = cuentaRow?.fuente_llamadas === "ghl" ? "ghl" : "twilio";
  const ghlLocationId = cuentaRow?.ghl_location_id ?? cuentaRow?.locationid ?? null;
  const embudo = Array.isArray(cuentaRow?.embudo_personalizado)
    ? normalizeEmbudoEtapas(cuentaRow.embudo_personalizado)
    : [];

  // ── Mapas de nombre ↔ email ─────────────────────────────────────────────────
  const { emailToNombre, nombreToEmail } = await buildCloserMaps(idCuenta);

  // Para filtrar por asesor: emails seleccionados + sus nombres alternativos
  const emailsLower = emails.map((e) => e.toLowerCase());
  const nombresFromEmails = emailsLower
    .map((e) => emailToNombre[e])
    .filter((n): n is string => !!n)
    .map((n) => n.toLowerCase());

  const idCuentaStr = String(idCuenta);

  // ── Leads cuyo dueño (registros_de_llamada.closer_mail) es el asesor ────────
  // AUT-1902: log_llamadas es histórico inmutable — no se reescribe al asignar el
  // contacto, así que los eventos previos a la asignación traen closer_mail NULL.
  // Sin este fallback el asesor veía 0 leads/0 llamadas aunque el ranking (y el
  // dinero entrante, atribuido vía registros_de_llamada) sí le contaran el lead.
  const ownedLeadRefs = emailsLower.length > 0
    ? await db.execute(sql`
        SELECT DISTINCT ghl_contact_id, mail_lead, phone_raw_format
        FROM registros_de_llamada
        WHERE id_cuenta = ${idCuentaStr}
          AND LOWER(TRIM(COALESCE(closer_mail, ''))) IN (${sql.join(emailsLower.map((e) => sql`${e}`), sql`, `)})
      `).then((r) => r.rows as Array<{ ghl_contact_id: string | null; mail_lead: string | null; phone_raw_format: string | null }>)
    : [];
  const ownedContactIds = [...new Set(ownedLeadRefs.map((r) => r.ghl_contact_id?.trim()).filter((v): v is string => !!v))];
  const ownedMails = [...new Set(ownedLeadRefs.map((r) => r.mail_lead?.trim().toLowerCase()).filter((v): v is string => !!v))];
  const ownedPhones = [...new Set(ownedLeadRefs.map((r) => r.phone_raw_format?.trim()).filter((v): v is string => !!v))];

  /** Condición SQL "este evento pertenece a un lead del asesor" (o al asesor directo). */
  const ownedLeadMatch = (
    contactCol: ReturnType<typeof sql> | null,
    mailCol: ReturnType<typeof sql> | null,
    phoneCol: ReturnType<typeof sql> | null,
  ) => {
    const parts = [];
    if (contactCol && ownedContactIds.length > 0) parts.push(sql`TRIM(COALESCE(${contactCol}, '')) IN (${sql.join(ownedContactIds.map((v) => sql`${v}`), sql`, `)})`);
    if (mailCol && ownedMails.length > 0) parts.push(sql`LOWER(TRIM(COALESCE(${mailCol}, ''))) IN (${sql.join(ownedMails.map((v) => sql`${v}`), sql`, `)})`);
    if (phoneCol && ownedPhones.length > 0) parts.push(sql`TRIM(COALESCE(${phoneCol}, '')) IN (${sql.join(ownedPhones.map((v) => sql`${v}`), sql`, `)})`);
    return parts.length > 0 ? sql`(${sql.join(parts, sql` OR `)})` : null;
  };

  // ── LLAMADAS: log_llamadas ──────────────────────────────────────────────────
  const callConditions = [
    eq(logLlamadas.id_cuenta, idCuenta),
    gte(logLlamadas.ts, fromTs),
    lte(logLlamadas.ts, toTs),
    // Excluir pdte/contacto_creado — son leads nuevos, no llamadas realizadas
    sql`${logLlamadas.tipo_evento} NOT IN ('pdte', 'contacto_creado')`,
  ];
  if (emailsLower.length > 0) {
    const byCloser = sql`LOWER(TRIM(COALESCE(${logLlamadas.closer_mail}, ''))) IN (${sql.join(emailsLower.map((e) => sql`${e}`), sql`, `)})`;
    // Solo caen al dueño del lead los eventos SIN closer propio: si la llamada dice
    // quién la hizo, esa atribución manda.
    const sinCloser = sql`COALESCE(TRIM(${logLlamadas.closer_mail}), '') = ''`;
    const owned = ownedLeadMatch(
      sql`${logLlamadas.contact_id_ghl}`,
      sql`${logLlamadas.mail_lead}`,
      sql`${logLlamadas.phone}`,
    );
    callConditions.push(owned ? sql`(${byCloser} OR (${sinCloser} AND ${owned}))` : byCloser);
  }

  const callRows = await db
    .select()
    .from(logLlamadas)
    .where(and(...callConditions))
    .orderBy(sql`${logLlamadas.ts} DESC`);

  // ── LLAMADAS: registros_de_llamada CON filtro de fecha ────────────────────
  const regRows = await (async () => {
    const baseCond = and(
      eq(registrosDeLlamada.id_cuenta, idCuentaStr),
      // Aplicar filtro de fecha (fecha_evento dentro del rango)
      gte(registrosDeLlamada.fecha_evento, fromTs),
      lte(registrosDeLlamada.fecha_evento, toTs),
    )!;

    if (emailsLower.length === 0) {
      return db.select().from(registrosDeLlamada).where(baseCond).orderBy(sql`${registrosDeLlamada.fecha_evento} DESC`);
    }

    const callRegistroIds = [...new Set(callRows.map((c) => c.id_registro).filter((id): id is number => id != null && id > 0))];
    const byCloser = sql`LOWER(TRIM(COALESCE(${registrosDeLlamada.closer_mail}, ''))) IN (${sql.join(emailsLower.map((e) => sql`${e}`), sql`, `)})`;
    const byLinkedCall = callRegistroIds.length > 0 ? inArray(registrosDeLlamada.id_registro, callRegistroIds) : sql`false`;

    return db
      .select()
      .from(registrosDeLlamada)
      .where(and(baseCond, or(byCloser, byLinkedCall))!)
      .orderBy(sql`${registrosDeLlamada.fecha_evento} DESC`);
  })();

  // ── VIDEOLLAMADAS: resumenes_diarios_agendas ──────────────────────────────
  // Mostrar agendas si hay datos, independientemente de si Fathom está configurado.
  // Las agendas pueden provenir de GHL webhooks, Twilio, u otras fuentes (no solo Fathom).

  const agendaRows = await (async () => {

    const fechaFilterAgendas = or(
      and(isNotNull(resumenesDiariosAgendas.fecha_reunion), gte(resumenesDiariosAgendas.fecha_reunion, fromTs), lte(resumenesDiariosAgendas.fecha_reunion, toTs)),
      and(isNull(resumenesDiariosAgendas.fecha_reunion), gte(resumenesDiariosAgendas.fecha, dateFrom), lte(resumenesDiariosAgendas.fecha, dateTo)),
    )!;

    const agendaConditions = [eq(resumenesDiariosAgendas.id_cuenta, idCuenta), fechaFilterAgendas];
    if (emailsLower.length > 0 || nombresFromEmails.length > 0) {
      const allCloserValues = [...emailsLower, ...nombresFromEmails];
      const byCloser = sql`LOWER(TRIM(COALESCE(${resumenesDiariosAgendas.closer}, ''))) IN (${sql.join(allCloserValues.map((v) => sql`${v}`), sql`, `)})`;
      const sinCloser = sql`COALESCE(TRIM(${resumenesDiariosAgendas.closer}), '') = ''`;
      const owned = ownedLeadMatch(
        sql`${resumenesDiariosAgendas.ghl_contact_id}`,
        sql`${resumenesDiariosAgendas.email_lead}`,
        null,
      );
      agendaConditions.push(owned ? sql`(${byCloser} OR (${sinCloser} AND ${owned}))` : byCloser);
    }

    return db.select().from(resumenesDiariosAgendas).where(and(...agendaConditions));
  })();

  // ── CHATS: chats_logs ─────────────────────────────────────────────────────
  // notas_extra = nombre del closer (NO email) — resolver usando nombreFromEmails
  const chatConditions = [
    eq(chatsLogs.id_cuenta, idCuenta),
    gte(chatsLogs.fecha_y_hora_z, fromTs),
    lte(chatsLogs.fecha_y_hora_z, toTs),
  ];
  const chatCloserValues = emailsLower.length > 0
    ? [...emailsLower, ...nombresFromEmails]
    : [];
  if (chatCloserValues.length > 0) {
    const byCloser = sql`LOWER(TRIM(COALESCE(${chatsLogs.notas_extra}, ''))) IN (${sql.join(chatCloserValues.map((v) => sql`${v}`), sql`, `)})`;
    const sinCloser = sql`COALESCE(TRIM(${chatsLogs.notas_extra}), '') = '' AND COALESCE(TRIM(${chatsLogs.asesor_asignado}), '') = ''`;
    const owned = ownedLeadMatch(sql`${chatsLogs.id_lead}`, null, null);
    chatConditions.push(owned ? sql`(${byCloser} OR (${sinCloser} AND ${owned}))` : byCloser);
  }
  const chatsRows = await db.select().from(chatsLogs).where(and(...chatConditions));

  // ── MÉTRICAS CUSTOM atribuibles al asesor ────────────────────────────────
  const metricasConfig = Array.isArray(cuentaRow?.metricas_config)
    ? (cuentaRow.metricas_config as MetricaConfig[])
    : [];
  const metricasAtribuibles = metricasConfig.filter((m) => m.atribuible_a_usuario && m.webhookCampo);

  // Obtener valores de metricas_webhook por asesor (ghl_user_id)
  // ghl_user_id mapea al asesor — para filtrar necesitamos mapear email → ghl_user_id
  // Por ahora: si hay emails filtrados, filtrar por los que tengan ese closer
  const metricasRows = metricasAtribuibles.length > 0
    ? await db.execute(sql`
        SELECT campo, SUM(valor) as total
        FROM metricas_webhook
        WHERE id_cuenta = ${idCuenta}
          AND fecha BETWEEN ${dateFrom}::date AND ${dateTo}::date
          ${emailsLower.length > 0
            ? sql`AND LOWER(TRIM(COALESCE(ghl_user_id, ''))) IN (${sql.join(emailsLower.map((e) => sql`${e}`), sql`, `)})`
            : sql``
          }
        GROUP BY campo
      `).then((r) => r.rows as Array<{ campo: string; total: string }>)
    : [];

  const metricasSumaMap: Record<string, number> = {};
  for (const r of metricasRows) {
    metricasSumaMap[r.campo] = Number(r.total ?? 0);
  }

  // ── Excluir leads marcados como excluido_metricas de los KPIs ─────────────
  // Column may not exist yet — query safely with raw SQL
  const excludedRegIds: Set<number> = await (async () => {
    try {
      const rows = await db.execute(sql`
        SELECT id_registro FROM registros_de_llamada
        WHERE id_cuenta = ${idCuentaStr}
          AND excluido_metricas = true
      `);
      return new Set((rows.rows as Array<{ id_registro: number }>).map((r) => r.id_registro));
    } catch {
      return new Set<number>();
    }
  })();
  const regRowsForKpi = regRows.filter((r) => !excludedRegIds.has(r.id_registro));
  const callRowsForKpi = callRows.filter((c) => !c.id_registro || !excludedRegIds.has(c.id_registro));

  // ── CALCULAR KPIs ─────────────────────────────────────────────────────────
  const contestadas = callRowsForKpi.filter((c) => c.tipo_evento.startsWith("efectiva_")).length;

  // leadsAsignados = leads únicos — alineado con dashboard.ts advisorRanking (AUT-1889)
  const leadKeyFromCall = (c: { mail_lead: string | null; phone: string | null; contact_id_ghl?: string | null; id: number }) =>
    c.mail_lead?.trim().toLowerCase() || c.phone?.trim() || c.contact_id_ghl?.trim() || String(c.id);
  const leadKeyFromAgenda = (a: { idcliente?: string | null; ghl_contact_id?: string | null; email_lead: string | null; id_registro_agenda: number }) =>
    agendaDedupKey(a);
  const leadKeyFromReg = (r: { mail_lead: string | null; phone_raw_format: string | null; id_registro: number }) =>
    r.mail_lead?.trim().toLowerCase() || r.phone_raw_format?.trim() || `reg:${r.id_registro}`;

  const leadsFromCalls = new Set(callRowsForKpi.map(leadKeyFromCall).filter(Boolean));
  const leadsFromAgendas = new Set(agendaRows.map(leadKeyFromAgenda).filter(Boolean));
  const leadsFromRegistros = new Set(regRowsForKpi.map(leadKeyFromReg).filter(Boolean));
  const allLeads = new Set([...leadsFromCalls, ...leadsFromAgendas]);

  // KPIs de videollamadas
  const videoAsistidas = agendaRows.filter((a) => {
    const cat = (a.categoria ?? "").toLowerCase();
    return cat !== "cancelada" && cat !== "no_show" && cat !== "pdte" && cat !== "";
  }).length;
  const videoCalificadas = agendaRows.filter((a) => {
    const cat = (a.categoria ?? "").toLowerCase();
    return ["calificada", "cerrada"].includes(cat) || embudo.find((e) => e.id === cat)?.es_calificada;
  }).length;
  const videoCerradas = agendaRows.filter((a) => (a.categoria ?? "").toLowerCase() === "cerrada").length;
  const videoNoShows = agendaRows.filter((a) => (a.categoria ?? "").toLowerCase() === "no_show").length;
  const videoCanceladas = agendaRows.filter((a) => {
    const cat = (a.categoria ?? "").toLowerCase();
    return cat === "cancelada" || cat === "cancelada";
  }).length;

  // KPIs de chats
  const chatsConRespuesta = chatsRows.filter((ch) => {
    const chatData = ch.chat as { role?: string }[] | null;
    return Array.isArray(chatData) && chatData.some((m) => m?.role === "agent");
  }).length;

  // Speed to lead en chats — usar primer_msg_lead_at (AUT-153) en lugar de JSONB.
  // NULL = sin mensajes inbound del lead → excluir. Fuera del rango → excluir.
  let speedChatSum = 0;
  let speedChatCount = 0;
  for (const ch of chatsRows) {
    if (ch.primer_msg_lead_at == null) continue;
    if (ch.primer_msg_lead_at < fromTs) continue;
    const msgs = (ch.chat as { role?: string; timestamp?: string }[] | null) ?? [];
    const firstAgent = msgs.find((m) => m.role === "agent");
    if (firstAgent?.timestamp) {
      const diff = (new Date(firstAgent.timestamp).getTime() - ch.primer_msg_lead_at.getTime()) / 1000;
      if (diff > 0) { speedChatSum += diff; speedChatCount++; }
    }
  }

  const kpis: AsesorKpis = {
    leadsAsignados: allLeads.size,
    llamadasRealizadas: callRowsForKpi.length,
    llamadasContestadas: contestadas,
    tasaContacto: callRowsForKpi.length > 0 ? Math.min(100, (contestadas / callRowsForKpi.length) * 100) : 0,
    reunionesAgendadas: new Set(agendaRows.map(agendaDedupKey)).size,
    reunionesAsistidas: videoAsistidas,
    reunionesCalificadas: videoCalificadas,
    reunionesCerradas: videoCerradas,
    reunionesNoShow: videoNoShows,
    reunionesCanceladas: videoCanceladas,
    tasaAgendamiento: contestadas > 0 ? (new Set(agendaRows.map(agendaDedupKey)).size / contestadas) * 100 : 0,
    totalChats: chatsRows.length,
    chatsConRespuesta,
    tasaRespuestaChats: chatsRows.length > 0 ? (chatsConRespuesta / chatsRows.length) * 100 : 0,
    speedToLeadChatsAvg: speedChatCount > 0 ? speedChatSum / speedChatCount : null,
  };

  // ── PIPELINE: Llamadas ────────────────────────────────────────────────────
  const ghlContactMap: Record<number, string> = {};
  const phoneFromCallsMap: Record<number, string> = {};
  for (const c of callRows) {
    if (c.id_registro) {
      if (c.contact_id_ghl) ghlContactMap[c.id_registro] = c.contact_id_ghl;
      if (c.phone && !phoneFromCallsMap[c.id_registro]) phoneFromCallsMap[c.id_registro] = c.phone;
    }
  }

  const leadMap: Record<string, AsesorLeadCRM> = {};
  for (const r of regRows) {
    // Normalizar a lowercase para que "Juan@mail.com" y "juan@mail.com" no generen dos filas.
    // Fallback a teléfono, y solo como último recurso al id_registro.
    const key = r.mail_lead?.trim().toLowerCase() || r.phone_raw_format?.trim() || String(r.id_registro);
    if (leadMap[key]) continue;

    const notasArr: { date: string; text: string }[] = [];
    if (r.iadescripcion?.trim()) {
      notasArr.push({ date: r.fecha_evento?.toISOString() ?? "", text: r.iadescripcion });
    }

    const estadoNorm = normalizarEstado(r.estado);

    leadMap[key] = {
      id: String(r.id_registro),
      name: r.nombre_lead ?? key,
      email: r.mail_lead ?? null,
      phone: r.phone_raw_format ?? phoneFromCallsMap[r.id_registro] ?? null,
      ghlContactId: ghlContactMap[r.id_registro] ?? r.ghl_contact_id ?? null,
      estado: r.estado,
      estadoNormalizado: estadoNorm,
      intentosContacto: r.intentos_contacto ?? 0,
      speedToLead: r.speed_to_lead ? `${parseFloat(r.speed_to_lead) || 0} min` : "—",
      notasLlamadas: notasArr,
      leadNote: null,
      excluido: excludedRegIds.has(r.id_registro),
    };
  }
  const leads = Object.values(leadMap);

  // ── PIPELINE: Videollamadas ───────────────────────────────────────────────
  const videollamadas: AsesorVideollamada[] = agendaRows.map((a) => ({
    id: a.id_registro_agenda,
    leadName: a.nombre_de_lead ?? null,
    leadEmail: a.email_lead ?? null,
    ghlContactId: a.ghl_contact_id ?? null,
    categoria: (a.categoria ?? "PDTE").toLowerCase(),
    fechaReunion: a.fecha_reunion?.toISOString() ?? null,
    facturacion: parseFloat(a.facturacion || "0") || 0,
    cashCollected: parseFloat(a.cash_collected || "0") || 0,
    fathomUrl: a.link_llamada ?? null,
    resumenIa: a.resumen_ia ?? null,
  }));

  // ── PIPELINE: Chats ───────────────────────────────────────────────────────
  const chats: AsesorChat[] = chatsRows.map((ch) => {
    const msgs = (ch.chat as { role?: string; timestamp?: string; message?: string }[] | null) ?? [];
    const respondido = msgs.some((m) => m.role === "agent");
    const firstLead = msgs.find((m) => m.role === "lead");
    const firstAgent = msgs.find((m) => m.role === "agent");
    let speedSeg: number | null = null;
    if (firstLead?.timestamp && firstAgent?.timestamp) {
      const diff = (new Date(firstAgent.timestamp).getTime() - new Date(firstLead.timestamp).getTime()) / 1000;
      if (diff > 0) speedSeg = diff;
    }
    // Intentar extraer nombre y email del primer mensaje del lead en el chat
    const firstLeadMsg = msgs.find((m) => m.role === "lead");
    const emailFromMsg = (firstLeadMsg as { email?: string })?.email ?? null;

    const asesorName = ch.asesor_asignado ?? ch.notas_extra ?? null;
    const messages = msgs
      .filter((m): m is { role: string; timestamp: string; message: string } =>
        typeof m.role === "string" && typeof m.timestamp === "string" && typeof m.message === "string"
      );

    return {
      chatId: ch.chatid ?? String(ch.id_evento ?? ""),
      leadName: ch.nombre_lead ?? null,
      leadEmail: emailFromMsg ?? ch.id_lead ?? null,
      asesorName,
      estado: ch.estado ?? "activo",
      fechaUltimoMensaje: ch.fecha_y_hora_z?.toISOString() ?? dateFrom,
      respondido,
      speedToLeadSeg: speedSeg,
      messages,
    };
  });

  // ── Métricas custom ───────────────────────────────────────────────────────
  const metricasCustom: AsesorMetricaCustom[] = metricasAtribuibles.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    valor: m.webhookCampo ? (metricasSumaMap[m.webhookCampo] ?? 0) : 0,
    formato: m.formato ?? "numero",
    color: m.color ?? "cyan",
  }));

  // ── Canales disponibles ───────────────────────────────────────────────────
  // Basado en si hay datos reales + si el módulo está activo
  const modulosActivos = cuentaRow?.configuracion_ui?.modulos_activos ?? {};
  const canales: AsesorCanales = {
    llamadas: callRows.length > 0 || regRows.length > 0,
    videollamadas: agendaRows.length > 0 || !!modulosActivos.videollamadas_fathom,
    chats: chatsRows.length > 0 || !!modulosActivos.chats,
    metricasCustom: metricasCustom.length > 0,
  };

  // ── Módulos habilitados a nivel de tenant ─────────────────────────────────
  // Data-driven: si el tenant tiene datos en el rango (de cualquier asesor), habilitar el tab.
  const [tenantCounts] = await db
    .execute(
      sql`SELECT
        (SELECT COUNT(*) FROM log_llamadas WHERE id_cuenta = ${idCuenta} AND ts >= ${fromTs} AND ts <= ${toTs} AND tipo_evento NOT IN ('pdte','contacto_creado') LIMIT 1) > 0 AS has_llamadas,
        (SELECT COUNT(*) FROM resumenes_diarios_agendas WHERE id_cuenta = ${idCuenta} AND (
          (fecha_reunion IS NOT NULL AND fecha_reunion >= ${fromTs} AND fecha_reunion <= ${toTs})
          OR (fecha_reunion IS NULL AND fecha >= ${dateFrom} AND fecha <= ${dateTo})
        ) LIMIT 1) > 0 AS has_videollamadas,
        (SELECT COUNT(*) FROM chats_logs WHERE id_cuenta = ${idCuenta} AND fecha_y_hora_z >= ${fromTs} AND fecha_y_hora_z <= ${toTs} LIMIT 1) > 0 AS has_chats`,
    )
    .then(
      (r) =>
        r.rows as Array<{
          has_llamadas: boolean;
          has_videollamadas: boolean;
          has_chats: boolean;
        }>,
    );

  const modulosHabilitados: AsesorCanales = {
    llamadas:
      (tenantCounts?.has_llamadas ?? false) || !!cuentaRow?.fuente_llamadas,
    videollamadas: tenantCounts?.has_videollamadas ?? false,
    chats:
      (tenantCounts?.has_chats ?? false) ||
      !!modulosActivos.chats ||
      !!modulosActivos.seccion_chats_dashboard,
    metricasCustom: metricasAtribuibles.length > 0,
  };

  // ── Etapas del embudo para el pipeline de videollamadas ──────────────────
  const DEFAULT_ETAPAS = [
    { id: "calificada", nombre: "Calificada", color: "#22c55e", es_fija: true },
    { id: "no_calificada", nombre: "No calificada", color: "#f97316", es_fija: true },
    { id: "cerrada", nombre: "Cerrada", color: "#10b981", es_fija: true },
    { id: "no_show", nombre: "No Show", color: "#eab308", es_fija: true },
    { id: "cancelada", nombre: "Cancelada", color: "#ef4444", es_fija: true },
    { id: "pdte", nombre: "Pendiente", color: "#6b7280", es_fija: true },
  ];
  const embudoEtapas = embudo.length > 0
    ? [
        ...embudo.map((e) => ({ id: e.id, nombre: e.nombre ?? e.id, color: e.color ?? "#6b7280", es_fija: e.es_fija })),
        { id: "no_show", nombre: "No Show", color: "#eab308", es_fija: true },
        { id: "cancelada", nombre: "Cancelada", color: "#ef4444", es_fija: true },
        { id: "pdte", nombre: "Pendiente", color: "#6b7280", es_fija: true },
      ]
    : DEFAULT_ETAPAS;

  // ── Breakdown ─────────────────────────────────────────────────────────────
  const soloLlamadas = [...leadsFromCalls].filter((e) => !leadsFromAgendas.has(e)).length;
  const soloAgendas = [...leadsFromAgendas].filter((e) => !leadsFromCalls.has(e)).length;
  const enAmbos = [...leadsFromCalls].filter((e) => leadsFromAgendas.has(e)).length;
  const soloRegistros = [...leadsFromRegistros].filter((e) => !leadsFromCalls.has(e) && !leadsFromAgendas.has(e)).length;
  const porTipo: Record<string, number> = {};
  for (const c of callRowsForKpi) { const t = c.tipo_evento || "sin_tipo"; porTipo[t] = (porTipo[t] ?? 0) + 1; }

  const breakdown: AsesorBreakdown = {
    leadsAsignados: {
      desdeLlamadas: leadsFromCalls.size,
      desdeAgendas: leadsFromAgendas.size,
      desdeRegistros: leadsFromRegistros.size,
      soloLlamadas,
      soloAgendas,
      soloRegistros,
      enAmbos,
    },
    llamadasRealizadas: { total: callRowsForKpi.length, porTipo },
    llamadasContestadas: { total: contestadas },
    reunionesAgendadas: { total: new Set(agendaRows.map(agendaDedupKey)).size },
  };

  // ── Advisors list ─────────────────────────────────────────────────────────
  const advisorSet = new Map<string, string>();
  for (const c of callRows) { if (c.closer_mail) advisorSet.set(c.closer_mail, c.nombre_closer ?? c.closer_mail); }
  for (const a of agendaRows) { if (a.closer && !advisorSet.has(a.closer)) advisorSet.set(a.closer, a.closer); }
  const advisors: ApiAdvisor[] = [...advisorSet.entries()].map(([email, name]) => ({ id: email, name, email }));

  return {
    kpis,
    leads,
    videollamadas,
    chats,
    metricasCustom,
    embudoEtapas,
    canales,
    modulosHabilitados,
    advisors,
    breakdown,
    fuente_llamadas: fuenteLlamadas,
    ghlLocationId,
  };
}

/** Lista de asesores del tenant para el combobox */
export async function getAsesoresList(idCuenta: number): Promise<ApiAdvisor[]> {
  const [callRows, agendaRows] = await Promise.all([
    db.select({ closer_mail: logLlamadas.closer_mail, nombre_closer: logLlamadas.nombre_closer })
      .from(logLlamadas).where(eq(logLlamadas.id_cuenta, idCuenta)),
    db.select({ closer: resumenesDiariosAgendas.closer })
      .from(resumenesDiariosAgendas).where(eq(resumenesDiariosAgendas.id_cuenta, idCuenta)),
  ]);
  const advisorMap = new Map<string, string>();
  for (const r of callRows) { if (r.closer_mail) advisorMap.set(r.closer_mail, r.nombre_closer ?? r.closer_mail); }
  for (const a of agendaRows) { if (a.closer && !advisorMap.has(a.closer)) advisorMap.set(a.closer, a.closer); }
  return [...advisorMap.entries()].map(([email, name]) => ({ id: email, name, email }));
}

export async function toggleExcluirLead(
  idRegistro: number,
  idCuenta: number,
  excluir: boolean,
): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE registros_de_llamada
    SET excluido_metricas = ${excluir}
    WHERE id_registro = ${idRegistro}
      AND id_cuenta = ${String(idCuenta)}
  `);
  return (result.rowCount ?? 0) > 0;
}
