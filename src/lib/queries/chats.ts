import { db } from "@/lib/db";
import { chatsLogs, cuentas, registrosDeLlamada } from "@/lib/db/schema";
import type { ChatMessage, MetricaConfig, ChatMetricaCampo, KeywordMatchScope, KeywordCountMode } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, isNull, or, desc, getTableColumns } from "drizzle-orm";
import { zonedDayRange } from "@/lib/date-range";
import type {
  ApiChatLead,
  ChatsAdvisorMetrics,
  ChatsResponse,
  ApiAdvisor,
} from "@/types";
import { parseMetricasConfig } from "@/lib/metricas-engine";

function extractAgentName(messages: ChatMessage[]): string | null {
  const agent = messages.find((m) => m.role === "agent");
  return agent?.name ?? null;
}

/**
 * Calcula cuántos minutos han pasado desde el último mensaje del lead
 * sin que el agente haya respondido después de ese mensaje.
 * Retorna null si el agente ya respondió después del último msg del lead.
 */
function computeMinutesSinceLastLeadMsg(messages: ChatMessage[]): number | null {
  if (messages.length === 0) return null;
  // Encontrar el índice del último mensaje del lead
  let lastLeadIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "lead") { lastLeadIdx = i; break; }
  }
  if (lastLeadIdx === -1) return null;
  // ¿Hay algún mensaje del agente DESPUÉS del último del lead?
  const agentRepliedAfter = messages.slice(lastLeadIdx + 1).some((m) => m.role === "agent");
  if (agentRepliedAfter) return null; // ya fue atendido
  // No hay respuesta → calcular tiempo transcurrido desde ese mensaje
  const lastLeadMsg = messages[lastLeadIdx];
  if (!lastLeadMsg?.timestamp) return null;
  const ts = new Date(lastLeadMsg.timestamp).getTime();
  if (isNaN(ts)) return null;
  const diffMs = Date.now() - ts;
  if (diffMs <= 0) return null;
  return Math.floor(diffMs / 60000);
}

function computeSpeedToLead(
  messages: ChatMessage[],
  emojiTomaAtencion?: string,
  tieneChatbot?: boolean,
  fromDate?: Date,
  primerMsgLeadAt?: Date | null,
): number | null {
  // Chats sin mensajes inbound del lead (solo outbound) tienen primer_msg_lead_at=null → excluir.
  if (primerMsgLeadAt === null) return null;

  // Usar primer_msg_lead_at si está disponible (más fiable que extraer del JSONB).
  // Si no está (undefined), extraer del JSONB como fallback para registros legacy.
  let leadTime: number;
  if (primerMsgLeadAt !== undefined) {
    leadTime = primerMsgLeadAt.getTime();
  } else {
    const firstLead = messages.find((m) => m.role === "lead");
    if (!firstLead?.timestamp) return null;
    const t = new Date(firstLead.timestamp).getTime();
    if (isNaN(t)) return null;
    leadTime = t;
  }

  // Solo calcular speed-to-lead si el primer mensaje del lead cayó dentro del
  // rango de fechas del filtro. Sin esto, conversaciones antiguas que reciben
  // un nuevo mensaje dentro del rango inflan el promedio artificialmente.
  if (fromDate && leadTime < fromDate.getTime()) return null;

  let agentTime: number | null = null;

  if (tieneChatbot && emojiTomaAtencion) {
    // Con chatbot: buscar primer mensaje de agente que contenga el emoji de toma de atención
    // y que sea POSTERIOR al primer mensaje del lead (fix AUT-186: conversaciones outbound).
    const takeoverMsg = messages.find(
      (m) =>
        m.role === "agent" &&
        (m.message ?? "").includes(emojiTomaAtencion) &&
        m.timestamp &&
        new Date(m.timestamp).getTime() > leadTime,
    );
    if (takeoverMsg?.timestamp) {
      const ts = new Date(takeoverMsg.timestamp).getTime();
      if (!isNaN(ts)) agentTime = ts;
    }
  } else {
    // Sin chatbot: primer mensaje de agente POSTERIOR al primer mensaje del lead.
    // Fix AUT-186: en modelos outbound el agente inicia la conv → su primer msg
    // es anterior al primer inbound del lead → diffSec negativo → null incorrecto.
    const firstAgent = messages.find(
      (m) =>
        m.role === "agent" &&
        m.timestamp &&
        new Date(m.timestamp).getTime() > leadTime,
    );
    if (firstAgent?.timestamp) {
      const ts = new Date(firstAgent.timestamp).getTime();
      if (!isNaN(ts)) agentTime = ts;
    }
  }

  if (!agentTime) return null;
  const diffSec = (agentTime - leadTime) / 1000;
  return diffSec > 0 ? diffSec : null;
}

// applyTriggers: mantenido SOLO para calcular speed to lead (emoji_toma_atencion).
// Ya NO se usa para clasificar el estado del chat (ahora lo hace la IA).
function detectTakeoverEmoji(
  msgs: ChatMessage[],
  emojiTomaAtencion: string,
): boolean {
  return msgs.some((m) => m.role === "agent" && (m.message ?? "").includes(emojiTomaAtencion));
}

export async function getChats(
  idCuenta: number,
  dateFrom: string,
  dateTo: string,
  closerEmails?: string[],
): Promise<ChatsResponse> {
  const emailsLower = (closerEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const [tzRow] = await db.select({ zona_horaria_iana: cuentas.zona_horaria_iana }).from(cuentas).where(eq(cuentas.id_cuenta, idCuenta)).limit(1);
  const { fromDate, toDate } = zonedDayRange(dateFrom, dateTo, tzRow?.zona_horaria_iana);

  const [[cuentaRow], rows] = await Promise.all([
    db
      .select({ configuracion_ui: cuentas.configuracion_ui, metricas_config: cuentas.metricas_config, ghl_app_uninstalled_at: cuentas.ghl_app_uninstalled_at })
      .from(cuentas)
      .where(eq(cuentas.id_cuenta, idCuenta))
      .limit(1),
    db
      .select({
        ...getTableColumns(chatsLogs),
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
          gte(sql`COALESCE(${chatsLogs.primer_msg_at}, ${chatsLogs.primer_msg_lead_at}, ${chatsLogs.fecha_y_hora_z})`, fromDate),
          lte(sql`COALESCE(${chatsLogs.primer_msg_at}, ${chatsLogs.primer_msg_lead_at}, ${chatsLogs.fecha_y_hora_z})`, toDate),
          sql`${chatsLogs.excluida_dashboard} IS NOT TRUE`,
        ),
      )
      .orderBy(desc(sql`COALESCE(${chatsLogs.primer_msg_at}, ${chatsLogs.primer_msg_lead_at}, ${chatsLogs.fecha_y_hora_z})`)),
  ]);

  const chatConfig = cuentaRow?.configuracion_ui?.chat_config ?? {};
  const tieneChatbot = chatConfig.tiene_chatbot ?? false;
  const emojiTomaAtencion = chatConfig.emoji_toma_atencion ?? undefined;

  const chatsList: ApiChatLead[] = rows.map((r) => {
    const msgs: ChatMessage[] = Array.isArray(r.chat) ? r.chat : [];
    const agentMsgs = msgs.filter((m) => m.role === "agent");
    const leadMsgs = msgs.filter((m) => m.role === "lead");
    const agentName = extractAgentName(msgs);
    const speed = computeSpeedToLead(msgs, emojiTomaAtencion, tieneChatbot, fromDate, r.primer_msg_lead_at);
    const minutesSinceLastLeadMsg = computeMinutesSinceLastLeadMsg(msgs);
    // humanTookOver: con chatbot → true si el emoji de toma apareció O si hay mensajes de agente (fallback).
    // Sin chatbot → true si hay cualquier mensaje de agente (comportamiento normal).
    // El fallback es necesario cuando los asesores no incluyen el emoji en sus mensajes.
    // Alineado con la lógica de dashboard.ts líneas 975-984.
    const humanTookOver = tieneChatbot && emojiTomaAtencion
      ? (detectTakeoverEmoji(msgs, emojiTomaAtencion) || agentMsgs.length > 0)
      : agentMsgs.length > 0;

    // Estado proviene de la IA (chats_logs.estado escrito por analyzeChatsNightly)
    // Los triggers de emoji ya NO determinan el estado del chat.
    const estadoFinal = r.estado ?? null;

    return {
      id: r.id_evento,
      leadName: r.nombre_lead,
      leadId: r.id_lead,
      leadPhone: r.leadPhone ?? null,
      leadEmail: r.leadEmail ?? null,
      agentName,
      // Normalizar asesor: prioridad asesor_asignado → notas_extra → agentName.
      // notas_extra guarda el nombre real cuando closerName resolvió pero asesor_asignado
      // falló (e.g. en cuentas donde el userId no llega en el payload de GHL).
      // "Agente", "agent", "bot" se tratan como sin asignar.
      asesorAsignado: (() => {
        const candidates = [
          r.asesor_asignado?.trim(),
          r.notas_extra?.trim() !== "por asignar" ? r.notas_extra?.trim() : undefined,
          agentName?.trim(),
        ];
        for (const c of candidates) {
          if (!c) continue;
          const lower = c.toLowerCase();
          // Estos son mensajes automáticos de GHL, no de un humano real → tratar como sin asignar
          if (lower === "agente" || lower === "agent" || lower === "bot" || lower === "por asignar" || lower === "workflow" || lower === "api/bot" || lower === "campaña" || lower === "campaign") continue;
          return c;
        }
        return null;
      })(),
      datetime: r.fecha_y_hora_z?.toISOString() ?? "",
      totalMessages: msgs.length,
      agentMessages: agentMsgs.length,
      leadMessages: leadMsgs.length,
      speedToLeadSeconds: speed,
      estado: estadoFinal,
      notasExtra: r.notas_extra,
      messages: msgs.map((m) => ({
        name: m.name,
        role: m.role,
        type: m.type,
        message: m.message,
        timestamp: m.timestamp,
      })),
      tagsInternos: Array.isArray(r.tags_internos) ? r.tags_internos : undefined,
      minutesSinceLastLeadMsg,
      humanTookOver,
      iaCategoria: r.ia_categoria ?? null,
      iaObjeciones: Array.isArray(r.ia_objeciones) ? r.ia_objeciones as Array<{ objecion: string; categoria: string }> : null,
    };
  });

  const filteredChats =
    emailsLower.length > 0
      ? chatsList.filter((c) => {
          const key = (c.asesorAsignado ?? c.agentName ?? "").trim().toLowerCase();
          return emailsLower.includes(key);
        })
      : chatsList;
  const chatsFinal = emailsLower.length > 0 ? filteredChats : chatsList;

  // "Activos" = chats donde un humano realmente respondió.
  // Con chatbot: solo si el emoji de toma apareció. Sin chatbot: cualquier msg de agente.
  const contacted = chatsFinal.filter((c) => c.humanTookOver);
  const speedVals = chatsFinal
    .filter((c) => c.speedToLeadSeconds != null)
    .map((c) => c.speedToLeadSeconds!);

  const agg = {
    assigned: chatsFinal.length,
    activos: contacted.length,
    seguimientosTotal: chatsFinal.reduce((s, c) => s + c.totalMessages, 0),
    // null cuando no hay timestamps reales; evita mostrar "0.0 min" engañoso (AUT-181)
    speedAvg: speedVals.length > 0 ? speedVals.reduce((s, v) => s + v, 0) / speedVals.length : null,
  };

  // Normalizar key: usar asesorAsignado primero, luego agentName, nunca vacío
  const normAgentKey = (c: ApiChatLead) => {
    const k = (c.asesorAsignado ?? c.agentName ?? "").trim();
    return k || "Sin asignar";
  };

  const byAgent: Record<string, ApiChatLead[]> = {};
  for (const c of chatsFinal) {
    const key = normAgentKey(c);
    if (!byAgent[key]) byAgent[key] = [];
    byAgent[key].push(c);
  }

  const advisorMetrics: Record<string, ChatsAdvisorMetrics> = {};
  const advisors: ApiAdvisor[] = [];

  for (const [name, chats] of Object.entries(byAgent)) {
    const activos = chats.filter((c) => c.humanTookOver).length;
    const speeds = chats.filter((c) => c.speedToLeadSeconds != null).map((c) => c.speedToLeadSeconds!);
    advisorMetrics[name] = {
      advisorName: name,
      asignados: chats.length,
      activos,
      seguimientos: chats.reduce((s, c) => s + c.totalMessages, 0),
      speedToLead: speeds.length > 0 ? speeds.reduce((s, v) => s + v, 0) / speeds.length : null,
    };
    advisors.push({ id: name, name });
  }

  const allMetricasConfig = parseMetricasConfig(cuentaRow?.metricas_config);
  const chatMetricasConfig = allMetricasConfig.filter((m) => m.tipo === "chat");

  const metricasCustom = computeChatMetricas(chatMetricasConfig, chatsFinal);

  const metricasChatConfig = chatMetricasConfig.length > 0
    ? chatMetricasConfig.map((m) => ({ id: m.id, nombre: m.nombre, formato: m.formato, color: m.color, descripcion: m.descripcion }))
    : undefined;

  return { chats: chatsFinal, agg, advisorMetrics, advisors, metricasCustom, metricasChatConfig, ghl_app_desconectada: !!cuentaRow?.ghl_app_uninstalled_at };
}

// ─── Cálculo de métricas custom tipo "chat" ───────────────────────────────────

/**
 * Extrae el valor numérico de un campo de chat para una métrica tipo "chat".
 * @internal — exportado para tests unitarios
 */
export function extractChatCampoValue(chat: ApiChatLead, campo: ChatMetricaCampo): number | null {
  switch (campo) {
    case "total_mensajes":      return chat.totalMessages;
    case "mensajes_agente":     return chat.agentMessages;
    case "mensajes_lead":       return chat.leadMessages;
    case "speed_to_lead":       return chat.speedToLeadSeconds;
    case "humano_tomo_control": return chat.humanTookOver ? 1 : 0;
    case "objeciones_detectadas": return chat.iaObjeciones?.length ?? 0;
    default:                    return null;
  }
}

/**
 * Calcula el valor agregado de una métrica tipo "chat" sobre todos los chats del período.
 * @internal — exportado para tests unitarios
 */
export function agregarChatValues(values: (number | null)[], agregacion: MetricaConfig["chatAgregacion"]): number | null {
  const nonNull = values.filter((v): v is number => v !== null);
  if (nonNull.length === 0) return null;
  switch (agregacion ?? "suma") {
    case "suma":    return nonNull.reduce((s, v) => s + v, 0);
    case "promedio": return nonNull.reduce((s, v) => s + v, 0) / nonNull.length;
    case "conteo":  return nonNull.filter((v) => v > 0).length;
    default:        return nonNull.reduce((s, v) => s + v, 0);
  }
}

// ─── Keyword matching (mirrors Cerebro's computeKeywordMetrica) ─────────────

const ACCENT_MAP: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u",
  à: "a", è: "e", ì: "i", ò: "o", ù: "u",
  ä: "a", ë: "e", ï: "i", ö: "o",
  â: "a", ê: "e", î: "i", ô: "o", û: "u",
  ñ: "n",
};

function removeAccents(text: string): string {
  return text.replace(/[áéíóúüàèìòùäëïöâêîôûñ]/g, (ch) => ACCENT_MAP[ch] ?? ch);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildKeywordRegex(keywords: string[], normalizeAccents: boolean): RegExp {
  const patterns = keywords.map((kw) => {
    let escaped = escapeRegex(kw.toLowerCase());
    if (normalizeAccents) escaped = removeAccents(escaped);
    return `\\b${escaped}\\b`;
  });
  return new RegExp(patterns.join("|"), "gi");
}

function extractTextsForScope(
  messages: Array<{ role?: string; message?: string | null }>,
  scope: KeywordMatchScope,
): string[] {
  const texts: string[] = [];
  for (const msg of messages) {
    if (!msg.message) continue;
    if (scope === "todo_el_chat" || msg.role === "lead") {
      texts.push(msg.message);
    }
  }
  return texts;
}

/** @internal — exportado para tests unitarios */
export function computeKeywordMetricaValue(
  chats: ApiChatLead[],
  config: MetricaConfig,
): number {
  // Sanitizar: descartar keywords vacías o solo-espacios. Una cadena vacía
  // produce el patrón \b\b (match de ancho cero) que en countMode="ocurrencias"
  // deja regex.lastIndex sin avanzar → loop infinito síncrono que congela el
  // render. Filtrar aquí protege el path de config persistida (la UI ya valida).
  const keywords = (config.keywords ?? []).map((k) => k.trim()).filter((k) => k.length > 0);
  const matchScope: KeywordMatchScope = config.matchScope ?? "mensajes_lead";
  const countMode: KeywordCountMode = config.countMode ?? "chats";
  const normalizeAccents = config.normalizeAccents !== false;

  if (keywords.length === 0) return 0;

  const regex = buildKeywordRegex(keywords, normalizeAccents);
  let total = 0;

  for (const chat of chats) {
    const messages = chat.messages ?? [];
    const texts = extractTextsForScope(messages, matchScope);

    let chatMatches = 0;
    for (const text of texts) {
      const haystack = normalizeAccents
        ? removeAccents(text.toLowerCase())
        : text.toLowerCase();
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(haystack)) !== null) {
        chatMatches++;
        if (countMode === "chats") break;
      }
      if (countMode === "chats" && chatMatches > 0) break;
    }

    if (countMode === "chats") {
      total += chatMatches > 0 ? 1 : 0;
    } else {
      total += chatMatches;
    }
  }

  return total;
}

function isKeywordConfig(m: MetricaConfig): boolean {
  return m.tipo === "chat" && m.chatSubtipo === "conteo_keyword";
}

function isStandardChatConfig(m: MetricaConfig): boolean {
  return m.tipo === "chat" && !m.chatSubtipo;
}

/** @internal — exportado para tests unitarios */
export function computeChatMetricas(
  metricasConfig: MetricaConfig[],
  chats: ApiChatLead[],
): Record<string, number | null> | undefined {
  const standardMetricas = metricasConfig.filter((m) => isStandardChatConfig(m) && m.chatCampo);
  const keywordMetricas = metricasConfig.filter(isKeywordConfig);

  if (standardMetricas.length === 0 && keywordMetricas.length === 0) return undefined;

  const result: Record<string, number | null> = {};

  for (const metrica of standardMetricas) {
    const campo = metrica.chatCampo;
    if (!campo) continue;
    const values = chats.map((c) => extractChatCampoValue(c, campo));
    result[metrica.id] = agregarChatValues(values, metrica.chatAgregacion);
  }

  for (const metrica of keywordMetricas) {
    result[metrica.id] = computeKeywordMetricaValue(chats, metrica);
  }

  return result;
}

export async function updateChat(
  id: number,
  idCuenta: number,
  data: { nombre_lead?: string; closer?: string; estado?: string },
): Promise<boolean> {
  const [row] = await db
    .select({ id: chatsLogs.id_evento, id_cuenta: chatsLogs.id_cuenta })
    .from(chatsLogs)
    .where(eq(chatsLogs.id_evento, id))
    .limit(1);

  if (!row || row.id_cuenta !== idCuenta) return false;

  const setClause: Record<string, unknown> = {};
  if (data.nombre_lead !== undefined) setClause.nombre_lead = data.nombre_lead;
  if (data.estado !== undefined) setClause.estado = data.estado;
  if (data.closer !== undefined) setClause.asesor_asignado = data.closer || null;

  if (Object.keys(setClause).length > 0) {
    await db.update(chatsLogs).set(setClause).where(eq(chatsLogs.id_evento, id));
  }

  return true;
}
