import { db } from "@/lib/db";
import {
  chatsLogs,
  logLlamadas,
  resumenesDiariosAgendas,
  registrosDeLlamada,
  usuariosDashboard,
} from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { zonedDayRange } from "@/lib/date-range";
import type {
  UnifiedLead,
  UnifiedLeadChat,
  UnifiedLeadCall,
  UnifiedLeadAppointment,
  UnifiedLeadsResponse,
  JourneyStage,
  ApiAdvisor,
  ApiChatMessage,
} from "@/types";

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/\D/g, "").slice(-10);
}

function leadKey(email: string | null, phone: string | null, ghlContactId: string | null): string {
  if (ghlContactId) return `ghl:${ghlContactId}`;
  if (email) return `email:${email.toLowerCase().trim()}`;
  if (phone) return `phone:${normalizePhone(phone)}`;
  return "";
}

interface LeadBucket {
  name: string;
  email: string | null;
  phone: string | null;
  ghlContactId: string | null;
  advisor: string | null;
  lastActivity: string;
  chats: UnifiedLeadChat[];
  calls: UnifiedLeadCall[];
  appointments: UnifiedLeadAppointment[];
}

const BOT_NAMES = new Set(["agente", "agent", "bot", "por asignar", "workflow", "api/bot", "campaña", "campaign"]);

function normalizeChatCloser(asesor: string | null, notasExtra: string | null): string | null {
  const candidates = [asesor?.trim(), notasExtra?.trim() !== "por asignar" ? notasExtra?.trim() : undefined];
  for (const c of candidates) {
    if (!c) continue;
    if (BOT_NAMES.has(c.toLowerCase())) continue;
    return c;
  }
  return null;
}

function chatMsgToApi(m: ChatMessage): ApiChatMessage {
  return {
    name: m.name,
    role: m.role,
    type: m.type,
    message: m.message,
    timestamp: m.timestamp,
  };
}

export async function getUnifiedLeads(
  idCuenta: number,
  dateFrom: string,
  dateTo: string,
  closerEmails?: string[],
): Promise<UnifiedLeadsResponse> {
  const { fromDate: start, toDate: end } = zonedDayRange(dateFrom, dateTo, null);

  // ── Advisors list ─────────────────────────────────────────────────────────
  const usuarios = await db
    .select({
      email: usuariosDashboard.email,
      nombre: usuariosDashboard.nombre_closer,
    })
    .from(usuariosDashboard)
    .where(eq(usuariosDashboard.id_cuenta, idCuenta));

  const advisorMap = new Map<string, ApiAdvisor>();
  for (const u of usuarios) {
    if (u.email) {
      advisorMap.set(u.email.toLowerCase(), {
        id: u.email.toLowerCase(),
        name: u.nombre ?? u.email,
        email: u.email,
      });
    }
  }

  // ── Chats ─────────────────────────────────────────────────────────────────
  // Enrich with phone/email via ghl_contact_id (same pattern as chats.ts)
  const chatRows = await db
    .select({
      id: chatsLogs.id_evento,
      datetime: chatsLogs.fecha_y_hora_z,
      nombre_lead: chatsLogs.nombre_lead,
      estado: chatsLogs.estado,
      asesor: chatsLogs.asesor_asignado,
      notasExtra: chatsLogs.notas_extra,
      chat: chatsLogs.chat,
      id_lead: chatsLogs.id_lead,
      iaCategoria: chatsLogs.ia_categoria,
      primerMsgLeadAt: chatsLogs.primer_msg_lead_at,
      primerMsgAt: chatsLogs.primer_msg_at,
      excluida: chatsLogs.excluida_dashboard,
      leadPhone: sql<string | null>`(
        SELECT ${registrosDeLlamada.phone_raw_format}
        FROM ${registrosDeLlamada}
        WHERE ${registrosDeLlamada.ghl_contact_id} = ${chatsLogs.id_lead}
          AND ${registrosDeLlamada.id_cuenta} = ${chatsLogs.id_cuenta}
        LIMIT 1
      )`,
      leadEmail: sql<string | null>`(
        SELECT ${registrosDeLlamada.mail_lead}
        FROM ${registrosDeLlamada}
        WHERE ${registrosDeLlamada.ghl_contact_id} = ${chatsLogs.id_lead}
          AND ${registrosDeLlamada.id_cuenta} = ${chatsLogs.id_cuenta}
        LIMIT 1
      )`,
    })
    .from(chatsLogs)
    .where(
      and(
        eq(chatsLogs.id_cuenta, idCuenta),
        gte(chatsLogs.fecha_y_hora_z, start),
        lte(chatsLogs.fecha_y_hora_z, end),
        sql`${chatsLogs.excluida_dashboard} IS NOT TRUE`,
        ...(closerEmails?.length
          ? [sql`lower(${chatsLogs.asesor_asignado}) = ANY(${sql.raw(`ARRAY[${closerEmails.map((e) => `'${e.toLowerCase().replace(/'/g, "''")}'`).join(",")}]`)})`]
          : []),
      ),
    );

  // ── Llamadas (log_llamadas) ───────────────────────────────────────────────
  const callRows = await db
    .select({
      id: logLlamadas.id,
      datetime: logLlamadas.ts,
      nombre_lead: logLlamadas.nombre_lead,
      mail_lead: logLlamadas.mail_lead,
      phone: logLlamadas.phone,
      contact_id_ghl: logLlamadas.contact_id_ghl,
      tipoEvento: logLlamadas.tipo_evento,
      estadoResultado: logLlamadas.estado_resultado,
      closerName: logLlamadas.nombre_closer,
      closerMail: logLlamadas.closer_mail,
      duracion: logLlamadas.duracion_segundos,
      transcripcion: logLlamadas.transcripcion,
      iaDescripcion: logLlamadas.ia_descripcion,
      speedToLead: logLlamadas.speed_to_lead,
    })
    .from(logLlamadas)
    .where(
      and(
        eq(logLlamadas.id_cuenta, idCuenta),
        gte(logLlamadas.ts, start),
        lte(logLlamadas.ts, end),
        ...(closerEmails?.length
          ? [sql`lower(${logLlamadas.closer_mail}) = ANY(${sql.raw(`ARRAY[${closerEmails.map((e) => `'${e.toLowerCase().replace(/'/g, "''")}'`).join(",")}]`)})`]
          : []),
      ),
    );

  // ── Citas (resumenes_diarios_agendas) ─────────────────────────────────────
  // Fathom stores nombre_closer in the closer column, not email.
  // Resolve email→nombre_closer so ver_solo_propios works on Fathom tenants.
  let citasCloserValues: string[] = [];
  if (closerEmails?.length) {
    citasCloserValues = closerEmails.map((e) => e.toLowerCase().trim());
    const nombreRows = await db
      .select({ email: usuariosDashboard.email, nombre_closer: usuariosDashboard.nombre_closer })
      .from(usuariosDashboard)
      .where(and(eq(usuariosDashboard.id_cuenta, idCuenta), inArray(usuariosDashboard.email, citasCloserValues)));
    for (const u of nombreRows) {
      if (u.nombre_closer) citasCloserValues.push(u.nombre_closer.toLowerCase().trim());
    }
  }

  const appointmentRows = await db
    .select({
      id: resumenesDiariosAgendas.id_registro_agenda,
      fecha: resumenesDiariosAgendas.fecha,
      fechaReunion: resumenesDiariosAgendas.fecha_reunion,
      nombre_lead: resumenesDiariosAgendas.nombre_de_lead,
      email_lead: resumenesDiariosAgendas.email_lead,
      ghl_contact_id: resumenesDiariosAgendas.ghl_contact_id,
      closer: resumenesDiariosAgendas.closer,
      categoria: resumenesDiariosAgendas.categoria,
      cashCollected: resumenesDiariosAgendas.cash_collected,
      facturacion: resumenesDiariosAgendas.facturacion,
      resumenIa: resumenesDiariosAgendas.resumen_ia,
      linkLlamada: resumenesDiariosAgendas.link_llamada,
      excluida: resumenesDiariosAgendas.excluida_dashboard,
    })
    .from(resumenesDiariosAgendas)
    .where(
      and(
        eq(resumenesDiariosAgendas.id_cuenta, idCuenta),
        gte(resumenesDiariosAgendas.fecha, dateFrom),
        lte(resumenesDiariosAgendas.fecha, dateTo),
        ...(citasCloserValues.length
          ? [sql`lower(${resumenesDiariosAgendas.closer}) = ANY(${sql.raw(`ARRAY[${citasCloserValues.map((v) => `'${v.replace(/'/g, "''")}'`).join(",")}]`)})`]
          : []),
      ),
    );

  // ── Merge into lead buckets ───────────────────────────────────────────────
  const buckets = new Map<string, LeadBucket>();

  function getOrCreate(key: string, name: string, email: string | null, phone: string | null, ghlContactId: string | null): LeadBucket {
    if (!key) {
      key = `name:${name.toLowerCase().trim()}`;
    }
    let b = buckets.get(key);
    if (!b) {
      b = {
        name,
        email,
        phone,
        ghlContactId,
        advisor: null,
        lastActivity: "",
        chats: [],
        calls: [],
        appointments: [],
      };
      buckets.set(key, b);
    }
    if (!b.email && email) b.email = email;
    if (!b.phone && phone) b.phone = phone;
    if (!b.ghlContactId && ghlContactId) b.ghlContactId = ghlContactId;
    return b;
  }

  // Process chats
  for (const c of chatRows) {
    const name = c.nombre_lead ?? "Sin nombre";
    const email = c.leadEmail ?? null;
    const phone = c.leadPhone ?? null;
    const ghlId = c.id_lead ?? null;

    const key = leadKey(email, phone, ghlId) || `name:${name.toLowerCase().trim()}`;
    const bucket = getOrCreate(key, name, email, phone, ghlId);

    const messages = (c.chat ?? []) as ChatMessage[];
    const leadMsgs = messages.filter((m) => m.role === "lead").length;
    const agentMsgs = messages.filter((m) => m.role === "agent").length;
    const humanTookOver = agentMsgs > 0;

    let speedToLead: number | null = null;
    if (c.primerMsgLeadAt && c.primerMsgAt) {
      speedToLead = Math.round((c.primerMsgAt.getTime() - c.primerMsgLeadAt.getTime()) / 1000);
      if (speedToLead < 0) speedToLead = null;
    }

    const dt = c.datetime?.toISOString() ?? "";
    bucket.chats.push({
      id: c.id,
      datetime: dt,
      estado: c.estado,
      asesor: c.asesor,
      totalMessages: messages.length,
      leadMessages: leadMsgs,
      agentMessages: agentMsgs,
      speedToLeadSeconds: speedToLead,
      humanTookOver,
      iaCategoria: c.iaCategoria,
      messages: messages.map(chatMsgToApi),
    });

    const normalizedAsesor = normalizeChatCloser(c.asesor, c.notasExtra);
    if (normalizedAsesor && !bucket.advisor) bucket.advisor = normalizedAsesor;
    if (dt > bucket.lastActivity) bucket.lastActivity = dt;
  }

  // Process calls
  for (const c of callRows) {
    const name = c.nombre_lead ?? "Sin nombre";
    const email = c.mail_lead ?? null;
    const phone = c.phone ?? null;
    const ghlId = c.contact_id_ghl ?? null;

    const key = leadKey(email, phone, ghlId) || `name:${name.toLowerCase().trim()}`;
    const bucket = getOrCreate(key, name, email, phone, ghlId);

    const outcome = mapCallOutcome(c.tipoEvento, c.estadoResultado);
    const stl = c.speedToLead ? parseFloat(c.speedToLead) : null;

    const dt = c.datetime?.toISOString() ?? "";
    bucket.calls.push({
      id: c.id,
      datetime: dt,
      tipoEvento: c.tipoEvento,
      outcome,
      closerName: c.closerName,
      closerMail: c.closerMail,
      duracionSegundos: c.duracion,
      transcripcion: c.transcripcion,
      iaDescripcion: c.iaDescripcion,
      speedToLeadMinutes: stl,
    });

    if (c.closerName && !bucket.advisor) bucket.advisor = c.closerName;
    if (dt > bucket.lastActivity) bucket.lastActivity = dt;
  }

  // Process appointments
  for (const a of appointmentRows) {
    if (a.excluida) continue;
    const name = a.nombre_lead ?? "Sin nombre";
    const email = a.email_lead ?? null;
    const ghlId = a.ghl_contact_id ?? null;

    const key = leadKey(email, null, ghlId) || `name:${name.toLowerCase().trim()}`;
    const bucket = getOrCreate(key, name, email, null, ghlId);

    const dt = a.fechaReunion?.toISOString() ?? a.fecha ?? "";
    const cat = a.categoria ?? null;
    const attended = !!cat && !["cancelada", "no_show", "no-show", "default-cancelada", "default-no-show"].includes(cat.toLowerCase());
    const qualified = !!cat && ["calificada", "cerrada", "complet", "default-agendada", "default-asistida", "default-ofertada"].includes(cat.toLowerCase());
    const canceled = !!cat && ["cancelada", "default-cancelada"].includes(cat.toLowerCase());

    bucket.appointments.push({
      id: a.id,
      datetime: dt,
      closer: a.closer,
      categoria: cat,
      attended,
      qualified,
      canceled,
      facturacion: a.facturacion ? parseFloat(a.facturacion) : 0,
      cashCollected: a.cashCollected ? parseFloat(a.cashCollected) : 0,
      resumenIa: a.resumenIa,
      linkLlamada: a.linkLlamada,
    });

    if (a.closer && !bucket.advisor) bucket.advisor = a.closer;
    if (dt > bucket.lastActivity) bucket.lastActivity = dt;
  }

  // ── Secondary merge: consolidate buckets that share email or phone ────────
  // A Twilio call keyed by email:x won't merge with a chat keyed by ghl:y
  // even if both belong to the same lead. Build reverse indexes and merge.
  const emailIndex = new Map<string, string>();
  const phoneIndex = new Map<string, string>();
  const mergedInto = new Map<string, string>();

  function resolveKey(k: string): string {
    while (mergedInto.has(k)) k = mergedInto.get(k)!;
    return k;
  }

  for (const [key, b] of buckets) {
    const normEmail = b.email?.toLowerCase().trim();
    const normPhone = normalizePhone(b.phone);

    let targetKey = key;

    if (normEmail && emailIndex.has(normEmail)) {
      targetKey = resolveKey(emailIndex.get(normEmail)!);
    } else if (normPhone && phoneIndex.has(normPhone)) {
      targetKey = resolveKey(phoneIndex.get(normPhone)!);
    }

    if (targetKey !== key) {
      const target = buckets.get(targetKey)!;
      target.chats.push(...b.chats);
      target.calls.push(...b.calls);
      target.appointments.push(...b.appointments);
      if (!target.email && b.email) target.email = b.email;
      if (!target.phone && b.phone) target.phone = b.phone;
      if (!target.ghlContactId && b.ghlContactId) target.ghlContactId = b.ghlContactId;
      if (!target.advisor && b.advisor) target.advisor = b.advisor;
      if (b.lastActivity > target.lastActivity) target.lastActivity = b.lastActivity;
      mergedInto.set(key, targetKey);
      buckets.delete(key);
    }

    if (normEmail) emailIndex.set(normEmail, resolveKey(key));
    if (normPhone) phoneIndex.set(normPhone, resolveKey(key));
  }

  // ── Build response ────────────────────────────────────────────────────────
  let soloChat = 0;
  let chatLlamada = 0;
  let cita = 0;

  const leads: UnifiedLead[] = [];
  let idx = 0;
  for (const [key, b] of buckets) {
    const hasChat = b.chats.length > 0;
    const hasCall = b.calls.length > 0;
    const hasAppointment = b.appointments.length > 0;

    let stage: JourneyStage;
    if (hasAppointment) {
      stage = "cita";
      cita++;
    } else if (hasCall) {
      stage = "chat_llamada";
      chatLlamada++;
    } else {
      stage = "solo_chat";
      soloChat++;
    }

    // Sort sub-arrays by datetime desc
    b.chats.sort((a, c) => c.datetime.localeCompare(a.datetime));
    b.calls.sort((a, c) => c.datetime.localeCompare(a.datetime));
    b.appointments.sort((a, c) => c.datetime.localeCompare(a.datetime));

    leads.push({
      id: `lead-${idx++}`,
      name: b.name,
      email: b.email,
      phone: b.phone,
      ghlContactId: b.ghlContactId,
      journeyStage: stage,
      lastActivity: b.lastActivity,
      advisor: b.advisor,
      chats: b.chats,
      calls: b.calls,
      appointments: b.appointments,
    });
  }

  // Sort leads by last activity desc
  leads.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

  return {
    leads,
    agg: {
      total: leads.length,
      soloChat,
      chatLlamada,
      cita,
    },
    advisors: Array.from(advisorMap.values()),
  };
}

function mapCallOutcome(tipo: string, estado: string | null): string {
  const t = tipo.toLowerCase();
  if (t.startsWith("efectiva")) return "answered";
  if (t === "no_contesto" || t === "no_contestado") return "no_answer";
  if (t === "buzon") return "voicemail";
  return estado ?? "pending";
}
