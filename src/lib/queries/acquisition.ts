import { db } from "@/lib/db";
import { resumenesDiariosAgendas, logLlamadas, chatsLogs, cuentas, normalizeEmbudoEtapas, metricasWebhook, usuariosDashboard, registrosDeLlamada } from "@/lib/db/schema";
import { zonedDayRange } from "@/lib/date-range";
import type { EmbudoEtapa } from "@/lib/db/schema";
import { eq, and, or, gte, lte, isNull, isNotNull, sql } from "drizzle-orm";
import { sinNoTrackeadosSql } from "@/lib/queries/no-trackeado";

export interface ReMetricaLead {
  campo: string;
  valor: number;
}

export interface AcquisitionLeadDetail {
  key: string;
  nombre: string | null;
  email: string | null;
  phone: string | null;
  ghlContactId: string | null;
  closer: string | null;
  estado: string | null;
  reMetricas?: ReMetricaLead[];
}

export interface AcquisitionRow {
  origen: string;
  leads: number;
  called: number;
  answered: number;
  booked: number;
  attended: number;
  closed: number;
  revenue: number;
  contactRate: number;
  bookingRate: number;
  attendanceRate: number;
  closingRate: number;
  leadsList: AcquisitionLeadDetail[]; // detalle de leads individuales para drill-down
}

export interface ByChannelStats {
  llamadas: { leads: number; contactRate: number; bookingRate: number; closingRate: number };
  videollamadas: { leads: number; attendanceRate: number; closingRate: number; revenue: number };
  chats: { leads: number; conRespuesta: number; tasaRespuesta: number; topOrigen: string | null };
}

export interface WebhookMetricRow {
  campo: string;
  total: number;
  porAsesor: { userId: string; nombre: string | null; valor: number }[];
}

export interface ReMetricaSummary {
  campo: string;
  label: string;
  total: number;
  formato: "numero" | "moneda";
  porAsesor: { userId: string; nombre: string | null; valor: number }[];
}

export interface AcquisitionResponse {
  rows: AcquisitionRow[];
  sources: string[];
  byChannel: ByChannelStats;
  webhookMetrics: WebhookMetricRow[];
  reMetrics?: ReMetricaSummary[];
}

export async function getAcquisition(
  idCuenta: number,
  dateFrom: string,
  dateTo: string,
  leadFilter: "todos" | "nuevos" | "reactivados" = "todos",
): Promise<AcquisitionResponse> {
  const [cuentaRow] = await db
    .select({ embudo_personalizado: cuentas.embudo_personalizado, zona_horaria_iana: cuentas.zona_horaria_iana })
    .from(cuentas)
    .where(eq(cuentas.id_cuenta, idCuenta))
    .limit(1);

  const { fromDate, toDate } = zonedDayRange(dateFrom, dateTo, cuentaRow?.zona_horaria_iana);

  const embudoRaw: EmbudoEtapa[] | null = Array.isArray(cuentaRow?.embudo_personalizado)
    ? normalizeEmbudoEtapas(cuentaRow.embudo_personalizado)
    : null;

  // Soporta campo "nombre" (estándar), "name" (legacy) y "id"
  const getLabel = (e: EmbudoEtapa) =>
    ((e?.nombre ?? (e as any)?.name ?? e?.id) || "").trim();
  const allKeys = embudoRaw && embudoRaw.length > 0
    ? [...new Set([
        ...embudoRaw.map(getLabel),
        ...embudoRaw.map((e) => (e?.id ?? "").trim()),
      ].filter(Boolean))]
    : [];

  const attendedSet = allKeys.length > 0
    ? new Set(allKeys.filter((k) => !k.toLowerCase().includes("cancel") && !k.toLowerCase().includes("pdte")))
    : new Set(["Cerrada", "Ofertada", "No_Ofertada"]);

  // Para cierres: buscar explícitamente etapas con cerrada/closed.
  // Si el embudo personalizado no tiene ninguna → usar el estado más positivo del embudo
  // (interesado/interested) como proxy de cierre, o fallback a defaults.
  const rawClosedSet = allKeys.length > 0
    ? new Set(allKeys.filter((k) =>
        k.toLowerCase().includes("cerrad") || k.toLowerCase().includes("closed"),
      ))
    : new Set(["Cerrada"]);
  // Si el embudo existe pero no tiene etapa de cierre, usar "interesado" como tope del funnel
  const closedSet = rawClosedSet.size > 0
    ? rawClosedSet
    : allKeys.length > 0
      ? new Set(allKeys.filter((k) =>
          k.toLowerCase().includes("interes") || k.toLowerCase().includes("interest") ||
          k.toLowerCase().includes("calificado") || k.toLowerCase().includes("qualified")
        ))
      : new Set(["Cerrada"]);

  const fechaFilter = or(
    and(
      isNotNull(resumenesDiariosAgendas.fecha_reunion),
      gte(resumenesDiariosAgendas.fecha_reunion, fromDate),
      lte(resumenesDiariosAgendas.fecha_reunion, toDate),
    ),
    and(
      isNull(resumenesDiariosAgendas.fecha_reunion),
      gte(resumenesDiariosAgendas.fecha, dateFrom),
      lte(resumenesDiariosAgendas.fecha, dateTo),
    ),
  )!;

  const [agendas, calls, chats] = await Promise.all([
    db
      .select()
      .from(resumenesDiariosAgendas)
      .where(
        and(
          eq(resumenesDiariosAgendas.id_cuenta, idCuenta),
          fechaFilter,
          eq(resumenesDiariosAgendas.excluida_dashboard, false),
        ),
      ),
    db
      .select()
      .from(logLlamadas)
      .where(
        and(
          eq(logLlamadas.id_cuenta, idCuenta),
          gte(logLlamadas.ts, fromDate),
          lte(logLlamadas.ts, toDate),
          sinNoTrackeadosSql(idCuenta),
        ),
      ),
    db
      .select()
      .from(chatsLogs)
      .where(
        and(
          eq(chatsLogs.id_cuenta, idCuenta),
          gte(chatsLogs.fecha_y_hora_z, fromDate),
          lte(chatsLogs.fecha_y_hora_z, toDate),
          sql`${chatsLogs.excluida_dashboard} IS NOT TRUE`,
        ),
      ),
  ]);

  // ----------------------------------------------------------------
  // LEAD FILTER — nuevos vs reactivados (all sources)
  // ----------------------------------------------------------------
  let filterSet: Set<string> | null = null;

  if (leadFilter !== "todos") {
    const newKeys = new Set<string>();
    const reactivatedKeys = new Set<string>();
    const classifiedKeys = new Set<string>();

    // 1. registros_de_llamada — fecha_primera_llamada
    const regRows = await db
      .select({
        mail_lead: registrosDeLlamada.mail_lead,
        ghl_contact_id: registrosDeLlamada.ghl_contact_id,
        fecha_primera_llamada: registrosDeLlamada.fecha_primera_llamada,
      })
      .from(registrosDeLlamada)
      .where(
        and(
          sql`${registrosDeLlamada.id_cuenta}::text = ${String(idCuenta)}`,
          gte(registrosDeLlamada.fecha_evento, fromDate),
          lte(registrosDeLlamada.fecha_evento, toDate),
        ),
      );

    for (const r of regRows) {
      const keys: string[] = [];
      if (r.mail_lead?.trim()) keys.push(r.mail_lead.trim().toLowerCase());
      if (r.ghl_contact_id?.trim()) keys.push(r.ghl_contact_id.trim().toLowerCase());

      const fpl = r.fecha_primera_llamada;
      const isNew = fpl == null || (fpl >= fromDate && fpl <= toDate);
      const isReactivated = fpl != null && fpl < fromDate;

      for (const k of keys) {
        classifiedKeys.add(k);
        if (isNew) newKeys.add(k);
        else if (isReactivated) reactivatedKeys.add(k);
      }
    }

    // 2. chats — first appearance in chats_logs for unclassified chat leads
    const chatLeadIds = new Set(
      chats
        .map((ch) => ch.id_lead?.trim().toLowerCase())
        .filter((id): id is string => !!id && !classifiedKeys.has(id)),
    );

    if (chatLeadIds.size > 0) {
      const chatFirstRows = await db.execute<{ id_lead: string; first_chat: Date }>(
        sql`
          SELECT id_lead, MIN(fecha_y_hora_z) AS first_chat
          FROM chats_logs
          WHERE id_cuenta = ${idCuenta}
            AND id_lead IN (${sql.join([...chatLeadIds].map((id) => sql`${id}`), sql`, `)})
          GROUP BY id_lead
        `,
      );

      for (const row of chatFirstRows.rows) {
        const k = (row as { id_lead: string; first_chat: Date }).id_lead?.trim().toLowerCase();
        const firstChat = (row as { id_lead: string; first_chat: Date }).first_chat;
        if (!k || !firstChat) continue;
        if (firstChat >= fromDate && firstChat <= toDate) {
          newKeys.add(k);
        } else if (firstChat < fromDate) {
          reactivatedKeys.add(k);
        }
        classifiedKeys.add(k);
      }
    }

    // 3. agendas — first appearance for unclassified agenda leads
    const agendaLeadKeys = new Set(
      agendas
        .map((a) => (a.email_lead?.trim() || a.ghl_contact_id?.trim() || "").toLowerCase())
        .filter((k) => k && !classifiedKeys.has(k)),
    );

    if (agendaLeadKeys.size > 0) {
      const agendaFirstRows = await db.execute<{ lead_key: string; first_agenda: Date }>(
        sql`
          SELECT
            LOWER(TRIM(COALESCE(NULLIF(TRIM(email_lead),''), ghl_contact_id))) AS lead_key,
            MIN(COALESCE(fecha_reunion, fecha::timestamptz)) AS first_agenda
          FROM resumenes_diarios_agendas
          WHERE id_cuenta = ${idCuenta}
            AND LOWER(TRIM(COALESCE(NULLIF(TRIM(email_lead),''), ghl_contact_id)))
              IN (${sql.join([...agendaLeadKeys].map((k) => sql`${k}`), sql`, `)})
          GROUP BY lead_key
        `,
      );

      for (const row of agendaFirstRows.rows) {
        const k = (row as { lead_key: string; first_agenda: Date }).lead_key;
        const firstAgenda = (row as { lead_key: string; first_agenda: Date }).first_agenda;
        if (!k || !firstAgenda) continue;
        if (firstAgenda >= fromDate && firstAgenda <= toDate) {
          newKeys.add(k);
        } else if (firstAgenda < fromDate) {
          reactivatedKeys.add(k);
        }
      }
    }

    filterSet = leadFilter === "nuevos" ? newKeys : reactivatedKeys;
  }

  function passesFilter(leadKey: string | null): boolean {
    if (!filterSet) return true;
    if (!leadKey) return false;
    return filterSet.has(leadKey.trim().toLowerCase());
  }

  // ----------------------------------------------------------------
  // TABLA — lógica con filtro aplicado
  // ----------------------------------------------------------------
  const origenMap: Record<string, {
    leadEmails: Set<string>;
    calledEmails: Set<string>;
    answeredEmails: Set<string>;
    booked: number;
    attended: number;
    closed: number;
    revenue: number;
    leadDetails: Map<string, AcquisitionLeadDetail>;
  }> = {};

  function getOrCreate(key: string) {
    const k = (key || "sin_origen").toLowerCase().trim();
    if (!origenMap[k]) {
      origenMap[k] = {
        leadEmails: new Set(),
        calledEmails: new Set(),
        answeredEmails: new Set(),
        booked: 0,
        attended: 0,
        closed: 0,
        revenue: 0,
        leadDetails: new Map(),
      };
    }
    return origenMap[k];
  }

  for (const a of agendas) {
    if (!passesFilter(a.email_lead?.trim() || a.ghl_contact_id?.trim() || null)) continue;
    const bucket = getOrCreate(a.origen ?? "sin_origen");
    if (a.email_lead) bucket.leadEmails.add(a.email_lead);
    const leadKey = a.email_lead?.trim() || a.ghl_contact_id?.trim() || `ag:${a.id_registro_agenda}`;
    if (!bucket.leadDetails.has(leadKey)) {
      bucket.leadDetails.set(leadKey, {
        key: leadKey,
        nombre: a.nombre_de_lead ?? null,
        email: a.email_lead ?? null,
        phone: null,
        ghlContactId: a.ghl_contact_id ?? null,
        closer: a.closer ?? null,
        estado: a.categoria ?? null,
      });
    }
    bucket.booked++;
    if (attendedSet.has(a.categoria ?? "")) bucket.attended++;
    if (closedSet.has(a.categoria ?? "")) {
      bucket.closed++;
      bucket.revenue += parseFloat(a.facturacion || "0") || 0;
    }
  }

  for (const c of calls) {
    const leadKey = c.mail_lead?.trim() || c.contact_id_ghl?.trim() || null;
    if (!passesFilter(leadKey)) continue;
    const bucket = getOrCreate(c.creativo_origen ?? "sin_origen");
    if (leadKey) {
      bucket.leadEmails.add(leadKey);
      // Solo contar como "llamado" si no es evento administrativo (pdte/contacto_creado)
      const TIPOS_ADMIN = ["pdte", "contacto_creado"];
      if (!TIPOS_ADMIN.includes(c.tipo_evento)) {
        bucket.calledEmails.add(leadKey);
      }
      if (c.tipo_evento.startsWith("efectiva_")) {
        bucket.answeredEmails.add(leadKey);
      }
      // Guardar detalle del lead (primera vez que aparece)
      if (!bucket.leadDetails.has(leadKey)) {
        bucket.leadDetails.set(leadKey, {
          key: leadKey,
          nombre: c.nombre_lead ?? null,
          email: c.mail_lead ?? null,
          phone: c.phone ?? null,
          ghlContactId: c.contact_id_ghl ?? null,
          closer: c.closer_mail ?? null,
          estado: c.tipo_evento ?? null,
        });
      } else {
        // Actualizar estado con la llamada más reciente si es efectiva
        if (c.tipo_evento.startsWith("efectiva_")) {
          const existing = bucket.leadDetails.get(leadKey)!;
          existing.estado = c.tipo_evento;
          existing.closer = c.closer_mail ?? existing.closer;
        }
      }
    }
  }

  for (const ch of chats) {
    if (!ch.origen) continue;
    if (!passesFilter(ch.id_lead ?? null)) continue;
    const bucket = getOrCreate(ch.origen);
    if (ch.id_lead) {
      bucket.leadEmails.add(ch.id_lead);
      if (!bucket.leadDetails.has(ch.id_lead)) {
        bucket.leadDetails.set(ch.id_lead, {
          key: ch.id_lead,
          nombre: ch.nombre_lead ?? null,
          email: null,
          phone: null,
          ghlContactId: null,
          closer: ch.notas_extra ?? null,
          estado: ch.estado ?? null,
        });
      }
    }
  }

  const rows: AcquisitionRow[] = Object.entries(origenMap)
    .map(([origen, d]) => {
      const leads = d.leadEmails.size;
      const called = d.calledEmails.size;
      const answeredCount = d.answeredEmails.size;
      return {
        origen,
        leads,
        called,
        answered: answeredCount,
        booked: d.booked,
        attended: d.attended,
        closed: d.closed,
        revenue: Math.round(d.revenue),
        contactRate: called > 0 ? answeredCount / called : 0,
        bookingRate: answeredCount > 0 ? d.booked / answeredCount : 0,
        attendanceRate: d.booked > 0 ? d.attended / d.booked : 0,
        closingRate: d.attended > 0 ? d.closed / d.attended : 0,
        leadsList: [...d.leadDetails.values()].slice(0, 200), // max 200 para no sobrecargar
      };
    })
    .sort((a, b) => b.leads - a.leads);

  const sources = [...new Set(rows.map((r) => r.origen))];

  // ----------------------------------------------------------------
  // BY CHANNEL — cálculo independiente por canal, denominadores limpios
  // ----------------------------------------------------------------

  // CANAL: LLAMADAS (solo log_llamadas + cross-ref emails en agendas)
  const llamadasLeads = new Set<string>();
  const llamadasAnswered = new Set<string>();
  for (const c of calls) {
    const lKey = c.mail_lead?.trim() || c.contact_id_ghl?.trim() || null;
    if (lKey) {
      llamadasLeads.add(lKey);
      if (c.tipo_evento.startsWith("efectiva_")) {
        llamadasAnswered.add(lKey);
      }
    }
  }
  // Cross-ref: leads de llamadas que agendaron videollamada (por email)
  let llamadasBooked = 0;
  let llamadasAttended = 0;
  let llamadasClosed = 0;
  for (const a of agendas) {
    if (a.email_lead && llamadasLeads.has(a.email_lead)) {
      llamadasBooked++;
      if (attendedSet.has(a.categoria ?? "")) llamadasAttended++;
      if (closedSet.has(a.categoria ?? "")) llamadasClosed++;
    }
  }
  const llamadasLeadsCount = llamadasLeads.size;
  const llamadasAnsweredCount = llamadasAnswered.size;

  const llamadasChannel: ByChannelStats["llamadas"] = {
    leads: llamadasLeadsCount,
    contactRate: llamadasLeadsCount > 0 ? llamadasAnsweredCount / llamadasLeadsCount : 0,
    bookingRate: llamadasAnsweredCount > 0 ? llamadasBooked / llamadasAnsweredCount : 0,
    closingRate: llamadasAttended > 0 ? llamadasClosed / llamadasAttended : 0,
  };

  // CANAL: VIDEOLLAMADAS (solo resumenes_diarios_agendas)
  const videollamadasLeads = new Set<string>();
  let videollamadasBooked = 0;
  let videollamadasAttended = 0;
  let videollamadasClosed = 0;
  let videollamadasRevenue = 0;
  for (const a of agendas) {
    if (a.email_lead) videollamadasLeads.add(a.email_lead);
    videollamadasBooked++;
    if (attendedSet.has(a.categoria ?? "")) videollamadasAttended++;
    if (closedSet.has(a.categoria ?? "")) {
      videollamadasClosed++;
      videollamadasRevenue += parseFloat(a.facturacion || "0") || 0;
    }
  }

  const videollamadasChannel: ByChannelStats["videollamadas"] = {
    leads: videollamadasLeads.size,
    attendanceRate: videollamadasBooked > 0 ? videollamadasAttended / videollamadasBooked : 0,
    closingRate: videollamadasAttended > 0 ? videollamadasClosed / videollamadasAttended : 0,
    revenue: Math.round(videollamadasRevenue),
  };

  // CANAL: CHATS (solo chats_logs)
  const chatsLeads = new Set<string>();
  const chatsLeadsWithResponse = new Set<string>();
  const chatsOrigenCount: Record<string, number> = {};
  for (const ch of chats) {
    if (ch.id_lead) {
      chatsLeads.add(ch.id_lead);
      // "con respuesta" = tiene al menos un mensaje con role="agent" en el JSONB
      const chatData = ch.chat as any[];
      const hasAgentMsg = Array.isArray(chatData) && chatData.some((m: any) => m?.role === "agent");
      if (hasAgentMsg) {
        chatsLeadsWithResponse.add(ch.id_lead);
      }
    }
    if (ch.origen) {
      chatsOrigenCount[ch.origen] = (chatsOrigenCount[ch.origen] ?? 0) + 1;
    }
  }
  const chatsLeadsCount = chatsLeads.size;
  const chatsConRespuesta = chatsLeadsWithResponse.size;
  const topOrigen =
    Object.entries(chatsOrigenCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const chatsChannel: ByChannelStats["chats"] = {
    leads: chatsLeadsCount,
    conRespuesta: chatsConRespuesta,
    tasaRespuesta: chatsLeadsCount > 0 ? chatsConRespuesta / chatsLeadsCount : 0,
    topOrigen,
  };

  // ----------------------------------------------------------------
  // WEBHOOK METRICS — métricas personalizadas atribuidas por asesor
  // ----------------------------------------------------------------
  const webhookRows = await db
    .select({
      campo: metricasWebhook.campo,
      valor: metricasWebhook.valor,
      ghl_user_id: metricasWebhook.ghl_user_id,
      ghl_customer_id: metricasWebhook.ghl_customer_id,
    })
    .from(metricasWebhook)
    .where(
      and(
        eq(metricasWebhook.id_cuenta, idCuenta),
        gte(metricasWebhook.fecha, dateFrom),
        lte(metricasWebhook.fecha, dateTo),
      ),
    );

  const advisorEmails = new Set(
    webhookRows
      .map((r) => r.ghl_user_id)
      .filter((id): id is string => id !== null),
  );

  const advisorMap = new Map<string, string | null>();
  if (advisorEmails.size > 0) {
    const emailList = [...advisorEmails];
    const advisors = await db
      .select({ email: usuariosDashboard.email, nombre_closer: usuariosDashboard.nombre_closer })
      .from(usuariosDashboard)
      .where(
        and(
          eq(usuariosDashboard.id_cuenta, idCuenta),
          sql`${usuariosDashboard.email} IN (${sql.join(emailList.map((e) => sql`${e}`), sql`, `)})`,
        ),
      );
    for (const a of advisors) {
      if (a.email) advisorMap.set(a.email, a.nombre_closer ?? a.email);
    }
  }

  const campoAgg = new Map<string, { total: number; byUser: Map<string, number> }>();
  for (const row of webhookRows) {
    const val = parseFloat(String(row.valor)) || 0;
    if (!campoAgg.has(row.campo)) {
      campoAgg.set(row.campo, { total: 0, byUser: new Map() });
    }
    const agg = campoAgg.get(row.campo)!;
    if (row.ghl_user_id === null) {
      // Filas account-global (sin asesor): hay una por día. Acumular todo el
      // rango de fechas — con `=` solo sobrevivía el último día (undercount).
      agg.total += val;
    } else {
      agg.byUser.set(row.ghl_user_id, (agg.byUser.get(row.ghl_user_id) ?? 0) + val);
    }
  }

  const RE_CAMPOS = new Set([
    "re_recorridos_agendados",
    "re_recorridos_realizados",
    "re_recorridos_cancelados",
    "re_apartados",
    "re_monto_apartados",
  ]);

  const RE_LABELS: Record<string, string> = {
    re_recorridos_agendados: "Recorridos agendados",
    re_recorridos_realizados: "Recorridos realizados",
    re_recorridos_cancelados: "Recorridos cancelados",
    re_apartados: "Apartados",
    re_monto_apartados: "Monto apartados",
  };

  const RE_FORMATO: Record<string, "numero" | "moneda"> = {
    re_monto_apartados: "moneda",
  };

  const webhookMetrics: WebhookMetricRow[] = [...campoAgg.entries()]
    .filter(([campo]) => !RE_CAMPOS.has(campo))
    .map(([campo, agg]) => ({
      campo,
      total: agg.total || [...agg.byUser.values()].reduce((s, v) => s + v, 0),
      porAsesor: [...agg.byUser.entries()].map(([userId, valor]) => ({
        userId,
        nombre: advisorMap.get(userId) ?? null,
        valor,
      })),
    }));

  // ----------------------------------------------------------------
  // RE METRICS — métricas Real Estate separadas, con detalle por contacto
  // ----------------------------------------------------------------
  const reAgg = new Map<string, { total: number; byUser: Map<string, number> }>();
  const reByCustomer = new Map<string, Map<string, number>>();

  for (const row of webhookRows) {
    if (!RE_CAMPOS.has(row.campo)) continue;
    const val = parseFloat(String(row.valor)) || 0;

    if (!reAgg.has(row.campo)) {
      reAgg.set(row.campo, { total: 0, byUser: new Map() });
    }
    const agg = reAgg.get(row.campo)!;
    if (row.ghl_user_id === null) {
      agg.total += val;
    } else {
      agg.byUser.set(row.ghl_user_id, (agg.byUser.get(row.ghl_user_id) ?? 0) + val);
    }

    if (row.ghl_customer_id) {
      if (!reByCustomer.has(row.ghl_customer_id)) {
        reByCustomer.set(row.ghl_customer_id, new Map());
      }
      const cm = reByCustomer.get(row.ghl_customer_id)!;
      cm.set(row.campo, (cm.get(row.campo) ?? 0) + val);
    }
  }

  const hasReData = reAgg.size > 0;

  const reMetrics: ReMetricaSummary[] = hasReData
    ? [...reAgg.entries()].map(([campo, agg]) => ({
        campo,
        label: RE_LABELS[campo] ?? campo.replace(/_/g, " "),
        total: agg.total || [...agg.byUser.values()].reduce((s, v) => s + v, 0),
        formato: RE_FORMATO[campo] ?? "numero",
        porAsesor: [...agg.byUser.entries()].map(([userId, valor]) => ({
          userId,
          nombre: advisorMap.get(userId) ?? null,
          valor,
        })),
      }))
    : [];

  // Attach RE metrics to lead details by ghlContactId
  if (reByCustomer.size > 0) {
    for (const row of rows) {
      for (const lead of row.leadsList) {
        if (!lead.ghlContactId) continue;
        const cm = reByCustomer.get(lead.ghlContactId);
        if (cm) {
          lead.reMetricas = [...cm.entries()].map(([campo, valor]) => ({
            campo,
            valor,
          }));
        }
      }
    }
  }

  return {
    rows,
    sources,
    byChannel: {
      llamadas: llamadasChannel,
      videollamadas: videollamadasChannel,
      chats: chatsChannel,
    },
    webhookMetrics,
    ...(hasReData ? { reMetrics } : {}),
  };
}
