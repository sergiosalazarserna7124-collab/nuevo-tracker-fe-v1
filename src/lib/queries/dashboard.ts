import { db } from "@/lib/db";
import { resumenesDiariosAgendas, logLlamadas, cuentas, chatsLogs, metasCuenta, metricasWebhook, usuariosDashboard, eventosLlamadasTiempoReal } from "@/lib/db/schema";
import { normalizeEmbudoEtapas } from "@/lib/db/schema";
import type { EmbudoEtapa, MetricaConfig, ChatMessage } from "@/lib/db/schema";
import { calcMetricaManual, calcMetricaAutomatica, DEFAULT_METRICAS_CONFIG, DEFAULT_EMBUDO_CONFIG, parseMetricasConfig, normalizeMetricasConfig, KPI_DEFAULT_KEYS, type MetricaEngineContext } from "@/lib/metricas-engine";
import { resolveFinancialValues } from "@/lib/queries/resolve-financial";
import { eq, and, or, gt, gte, lte, isNull, isNotNull, inArray, sql } from "drizzle-orm";
import { zonedDayRange } from "@/lib/date-range";
import { agendaDedupKey } from "./agenda-dedup-key";
import { esLlamadaContestada } from "./llamadas";
import type {
  DashboardKpis,
  DashboardAdvisorRow,
  DashboardVolumeDay,
  DashboardObjecion,
  DashboardObjecionDetail,
  DashboardObjecionConDetalle,
  DashboardObjecionesPorCanal,
  ObjecionCanal,
  DashboardResponse,
  DashboardAdsSummary,
  ApiAdvisor,
  ChatKpis,
  AlertaMeta,
  SegmentoCalificadoCanal,
  SegmentoCanal,
} from "@/types";

// Nuevas etapas fijas del sistema + legacy backward compat
const DEFAULT_ATTENDED = ["calificada", "no_calificada", "cerrada", "Cerrada", "Ofertada", "No_Ofertada", "cerrada", "ofertada", "no_ofertada"];
const DEFAULT_CLOSED = ["cerrada", "Cerrada"];
const DEFAULT_EFFECTIVE = ["calificada", "cerrada", "Cerrada", "Ofertada", "cerrada", "ofertada"];

/**
 * Normaliza un valor de fecha a string "YYYY-MM-DD".
 * Algunos drivers (p. ej. PostgreSQL) devuelven columnas date/timestamp como Date;
 * otros como string. Usar esto evita TypeError en volumeByDay.sort (localeCompare es de string).
 */
function toDateString(value: Date | string | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

const FIXED_STAGE_GENDER_VARIANTS: Record<string, string[]> = {
  cerrada: ["cerrado"],
  cerrado: ["cerrada"],
};

function expandFixedStageVariants(ids: string[], embudo: EmbudoEtapa[]): string[] {
  const fixedIds = new Set(
    embudo.filter((e) => e.es_fija === true).map((e) => e.id.toLowerCase())
  );
  const expanded: string[] = [...ids];
  for (const id of ids) {
    if (!fixedIds.has(id)) continue;
    const variants = FIXED_STAGE_GENDER_VARIANTS[id];
    if (variants) expanded.push(...variants);
  }
  return expanded;
}

export function buildFunnelSets(embudo: EmbudoEtapa[] | null | undefined) {
  if (!embudo || embudo.length === 0) {
    return {
      attendedSet: new Set(DEFAULT_ATTENDED),
      closedSet: new Set(DEFAULT_CLOSED),
      effectiveSet: new Set(DEFAULT_EFFECTIVE),
      qualifiedSet: new Set(),
      etapas: null,
    };
  }

  // Usar flags es_calificada, es_cerrada como criterio principal (nuevo sistema)
  const calificadas = embudo.filter((e) => e.es_calificada === true).map((e) => e.id.toLowerCase());
  const cerradas = embudo.filter((e) => e.es_cerrada === true).map((e) => e.id.toLowerCase());

  // IDs y nombres para backward compat con embudos sin flags
  const getLabel = (e: EmbudoEtapa) =>
    (e?.nombre ?? (e as any)?.name ?? e?.id ?? "").trim();
  const ids = embudo.map((e) => (e?.id ?? "").trim()).filter(Boolean);
  const nombres = embudo.map(getLabel).filter(Boolean);
  const allKeys = [...new Set([...nombres, ...ids])];
  const allKeysLower = allKeys.map(k => k.toLowerCase());

  // closedSet: etapas cerradas por flag o por texto heurístico
  const closedByFlag = cerradas.length > 0;
  const cerradasWithVariants = closedByFlag
    ? expandFixedStageVariants(cerradas, embudo)
    : cerradas;
  const closedSet = closedByFlag
    ? new Set(cerradasWithVariants)
    : new Set(allKeysLower.filter((k) => k.includes("cerrad") || k.includes("closed")));

  // effectiveSet: calificadas + cerradas (las que "asistieron y valió la pena")
  const effectiveByFlag = calificadas.length > 0 || cerradas.length > 0;
  const effectiveSet = effectiveByFlag
    ? new Set([...calificadas, ...cerradasWithVariants])
    : new Set([...allKeysLower.filter((k) =>
        k.includes("cerrad") || k.includes("closed") ||
        k.includes("ofertad") || k.includes("offered") ||
        k === "calificada"
      ), ...DEFAULT_EFFECTIVE.map(k => k.toLowerCase())]);

  // attendedSet: todas excepto cancelada, no_show, pdte
  const SYSTEM_EXCLUDED = new Set(["cancelada", "no_show", "noshow", "pdte", "pendiente"]);
  const attendedFromEmbudo = allKeysLower.filter((k) => !SYSTEM_EXCLUDED.has(k) && k !== "");

  return {
    attendedSet: new Set([...attendedFromEmbudo, ...DEFAULT_ATTENDED.map(k => k.toLowerCase())]),
    closedSet,
    effectiveSet,
    qualifiedSet: new Set(calificadas),
    etapas: embudo,
  };
}

export async function getDashboard(
  idCuenta: number,
  dateFrom: string,
  dateTo: string,
  closerEmails?: string[],
  filterTags?: string[],
): Promise<DashboardResponse> {
  const emails = (closerEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);

  const [cuentaRow] = await db
    .select({
      configuracion_ui: cuentas.configuracion_ui,
      embudo_personalizado: cuentas.embudo_personalizado,
      metricas_personalizadas: cuentas.metricas_personalizadas,
      metricas_config: cuentas.metricas_config,
      metricas_manual_data: cuentas.metricas_manual_data,
      dashboards_personalizados: cuentas.dashboards_personalizados,
      fuente_llamadas: cuentas.fuente_llamadas,
      configuracion_ads: cuentas.configuracion_ads,
      razones_perdida_config: cuentas.razones_perdida_config,
      razones_perdida_data: cuentas.razones_perdida_data,
      zona_horaria_iana: cuentas.zona_horaria_iana,
    })
    .from(cuentas)
    .where(eq(cuentas.id_cuenta, idCuenta))
    .limit(1);

  const { fromDate, toDate } = zonedDayRange(dateFrom, dateTo, cuentaRow?.zona_horaria_iana);

  const fuenteFinanciera = cuentaRow?.configuracion_ui?.fuente_datos_financieros;
  const useExterna = fuenteFinanciera === "api_externa";
  const cerradasCuentanComoCal = cuentaRow?.configuracion_ui?.cerradas_cuentan_como_calificadas ?? true;
  const embudoRawArr = Array.isArray(cuentaRow?.embudo_personalizado) ? normalizeEmbudoEtapas(cuentaRow.embudo_personalizado) : [];
  const embudoRaw = embudoRawArr.length > 0 ? embudoRawArr : DEFAULT_EMBUDO_CONFIG;
  const { attendedSet, closedSet, effectiveSet, qualifiedSet, etapas } = buildFunnelSets(embudoRaw);
  // closedByFlag: el embudo tiene etapas cerradas explícitamente configuradas (es_cerrada=true o texto heurístico).
  // Si closedSet tiene entradas que no son las default, hay configuración real.
  const DEFAULT_CLOSED_HEURISTIC = new Set(["cerrada", "closed", "cerrado"]);
  const closedByFlag = closedSet.size > 0 && ![...closedSet].every(k => DEFAULT_CLOSED_HEURISTIC.has(k))
    || (embudoRaw ?? []).some((e: EmbudoEtapa) => e.es_cerrada === true);
  
  // Si cerradasCuentanComoCal=true, añadir las etapas cerradas al set de calificadas
  const effectiveQualifiedSet = cerradasCuentanComoCal
    ? new Set([...qualifiedSet, ...closedSet])
    : qualifiedSet;

  const fechaFilter = or(
    // Caso 1: fecha_reunion conocida y dentro del rango (cita histórica o actual)
    and(
      isNotNull(resumenesDiariosAgendas.fecha_reunion),
      gte(resumenesDiariosAgendas.fecha_reunion, fromDate),
      lte(resumenesDiariosAgendas.fecha_reunion, toDate),
    ),
    // Caso 2: PDTE con fecha_reunion futura — insertada en el rango seleccionado.
    // Una cita pendiente es prospectiva por naturaleza; excluirla por ser futura
    // hace que el dashboard muestre 0 pendientes cuando el agendamiento acaba de ocurrir.
    and(
      eq(resumenesDiariosAgendas.categoria, 'PDTE'),
      isNotNull(resumenesDiariosAgendas.fecha_reunion),
      gt(resumenesDiariosAgendas.fecha_reunion, sql`NOW()`),
      // Fin de día del rango zonificado (no medianoche cruda): si no, una cita
      // agendada por la tarde del último día del período queda excluida.
      gte(resumenesDiariosAgendas.fecha, fromDate.toISOString()),
      lte(resumenesDiariosAgendas.fecha, toDate.toISOString()),
    ),
    // Caso 3: sin fecha_reunion → usa fecha de inserción
    and(
      isNull(resumenesDiariosAgendas.fecha_reunion),
      gte(resumenesDiariosAgendas.fecha, fromDate.toISOString()),
      lte(resumenesDiariosAgendas.fecha, toDate.toISOString()),
    ),
  )!;
  const agendaConditions = [
    eq(resumenesDiariosAgendas.id_cuenta, idCuenta),
    fechaFilter,
    eq(resumenesDiariosAgendas.excluida_dashboard, false),
  ];
  if (emails.length > 0) agendaConditions.push(inArray(resumenesDiariosAgendas.closer, emails));

  // Excluir "pdte" y "contacto_creado" — son eventos de lead nuevo, NO llamadas realizadas
  const TIPOS_NO_LLAMADA = ["pdte", "contacto_creado"];
  const callConditions = [
    eq(logLlamadas.id_cuenta, idCuenta),
    gte(logLlamadas.ts, fromDate),
    lte(logLlamadas.ts, toDate),
    sql`${logLlamadas.tipo_evento} NOT IN (${sql.join(TIPOS_NO_LLAMADA.map((t) => sql`${t}`), sql`, `)})`,
  ];
  if (emails.length > 0) callConditions.push(inArray(logLlamadas.closer_mail, emails));

  // Query separada para eventos de leads nuevos (pdte/contacto_creado)
  const newLeadConditions = [
    eq(logLlamadas.id_cuenta, idCuenta),
    gte(logLlamadas.ts, fromDate),
    lte(logLlamadas.ts, toDate),
    sql`${logLlamadas.tipo_evento} IN (${sql.join(TIPOS_NO_LLAMADA.map((t) => sql`${t}`), sql`, `)})`,
  ];
  if (emails.length > 0) newLeadConditions.push(inArray(logLlamadas.closer_mail, emails));

  // Check if ads is configured — fetch ads agg data early (needed for metricas tipo=ads)
  const adsCfgEarly = cuentaRow?.configuracion_ads;
  type AdsCfgType = { meta?: { activo?: boolean; ad_account_id?: string }; google?: { activo?: boolean; customer_id?: string }; tiktok?: { activo?: boolean; advertiser_id?: string } };
  const adsCfgTyped = adsCfgEarly as AdsCfgType | undefined;
  const hasAdsConfigEarly = !!(
    (adsCfgTyped?.meta?.activo && adsCfgTyped.meta.ad_account_id) ||
    (adsCfgTyped?.google?.activo && adsCfgTyped.google.customer_id) ||
    (adsCfgTyped?.tiktok?.activo && adsCfgTyped.tiktok.advertiser_id)
  );

  const adsAggPromise: Promise<Record<string, unknown>> = hasAdsConfigEarly
    ? db.execute(sql`
        WITH extras AS (
          SELECT plataforma, key, AVG((value #>> '{}')::numeric) AS avg_val
          FROM resumenes_diarios_ads r2,
               jsonb_each(r2.datos_extra) AS kv(key, value)
          WHERE r2.id_cuenta = ${idCuenta}
            AND r2.fecha BETWEEN ${dateFrom}::date AND ${dateTo}::date
            AND r2.datos_extra IS NOT NULL
            AND r2.datos_extra != '{}'::jsonb
            AND (value #>> '{}')::text ~ '^[0-9]+\\.?[0-9]*$'
          GROUP BY plataforma, key
        ),
        extras_agg AS (
          SELECT plataforma, jsonb_object_agg(key, avg_val)::text AS campos_extra_json
          FROM extras GROUP BY plataforma
        ),
        with_acct_flag AS (
          SELECT rda.*,
            BOOL_OR(COALESCE(rda.campana, '') = '') OVER (PARTITION BY rda.plataforma, rda.fecha) AS _has_acct
          FROM resumenes_diarios_ads rda
          WHERE rda.id_cuenta = ${idCuenta}
            AND rda.fecha BETWEEN ${dateFrom}::date AND ${dateTo}::date
        )
        SELECT
          SUM(rda.gasto_total_ad) AS gasto,
          SUM(rda.impresiones_totales) AS impresiones,
          SUM(rda.clicks_unicos) AS clicks,
          AVG(CASE WHEN rda.gasto_total_ad > 0 THEN rda.ctr END) AS ctr,
          AVG(CASE WHEN rda.gasto_total_ad > 0 THEN rda.cpm END) AS cpm,
          AVG(CASE WHEN rda.gasto_total_ad > 0 THEN rda.cpc END) AS cpc,
          array_agg(DISTINCT rda.plataforma) FILTER (WHERE rda.gasto_total_ad > 0) AS plataformas,
          MAX(ea.campos_extra_json) AS campos_extra_json,
          AVG(CASE WHEN rda.play_rate > 0 THEN rda.play_rate END) AS avg_play_rate,
          AVG(CASE WHEN rda.engagement > 0 THEN rda.engagement END) AS avg_engagement
        FROM with_acct_flag rda
        LEFT JOIN extras_agg ea ON ea.plataforma = rda.plataforma
        WHERE (rda._has_acct AND COALESCE(rda.campana, '') = '')
           OR (NOT rda._has_acct)
      `).then(r => (r.rows[0] ?? {}) as Record<string, unknown>)
    : Promise.resolve({} as Record<string, unknown>);

  // Leads con llamada PDTE (pendiente de gestionar) — contacts que llegaron pero nadie ha llamado aún.
  // Se lee de registros_de_llamada via SQL raw porque id_cuenta es varchar en esa tabla.
  const pendientesPromise = db.execute(
    sql`SELECT COUNT(*)::int AS total
        FROM registros_de_llamada
        WHERE id_cuenta = ${String(idCuenta)}
          AND estado = 'pdte'
          AND excluido_metricas IS NOT TRUE
          AND fecha_evento >= ${fromDate}
          AND fecha_evento <= ${toDate}`,
  ).then((r) => Number((r.rows[0] as { total?: number })?.total ?? 0));

  // Leads descartados: marcados como 'descartado' (etiqueta descartar-lead o
  // descarte manual). A diferencia del resto de KPIs, aquí SÍ queremos los
  // excluido_metricas=true — el descarte es justo lo que cuenta esta métrica.
  // Se cuenta lead único (ghl_contact_id) para no inflar con re-registros.
  const descartadosPromise = db.execute(
    sql`SELECT COUNT(DISTINCT COALESCE(ghl_contact_id, id_registro::text))::int AS total
        FROM registros_de_llamada
        WHERE id_cuenta = ${String(idCuenta)}
          AND calificacion_manual = 'descartado'
          AND fecha_evento >= ${fromDate}
          AND fecha_evento <= ${toDate}`,
  ).then((r) => Number((r.rows[0] as { total?: number })?.total ?? 0));

  // Mostrar agendas si hay datos, independientemente de si Fathom está configurado.
  // Las agendas pueden provenir de GHL webhooks, Twilio, u otras fuentes (no solo Fathom).

  const [agendas, calls, newLeadEvents, adsAggRowEarly, pendientesLlamadas, leadsDescartados] = await Promise.all([
    db
      .select()
      .from(resumenesDiariosAgendas)
      .where(and(...agendaConditions)),
    db
      .select()
      .from(logLlamadas)
      .where(and(...callConditions)),
    db
      .select({
        id: logLlamadas.id,
        mail_lead: logLlamadas.mail_lead,
        nombre_lead: logLlamadas.nombre_lead,
        phone: logLlamadas.phone,
        contact_id_ghl: logLlamadas.contact_id_ghl,
        closer_mail: logLlamadas.closer_mail,
        nombre_closer: logLlamadas.nombre_closer,
        ts: logLlamadas.ts,
      })
      .from(logLlamadas)
      .where(and(...newLeadConditions)),
    adsAggPromise,
    pendientesPromise,
    descartadosPromise,
  ]);

  // Parse ads fields for use in metricas tipo="ads" and adsSummary widget
  const parseCamposExtraEarly = (raw: unknown): Record<string, number> => {
    if (!raw) return {};
    let obj: Record<string, unknown> = {};
    if (typeof raw === 'string') { try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { return {}; } }
    else if (typeof raw === 'object') { obj = raw as Record<string, unknown>; }
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) { const n = typeof v === 'number' ? v : parseFloat(String(v)); if (Number.isFinite(n)) result[k] = n; }
    return result;
  };
  const adsGastoTotal = Number(adsAggRowEarly.gasto ?? 0);
  const adsImpresiones = Number(adsAggRowEarly.impresiones ?? 0);
  const adsClicks = Number(adsAggRowEarly.clicks ?? 0);
  const adsCtr = Number(adsAggRowEarly.ctr ?? 0);
  const adsCpm = Number(adsAggRowEarly.cpm ?? 0);
  const adsCpc = Number(adsAggRowEarly.cpc ?? 0);
  const adsPlayRate = Number(adsAggRowEarly.avg_play_rate ?? 0);
  const adsEngagement = Number(adsAggRowEarly.avg_engagement ?? 0);
  const adsCamposExtra = parseCamposExtraEarly(adsAggRowEarly.campos_extra_json);
  const adsPlataformasEarly = Array.isArray(adsAggRowEarly.plataformas) ? (adsAggRowEarly.plataformas as string[]).filter(Boolean) : [];
  // Lookup map for tipo="ads" metricas: adsCampo → value
  // NOTE: percentage fields (ctr, play_rate, engagement) are stored as 0-100 in BD
  // but formato="porcentaje" renders via pctFmt(n) = (n*100)%, so store as 0-1 fraction here.
  // Dollar/count fields stay as-is.
  const ADS_CAMPO_MAP: Record<string, number> = {
    gastoTotal: adsGastoTotal, gasto: adsGastoTotal,
    impresiones: adsImpresiones,
    clicks: adsClicks,
    ctr: adsCtr / 100,          // BD: 1.73 → map: 0.0173 → pctFmt: 1.73%
    cpm: adsCpm,
    cpc: adsCpc,
    play_rate: adsPlayRate / 100,      // BD: 39.67 → map: 0.3967 → pctFmt: 39.67%
    engagement: adsEngagement / 100,   // BD: 30.12 → map: 0.3012 → pctFmt: 30.12%
    engagement_rate: adsEngagement / 100,
    ...adsCamposExtra, // frequency, unique_ctr etc. (rendered as numbers, not pctFmt)
  };

  let filteredAgendas = agendas;
  let filteredCalls = calls;
  let filteredNewLeadEvents = newLeadEvents;
  if (filterTags && filterTags.length > 0) {
    const tagSet = new Set(filterTags);
    // Tags son propiedades de LLAMADAS — solo filtramos llamadas.
    // Las agendas (videollamadas/citas) NO se filtran por tags de llamadas porque:
    // 1. Los tags de llamadas no están en resumenes_diarios_agendas
    // 2. Filtrar agendas por tags de llamadas causa que "Agendadas" muestre números
    //    distintos en el panel ejecutivo vs panel de rendimiento para el mismo rango,
    //    creando confusión (el mismo dato "agendas" debería ser siempre el mismo número).
    filteredCalls = calls.filter((c) => Array.isArray(c.tags_internos) && c.tags_internos.some((t) => tagSet.has(t)));
    // newLeadEvents no tiene tags_internos en la query selectiva — no filtrar por tags
  }

  // AUT-603: Build set of lead identifiers with effective calls — used to verify real interaction.
  // An attendance only counts if there's a Fathom signal OR an effective call for the same lead.
  const effectiveCallLeadKeys = new Set<string>();
  for (const c of filteredCalls) {
    if (!(c.tipo_evento ?? "").startsWith("efectiva_")) continue;
    if (c.mail_lead?.trim()) effectiveCallLeadKeys.add(c.mail_lead.trim().toLowerCase());
    if (c.phone?.trim()) effectiveCallLeadKeys.add(c.phone.trim());
    if (c.contact_id_ghl?.trim()) effectiveCallLeadKeys.add(c.contact_id_ghl.trim());
  }
  const hasRealInteraction = (a: (typeof filteredAgendas)[0]): boolean => {
    if (a.transcripcion_fathom && a.transcripcion_fathom.trim() !== "") return true;
    if (a.link_llamada && a.link_llamada.trim() !== "") return true;
    if (a.email_lead?.trim() && effectiveCallLeadKeys.has(a.email_lead.trim().toLowerCase())) return true;
    if (a.idcliente?.trim() && effectiveCallLeadKeys.has(a.idcliente.trim())) return true;
    if (a.ghl_contact_id?.trim() && effectiveCallLeadKeys.has(a.ghl_contact_id.trim())) return true;
    return false;
  };

  // hasCash: lead pagó aunque la categoría no diga "Cerrada".
  // SOLO se usa como fallback de cierre cuando el embudo NO tiene etapas cerradas explícitas.
  // Si el embudo sí define etapas cerradas, confiamos en esas y no en cash para no inflar
  // artificialmente la tasa de cierre (un asistido con cash no es un cierre si el embudo lo dice).
  const hasCash = (a: (typeof filteredAgendas)[0]) =>
    (parseFloat(a.cash_collected || "0") || 0) > 0;
  const asistidas = filteredAgendas.filter((a) =>
    attendedSet.has((a.categoria ?? "").toLowerCase().trim()) && hasRealInteraction(a)
  ).length;
  // Deduplicar canceladas por lead único (GHL puede enviar el mismo evento múltiples veces)
  const uniqueCanceledLeadKeys = new Set(
    filteredAgendas
      .filter((a) => (a.categoria ?? "").toLowerCase().includes("cancel"))
      .map((a) => agendaDedupKey(a))
  );
  const canceladas = uniqueCanceledLeadKeys.size;
  const cerradas = filteredAgendas.filter((a) => {
    const cat = (a.categoria ?? "").toLowerCase().trim();
    // Si el embudo tiene etapas cerradas definidas: usar solo esas
    if (closedByFlag) return closedSet.has(cat);
    // Sin embudo explícito: usar heurística de texto + cash como fallback
    return closedSet.has(cat) || hasCash(a);
  }).length;
  const efectivas = filteredAgendas.filter((a) => effectiveSet.has((a.categoria ?? "").toLowerCase().trim())).length;
  // revenue: sumar facturacion de agendas "cerradas". Si closedSet no captura nada
  // (embudo personalizado con nombres distintos), usar cualquier agenda con facturacion > 0.
  const revenueClosedSet = filteredAgendas
    .filter((a) => closedSet.has((a.categoria ?? "").toLowerCase().trim()))
    .reduce((s, a) => s + (parseFloat(a.facturacion || "0") || 0), 0);
  const revenueAnyFact = filteredAgendas
    .reduce((s, a) => s + (parseFloat(a.facturacion || "0") || 0), 0);
  const revenueNativo = revenueClosedSet > 0 ? revenueClosedSet : revenueAnyFact;
  const cashNativo = filteredAgendas.reduce((s, a) => s + (parseFloat(a.cash_collected || "0") || 0), 0);

  const manualData = (cuentaRow?.metricas_manual_data && typeof cuentaRow.metricas_manual_data === "object")
    ? (cuentaRow.metricas_manual_data as Record<string, { [k: string]: string | number | boolean | null }[]>)
    : {};

  const { revenue, cash } = await resolveFinancialValues(
    idCuenta, dateFrom, dateTo, revenueNativo, cashNativo,
    {
      fuenteDatosFinancieros: fuenteFinanciera,
      metricasConfig: cuentaRow?.metricas_config,
      metricasManualData: manualData,
    },
  );

  const contestadas = filteredCalls.filter((c) => esLlamadaContestada(c.tipo_evento ?? "", c.estado_resultado)).length;

  // Usar email OR phone OR id para no perder leads sin email (igual que panel asesor)
  const normLeadKey = (mail: string | null | undefined, phone: string | null | undefined, id: string | number) =>
    mail?.trim().toLowerCase() || phone?.trim() || String(id);
  // Leads únicos contactados: leads con al menos 1 llamada efectiva
  // (numerador correcto para tasa de contestación: leads contactados / leads llegados)
  const leadsContactados = new Set(
    filteredCalls
      .filter((c) => esLlamadaContestada(c.tipo_evento ?? "", c.estado_resultado))
      .map((c) => normLeadKey(c.mail_lead, c.phone, c.id))
  ).size;
  const leadsFromCalls = new Set(filteredCalls.map((c) => normLeadKey(c.mail_lead, c.phone, c.id)));
  const leadsFromAgendas = new Set(filteredAgendas.map((a) => normLeadKey(a.email_lead, null, a.id_registro_agenda)));

  // "Leads generados" = leads NUEVOS que llegaron al sistema en el período (pdte/contacto_creado)
  // Si no hay eventos pdte (cuenta sin GHL o sin fuente de captación), fallback a leads con actividad
  const leadsNuevosSet = new Set(
    filteredNewLeadEvents.map((nl) => normLeadKey(nl.mail_lead, nl.phone, nl.id))
  );
  const leadsConActividad = new Set([...leadsFromCalls, ...leadsFromAgendas]);
  // totalLeads: leads nuevos si los hay, sino leads con actividad (backward compat)
  const totalLeads = leadsNuevosSet.size > 0 ? leadsNuevosSet.size : leadsConActividad.size;

  const speedVals = filteredCalls
    .filter((c) => c.speed_to_lead)
    .map((c) => parseFloat(c.speed_to_lead!) || 0)
    .filter((v) => v > 0);
  const speedAvg = speedVals.length > 0 ? speedVals.reduce((s, v) => s + v, 0) / speedVals.length : 0;

  const attemptsByLead: Record<string, number> = {};
  for (const c of filteredCalls) {
    const key = c.mail_lead ?? c.phone ?? String(c.id);
    attemptsByLead[key] = (attemptsByLead[key] ?? 0) + 1;
  }
  const leadKeysArr = Object.keys(attemptsByLead);
  const attemptsAvg = leadKeysArr.length > 0
    ? Object.values(attemptsByLead).reduce((s, v) => s + v, 0) / leadKeysArr.length
    : 0;

  const tasaCierre = asistidas > 0 ? cerradas / asistidas : 0;

  // Leads únicos agendados: deduplicar por idcliente (GHL contact ID) o email_lead
  // Un mismo lead puede tener múltiples registros (PDTE → ofertada → cerrada)
  // meetingsBooked debe contar leads únicos, no registros totales
  // IMPORTANTE: agendadas incluye TODOS los registros (asistidos, no-shows y cancelados)
  // para que se cumpla la invariante: agendadas = asistidas + canceladas + noShows + cerradas + pendientes.
  // Antes excluíamos cancelados aquí, lo que causaba agendadas < suma de outcomes — una cita
  // cancelada estuvo agendada (AUT-701; mismo fix ya aplicado en videollamadas.ts bajo AUT-208).
  // Usamos la misma clave de dedup que canceladas/no_show (idcliente|ghl_contact_id|email)
  // para garantizar consistencia entre los contadores.
  const uniqueBookedLeads = new Set(
    filteredAgendas
      .map((a) => agendaDedupKey(a))
  );
  const meetingsBooked = uniqueBookedLeads.size;
  // tasaAgendamiento usa leadsConActividad (leads que recibieron llamada/agenda)
  // no el total de leads generados — la tasa mide del universo trabajado, cuántos agendaron
  const leadsConActividadSize = leadsConActividad.size > 0 ? leadsConActividad.size : 1;
  const tasaAgendamiento = leadsConActividadSize > 0 ? meetingsBooked / leadsConActividadSize : 0;

  const callsNuevos = filteredCalls.filter((c) => leadsNuevosSet.has(normLeadKey(c.mail_lead, c.phone, c.id))).length;
  const callsReactivados = filteredCalls.length - callsNuevos;
  const contestadasNuevos = filteredCalls.filter((c) =>
    esLlamadaContestada(c.tipo_evento ?? "", c.estado_resultado) && leadsNuevosSet.has(normLeadKey(c.mail_lead, c.phone, c.id))
  ).length;
  const contestadasReactivados = contestadas - contestadasNuevos;

  const kpis: DashboardKpis & Record<string, number> = {
    totalLeads,
    callsMade: filteredCalls.length,
    contestadas,
    // contestadas / llamadas totales = tasa de contestación por llamada
    // No usar leadsContactados/totalLeads: totalLeads solo cuenta leads NUEVOS del período,
    // pero leadsContactados puede incluir leads más antiguos → resultado > 100% (bug: 400%)
    answerRate: filteredCalls.length > 0 ? contestadas / filteredCalls.length : 0,
    meetingsBooked,
    meetingsAttended: asistidas,
    meetingsCanceled: canceladas,
    meetingsClosed: cerradas,
    effectiveAppointments: efectivas,
    tasaCierre,
    tasaAgendamiento,
    revenue,
    cashCollected: cash,
    avgTicket: efectivas > 0 ? revenue / efectivas : 0,
    speedToLeadAvg: speedAvg,
    avgAttempts: attemptsAvg,
    attemptsToFirstContactAvg: attemptsAvg,
    agendadas: meetingsBooked,
    asistidas,
    canceladas,
    efectivas,
    // Deduplicar no-shows por lead único. Excluir leads ya contados en canceladas para
    // evitar double-counting: un lead con registro no_show Y cancelada (rescheduled)
    // se cuenta solo en canceladas (estado más reciente/definitivo).
    noShows: new Set(
      filteredAgendas
        .filter((a) => (a.categoria ?? "").toLowerCase() === "no_show")
        .map((a) => agendaDedupKey(a))
        .filter((key) => !uniqueCanceledLeadKeys.has(key))
    ).size,
    ticket: asistidas > 0 ? revenue / asistidas : 0,
    pendientesLlamadas,
    leadsDescartados,
    callsNuevos,
    callsReactivados,
    contestadasNuevos,
    contestadasReactivados,
    answerRateNuevos: callsNuevos > 0 ? contestadasNuevos / callsNuevos : 0,
    answerRateReactivados: callsReactivados > 0 ? contestadasReactivados / callsReactivados : 0,
  };

  // pendientesAgendas: leads agendados en el período sin clasificar todavía (PDTE/sin outcome).
  // Garantiza la invariante: agendadas = asistidas + canceladas + noShows + cerradas + pendientes
  kpis.pendientesAgendas = Math.max(0, kpis.agendadas - kpis.asistidas - kpis.canceladas - kpis.noShows - kpis.meetingsClosed);

  // Advisor ranking
  // Cargar mapa nombre_closer → email desde usuarios_dashboard para normalizar
  // closers que llegan como texto (ej: "Miguel Puga" → "miguel@serenthys.com")
  const usuariosRows = await db
    .select({ email: usuariosDashboard.email, nombre_closer: usuariosDashboard.nombre_closer })
    .from(usuariosDashboard)
    .where(and(eq(usuariosDashboard.id_cuenta, idCuenta), isNotNull(usuariosDashboard.nombre_closer)));

  const nombreToEmail: Record<string, string> = {};
  for (const u of usuariosRows) {
    if (u.nombre_closer && u.email) {
      nombreToEmail[u.nombre_closer.trim().toLowerCase()] = u.email.trim().toLowerCase();
    }
  }

  // Enriquecer nombreToEmail con pares nombre↔email de llamadas y new-lead events
  // (usuarios_dashboard.nombre_closer suele estar vacío; log_llamadas siempre trae ambos)
  for (const c of filteredCalls) {
    if (c.nombre_closer && c.closer_mail) {
      const nameKey = c.nombre_closer.trim().toLowerCase();
      if (!nombreToEmail[nameKey]) {
        nombreToEmail[nameKey] = c.closer_mail.trim().toLowerCase();
      }
    }
  }
  for (const c of filteredNewLeadEvents) {
    if (c.nombre_closer && c.closer_mail) {
      const nameKey = c.nombre_closer.trim().toLowerCase();
      if (!nombreToEmail[nameKey]) {
        nombreToEmail[nameKey] = c.closer_mail.trim().toLowerCase();
      }
    }
  }

  // Normalizar key de asesor: email lowercase > nombre→email lookup > nombre lowercase
  const normAdvisorKey = (mail?: string | null, name?: string | null) => {
    const e = mail?.trim().toLowerCase();
    if (e) return e;
    const n = name?.trim();
    if (n) {
      const resolved = nombreToEmail[n.toLowerCase()];
      if (resolved) return resolved;
      return n.toLowerCase();
    }
    return "sin asignar";
  };

  // Construir mapa de leads generados (nuevos contactos) por asesor
  const newLeadsMap: Record<string, typeof filteredNewLeadEvents> = {};
  for (const c of filteredNewLeadEvents) {
    const key = normAdvisorKey(c.closer_mail, c.nombre_closer);
    if (!newLeadsMap[key]) newLeadsMap[key] = [];
    newLeadsMap[key].push(c);
  }

  const advisorMap: Record<string, { calls: typeof filteredCalls; agendas: typeof filteredAgendas }> = {};
  for (const c of filteredCalls) {
    const key = normAdvisorKey(c.closer_mail, c.nombre_closer);
    if (!advisorMap[key]) advisorMap[key] = { calls: [], agendas: [] };
    advisorMap[key].calls.push(c);
  }
  for (const a of filteredAgendas) {
    // Normalizar el closer de la agenda: si es un email úsalo directo,
    // si es un nombre resolverlo via nombreToEmail para unificarlo con las llamadas.
    const closerRaw = (a.closer ?? "").trim();
    const closerKey = normAdvisorKey(
      closerRaw.includes("@") ? closerRaw : null,
      closerRaw.includes("@") ? null : closerRaw,
    );
    // Intentar emparejar con key existente (por si llegó como nombre y las llamadas son por email)
    const existingKey = Object.keys(advisorMap).find(k => k === closerKey) ?? closerKey;
    if (!advisorMap[existingKey]) advisorMap[existingKey] = { calls: [], agendas: [] };
    advisorMap[existingKey].agendas.push(a);
  }

  // webhookPorUsuario debe declararse ANTES del loop de advisorRanking
  // (se llena después con los webhookRows, pero necesita existir para el closure)
  const webhookPorUsuario: Record<string, Record<string, number>> = {};

  const advisorRanking: DashboardAdvisorRow[] = Object.entries(advisorMap).map(
    ([key, { calls: ac, agendas: aa }]) => {
      const aContestadas = ac.filter((c) => esLlamadaContestada(c.tipo_evento ?? "", c.estado_resultado)).length;
      const aLeadsContactados = new Set(
        ac
          .filter((c) => esLlamadaContestada(c.tipo_evento ?? "", c.estado_resultado))
          .map((c) => c.mail_lead?.trim().toLowerCase() || c.phone?.trim() || c.contact_id_ghl?.trim() || String(c.id))
      ).size;
      // Deduplicar leads usando la misma clave que meetingsBooked (idcliente || ghl_contact_id || email || phone)
      // Usar solo email causaba subestimar el denominador cuando leads llegan solo con phone o GHL ID
      const aLeads = new Set([
        ...ac.map((c) => c.mail_lead?.trim().toLowerCase() || c.phone?.trim() || c.contact_id_ghl?.trim() || String(c.id)),
        ...aa.map((a) => agendaDedupKey(a)),
      ]).size;
      const aAsistidas = aa.filter((a) => attendedSet.has((a.categoria ?? "").toLowerCase().trim()) && hasRealInteraction(a)).length;
      const aRevenueClosedSet = aa.filter((a) => closedSet.has((a.categoria ?? "").toLowerCase().trim()))
        .reduce((s, a) => s + (parseFloat(a.facturacion || "0") || 0), 0);
      const aRevenueAny = aa.reduce((s, a) => s + (parseFloat(a.facturacion || "0") || 0), 0);
      const aRevenue = useExterna
        ? 0
        : (aRevenueClosedSet > 0 ? aRevenueClosedSet : aRevenueAny);
      const aCash = useExterna
        ? 0
        : aa.reduce((s, a) => s + (parseFloat(a.cash_collected || "0") || 0), 0);
      const aSpeeds = ac
        .filter((c) => c.speed_to_lead)
        .map((c) => parseFloat(c.speed_to_lead!) || 0)
        .filter((v) => v > 0);

      // Citas agendadas por asesor (dedup por lead único dentro de cada closer).
      // INCLUYE canceladas para alinear con el headline AGENDADAS (invariante AUT-701:
      // una cita cancelada estuvo agendada). Antes se excluían aquí, causando que el
      // desglose per-asesor quedara por debajo del headline (AUT-1683, ej. columna 4vs5).
      // Nota: un lead agendado con 2 closers distintos suma en ambos ⇒ la suma per-asesor
      // puede superar el headline (dedup global por lead). Decisión de negocio Opción A
      // (Juan, AUT-1683): cada closer recibe crédito de su propia cita; ver (?) en la UI.
      const aMeetingsBooked = new Set(
        aa.map((a) => agendaDedupKey(a))
      ).size;

      // Leads generados: nuevos contactos del periodo asignados a este asesor
      const advisorNewLeads = newLeadsMap[key] ?? [];
      const uniqueNewLeadsMap = new Map<string, (typeof advisorNewLeads)[0]>();
      for (const nl of advisorNewLeads) {
        const leadKey = nl.mail_lead?.trim().toLowerCase() || nl.phone?.trim() || String(nl.id);
        if (!uniqueNewLeadsMap.has(leadKey)) uniqueNewLeadsMap.set(leadKey, nl);
      }
      const leadsGeneradosDetalle = Array.from(uniqueNewLeadsMap.values()).map((nl) => ({
        nombre: nl.nombre_lead ?? null,
        email: nl.mail_lead ?? null,
        telefono: nl.phone ?? null,
        ultimaActividad: nl.ts ? toDateString(nl.ts) : null,
      }));

      // Leads con actividad: leads únicos del periodo que tuvieron llamada o cita
      const uniqueActivosMap = new Map<string, { nombre: string | null; email: string | null; telefono: string | null; ultimaActividad: string | null }>();
      for (const c of ac) {
        const leadKey = c.mail_lead?.trim().toLowerCase() || c.phone?.trim() || String(c.id);
        if (!uniqueActivosMap.has(leadKey)) {
          uniqueActivosMap.set(leadKey, {
            nombre: c.nombre_lead ?? null,
            email: c.mail_lead ?? null,
            telefono: c.phone ?? null,
            ultimaActividad: c.ts ? toDateString(c.ts) : null,
          });
        }
      }
      for (const a of aa) {
        const leadKey = a.email_lead?.trim().toLowerCase() || `agenda_${a.id_registro_agenda}`;
        if (!uniqueActivosMap.has(leadKey)) {
          uniqueActivosMap.set(leadKey, {
            nombre: a.nombre_de_lead ?? null,
            email: a.email_lead ?? null,
            telefono: null,
            ultimaActividad: toDateString(a.fecha_reunion ?? null) || toDateString(a.fecha as Date | string | null) || null,
          });
        }
      }
      const leadsConActividadDetalle = Array.from(uniqueActivosMap.values());

      const newLeadKeys = new Set(uniqueNewLeadsMap.keys());
      const leadsReactivadosDetalle = Array.from(uniqueActivosMap.entries())
        .filter(([k]) => !newLeadKeys.has(k))
        .map(([, v]) => v);

      const computeFilteredMetrics = (leadKeys: Set<string>): {
        totalLeads: number; callsMade: number; speedToLeadAvg: number | null;
        meetingsBooked: number; meetingsAttended: number; revenue: number;
        cashCollected: number; contactRate: number; bookingRate: number;
      } => {
        const fCalls = ac.filter((c) => {
          const lk = c.mail_lead?.trim().toLowerCase() || c.phone?.trim() || String(c.id);
          return leadKeys.has(lk);
        });
        const fAgendas = aa.filter((a) => {
          const lk = a.email_lead?.trim().toLowerCase() || `agenda_${a.id_registro_agenda}`;
          return leadKeys.has(lk);
        });
        const fContestadas = new Set(
          fCalls
            .filter((c) => esLlamadaContestada(c.tipo_evento ?? "", c.estado_resultado))
            .map((c) => c.mail_lead?.trim().toLowerCase() || c.phone?.trim() || c.contact_id_ghl?.trim() || String(c.id))
        ).size;
        const fLeads = new Set([
          ...fCalls.map((c) => c.mail_lead?.trim().toLowerCase() || c.phone?.trim() || c.contact_id_ghl?.trim() || String(c.id)),
          ...fAgendas.map((a) => agendaDedupKey(a)),
        ]).size;
        const fMeetings = new Set(fAgendas.map((a) => agendaDedupKey(a))).size;
        const fAttended = fAgendas.filter((a) => attendedSet.has((a.categoria ?? "").toLowerCase().trim()) && hasRealInteraction(a)).length;
        const fSpeeds = fCalls.filter((c) => c.speed_to_lead).map((c) => parseFloat(c.speed_to_lead!) || 0).filter((v) => v > 0);
        const fRevenueClosedSet = fAgendas.filter((a) => closedSet.has((a.categoria ?? "").toLowerCase().trim()))
          .reduce((s, a) => s + (parseFloat(a.facturacion || "0") || 0), 0);
        const fRevenueAny = fAgendas.reduce((s, a) => s + (parseFloat(a.facturacion || "0") || 0), 0);
        const fRevenue = useExterna ? 0 : (fRevenueClosedSet > 0 ? fRevenueClosedSet : fRevenueAny);
        const fCash = useExterna ? 0 : fAgendas.reduce((s, a) => s + (parseFloat(a.cash_collected || "0") || 0), 0);
        return {
          totalLeads: fLeads,
          callsMade: fCalls.length,
          speedToLeadAvg: fSpeeds.length > 0 ? fSpeeds.reduce((s, v) => s + v, 0) / fSpeeds.length : null,
          meetingsBooked: fMeetings,
          meetingsAttended: fAttended,
          revenue: fRevenue,
          cashCollected: fCash,
          contactRate: fLeads > 0 ? Math.min(1, fContestadas / fLeads) : 0,
          bookingRate: fLeads > 0 ? Math.min(1, fMeetings / fLeads) : 0,
        };
      };

      return {
        advisorName: ac[0]?.nombre_closer ?? aa[0]?.closer ?? key,
        advisorEmail: ac[0]?.closer_mail ?? null,
        totalLeads: aLeads,
        leadsGenerados: leadsGeneradosDetalle.length,
        leadsConActividad: leadsConActividadDetalle.length,
        leadsReactivados: leadsReactivadosDetalle.length,
        leadsGeneradosDetalle,
        leadsConActividadDetalle,
        leadsReactivadosDetalle,
        callsMade: ac.length,
        speedToLeadAvg: aSpeeds.length > 0 ? aSpeeds.reduce((s, v) => s + v, 0) / aSpeeds.length : null,
        meetingsBooked: aMeetingsBooked,
        meetingsAttended: aAsistidas,
        revenue: aRevenue,
        cashCollected: aCash,
        contactRate: aLeads > 0 ? Math.min(1, aLeadsContactados / aLeads) : 0,
        bookingRate: aLeads > 0 ? Math.min(1, aMeetingsBooked / aLeads) : 0,
        metricasWebhook: webhookPorUsuario[ac[0]?.closer_mail ?? key] ?? {},
        metricsNuevos: computeFilteredMetrics(newLeadKeys),
        metricsReactivados: computeFilteredMetrics(
          new Set(Array.from(uniqueActivosMap.keys()).filter((k) => !newLeadKeys.has(k)))
        ),
      };
    },
  );

  // Volume by day (fechas normalizadas a "YYYY-MM-DD" para evitar 500 si el driver devuelve Date/string)
  const volumeMap: Record<string, DashboardVolumeDay> = {};
  for (const c of filteredCalls) {
    const d = toDateString(c.ts);
    if (!d) continue;
    if (!volumeMap[d]) volumeMap[d] = { date: d, llamadas: 0, citasPresentaciones: 0, cierres: 0 };
    volumeMap[d].llamadas++;
  }
  for (const a of filteredAgendas) {
    const d =
      toDateString(a.fecha_reunion ?? null) || toDateString(a.fecha as Date | string | null) || "";
    if (!d) continue;
    if (!volumeMap[d]) volumeMap[d] = { date: d, llamadas: 0, citasPresentaciones: 0, cierres: 0 };
    volumeMap[d].citasPresentaciones++;
    if (closedSet.has((a.categoria ?? "").toLowerCase().trim()) || hasCash(a)) volumeMap[d].cierres++;
  }
  const volumeByDay = Object.values(volumeMap).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );

  // Objeciones — estructura por canal con detalle literal
  type ObjEntry = { count: number; quotes: Set<string>; details: DashboardObjecionDetail[] };
  const objMapGlobal: Record<string, ObjEntry> = {};
  const objMapByCanal: Record<ObjecionCanal, Record<string, ObjEntry>> = {
    videollamada: {},
    chat: {},
    llamada: {},
  };
  type RawObjecion = { objecion?: string; categoria?: string; contexto?: string; respuesta_vendedor?: string };
  const toList = (x: unknown): RawObjecion[] =>
    Array.isArray(x)
      ? (x as RawObjecion[])
      : (x && typeof x === "object" && Array.isArray((x as { objeciones?: unknown }).objeciones))
        ? (x as { objeciones: RawObjecion[] }).objeciones
        : [];
  const mergeObjeciones = (
    list: RawObjecion[],
    canal: ObjecionCanal,
    ctx: { leadName: string; advisorName: string; datetime: string },
  ) => {
    for (const obj of list) {
      const key = (obj?.categoria ?? obj?.objecion ?? "").toLowerCase().trim();
      if (!key) continue;
      const detail: DashboardObjecionDetail = {
        leadName: ctx.leadName,
        advisorName: ctx.advisorName,
        datetime: ctx.datetime,
        quote: obj.objecion ?? key,
        contexto: obj.contexto || undefined,
        respuestaVendedor: obj.respuesta_vendedor || undefined,
      };
      // Global map
      if (!objMapGlobal[key]) objMapGlobal[key] = { count: 0, quotes: new Set(), details: [] };
      objMapGlobal[key].count++;
      if (obj.objecion) objMapGlobal[key].quotes.add(obj.objecion);
      objMapGlobal[key].details.push(detail);
      // Per-canal map
      if (!objMapByCanal[canal][key]) objMapByCanal[canal][key] = { count: 0, quotes: new Set(), details: [] };
      objMapByCanal[canal][key].count++;
      if (obj.objecion) objMapByCanal[canal][key].quotes.add(obj.objecion);
      objMapByCanal[canal][key].details.push(detail);
    }
  };
  // Fase 1: Fathom (videollamadas)
  for (const a of filteredAgendas) {
    mergeObjeciones(toList(a.objeciones_ia), 'videollamada', {
      leadName: a.nombre_de_lead ?? '',
      advisorName: a.closer ?? '',
      datetime: a.fecha_reunion ? String(a.fecha_reunion) : String(a.fecha),
    });
  }
  // Fases 2 y 3 (chats + Call-AI) se agregan después de consultar chatRows y callAiRows

  // Razones de pérdida
  const rpConfig = Array.isArray(cuentaRow?.razones_perdida_config) ? cuentaRow.razones_perdida_config : [];
  const rpData = Array.isArray(cuentaRow?.razones_perdida_data) ? cuentaRow.razones_perdida_data : [];
  const rpConfigMap = new Map(rpConfig.filter(r => r.activo).map(r => [r.id, r]));
  const rpFiltered = rpData.filter(e => {
    if (!rpConfigMap.has(e.razon_id)) return false;
    if (!e.fecha) return false;
    const d = new Date(e.fecha);
    return d >= fromDate && d <= toDate;
  });
  const rpCountMap: Record<string, number> = {};
  for (const e of rpFiltered) {
    rpCountMap[e.razon_id] = (rpCountMap[e.razon_id] ?? 0) + 1;
  }
  const totalRp = rpFiltered.length;
  const razonesPerdida = Object.entries(rpCountMap)
    .map(([id, count]) => ({
      id,
      name: rpConfigMap.get(id)?.label ?? id,
      count,
      percent: totalRp > 0 ? Math.round((count / totalRp) * 100) : 0,
      color: rpConfigMap.get(id)?.color,
    }))
    .sort((a, b) => b.count - a.count);

  const advisors: ApiAdvisor[] = advisorRanking.map((a) => ({
    id: a.advisorEmail ?? a.advisorName,
    name: a.advisorName,
    email: a.advisorEmail ?? undefined,
  }));

  // Normalización de categoria contra IDs del embudo (case-insensitive).
  // El AI classifier puede guardar "cerrada" (lowercase default) pero el embudo
  // tiene stages con ID "Cerrada" (capitalizado). Sin normalización, el frontend
  // ve distribucionEmbudo["Cerrada"] = undefined → 0, aunque haya datos reales.
  const embudoIdNormMap: Record<string, string> = {};
  for (const e of embudoRaw as EmbudoEtapa[]) {
    if (e.id) embudoIdNormMap[e.id.toLowerCase()] = e.id;
    if (e.nombre) embudoIdNormMap[e.nombre.toLowerCase()] = e.id;
  }
  const normalizeCategoria = (raw: string): string =>
    embudoIdNormMap[raw.toLowerCase()] ?? raw;

  const distribucionEmbudo: Record<string, number> = {};
  for (const a of filteredAgendas) {
    const cat = normalizeCategoria(a.categoria ?? "sin_categoria");
    distribucionEmbudo[cat] = (distribucionEmbudo[cat] ?? 0) + 1;
  }

  // Catch-all: leads sin categoría o con categoría no reconocida en el embudo → etapa fallback
  {
    const fallbackEtapa = (embudoRaw as EmbudoEtapa[]).find((e) => e.es_fallback === true);
    if (fallbackEtapa) {
      const fallbackLabel = fallbackEtapa.nombre ?? fallbackEtapa.id;
      // Construir set de categorías conocidas en el embudo
      const catSet = new Set<string>();
      for (const e of embudoRaw as EmbudoEtapa[]) {
        if (e.nombre) catSet.add(e.nombre);
        if (e.id) catSet.add(e.id);
      }
      let sinClasificar = 0;
      for (const a of filteredAgendas) {
        const cat = (a.categoria ?? "").trim();
        if (!cat || (!catSet.has(cat) && cat === "sin_categoria")) {
          sinClasificar++;
        }
      }
      if (sinClasificar > 0) {
        // Mover los sin_categoria al fallback y eliminar la clave genérica
        distribucionEmbudo[fallbackLabel] = (distribucionEmbudo[fallbackLabel] ?? 0) + sinClasificar;
        delete distribucionEmbudo["sin_categoria"];
      }
    }
  }

  const allTags = new Set<string>();
  for (const a of agendas) {
    if (Array.isArray(a.tags_internos)) a.tags_internos.forEach((t) => allTags.add(t));
  }
  for (const c of calls) {
    if (Array.isArray(c.tags_internos)) c.tags_internos.forEach((t) => allTags.add(t));
  }

  const tagCounts: Record<string, number> = {};
  for (const a of filteredAgendas) {
    if (Array.isArray(a.tags_internos)) a.tags_internos.forEach((t) => { tagCounts[t] = (tagCounts[t] ?? 0) + 1; });
  }
  for (const c of filteredCalls) {
    if (Array.isArray(c.tags_internos)) c.tags_internos.forEach((t) => { tagCounts[t] = (tagCounts[t] ?? 0) + 1; });
  }

  const rawConfigs = parseMetricasConfig(cuentaRow?.metricas_config);
  const configs = rawConfigs.length > 0 ? normalizeMetricasConfig(rawConfigs) : DEFAULT_METRICAS_CONFIG;

  // Cargar datos de metricas_webhook para el período (suma por campo)
  const webhookRows = await db
    .select({ campo: metricasWebhook.campo, valor: metricasWebhook.valor, fecha: metricasWebhook.fecha, ghl_user_id: metricasWebhook.ghl_user_id })
    .from(metricasWebhook)
    .where(and(
      eq(metricasWebhook.id_cuenta, idCuenta),
      gte(metricasWebhook.fecha, dateFrom),
      lte(metricasWebhook.fecha, dateTo),
    ));
  const webhookSumas: Record<string, number> = {};
  // seriesTiempo: campo → mapa de fecha → valor sumado
  const webhookSeriesPorCampo: Record<string, Record<string, number>> = {};
  for (const row of webhookRows) {
    // Solo sumar filas globales (ghl_user_id IS NULL) para evitar doble conteo:
    // las filas atribuidas (con ghl_user_id) ya están acumuladas en la fila global.
    if (row.ghl_user_id !== null) continue;
    const key = row.campo;
    const fecha = toDateString(row.fecha);
    webhookSumas[key] = (webhookSumas[key] ?? 0) + parseFloat(String(row.valor ?? 0));
    if (!webhookSeriesPorCampo[key]) webhookSeriesPorCampo[key] = {};
    webhookSeriesPorCampo[key][fecha] = (webhookSeriesPorCampo[key][fecha] ?? 0) + parseFloat(String(row.valor ?? 0));
  }

  // Poblar webhookPorUsuario (declarado antes del loop de advisorRanking)
  for (const row of webhookRows) {
    if (!row.ghl_user_id) continue;
    const uid = row.ghl_user_id;
    if (!webhookPorUsuario[uid]) webhookPorUsuario[uid] = {};
    webhookPorUsuario[uid][row.campo] = (webhookPorUsuario[uid][row.campo] ?? 0) + parseFloat(String(row.valor ?? 0));
  }
  const metricasComputadas: { id: string; nombre: string; valor: string | number; descripcion?: string | null; ubicacion?: string; paneles?: string[]; formato?: string; color?: string; visualizacion?: "kpi_card" | "barra" | "comparativo"; seriesTiempo?: { fecha: string; valor: number }[]; subMetrics?: { label: string; value: number; formato?: string }[] }[] = [];
  const metricasValores: Record<string, string | number> = {};
  // Usar KPI_DEFAULT_KEYS como fuente de verdad — nunca hardcodear aquí
  const kpiKeys = new Set<string>([...KPI_DEFAULT_KEYS]);

  const getDeps = (m: MetricaConfig): string[] => {
    if (m.tipo === "fija") return [];
    if (m.tipo !== "automatica" || !m.formula) return [];
    const f = m.formula;
    if (f.fuente && !kpiKeys.has(f.fuente)) return [f.fuente];
    if (f.fuentes) return f.fuentes.filter((k) => !kpiKeys.has(k));
    return [];
  };

  // Fallback: métricas de Ads persistidas como tipo="manual" sin datos cargados
  // → resolver desde resumenes_diarios_ads cuando el tenant tiene canal Ads conectado.
  const ADS_MANUAL_FALLBACK: Record<string, string> = {
    "base-inversion-publicidad": "gastoTotal",
    "base-impresiones": "impresiones",
    "base-ctr": "ctr",
  };

  // Deduplicar por id: si hay duplicados, preferir tipo="ads" > tipo="webhook" > cualquier otro.
  // Resuelve el caso donde una métrica tiene entrada "manual" (sin datos) Y "ads" para el mismo id.
  const TYPE_PRIORITY: Record<string, number> = { ads: 10, webhook: 5 };
  const configsDeduped = [
    ...configs
      .reduce((map, m) => {
        const existing = map.get(m.id);
        if (!existing || (TYPE_PRIORITY[m.tipo] ?? 0) > (TYPE_PRIORITY[existing.tipo] ?? 0)) {
          map.set(m.id, m);
        }
        return map;
      }, new Map<string, (typeof configs)[number]>())
      .values(),
  ];

  const sorted = configsDeduped.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));
  const metricaCtx: MetricaEngineContext = {
    id_cuenta: idCuenta,
    allConfigIds: new Set(sorted.map((m) => m.id)),
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
      } else if (m.tipo === "ads") {
        // Lee directamente de resumenes_diarios_ads via adsAggRowEarly
        const campo = m.adsCampo ?? "";
        valor = ADS_CAMPO_MAP[campo] ?? 0;
      } else if (m.tipo === "manual") {
        const entries = manualData[m.id] ?? [];
        valor = calcMetricaManual(m, entries, dateFrom, dateTo);
        const adsFallbackCampo = ADS_MANUAL_FALLBACK[m.id];
        if (valor === 0 && adsFallbackCampo && hasAdsConfigEarly && entries.length === 0) {
          valor = ADS_CAMPO_MAP[adsFallbackCampo] ?? 0;
        }
      } else if (m.tipo === "webhook") {
        // Suma del campo webhook en el período (fuente API externa)
        let baseWebhook = m.webhookCampo ? (webhookSumas[m.webhookCampo] ?? 0) : 0;
        // Sumar también incrementos manuales (de reglas de etiquetas vía Cerebro)
        // que se almacenan en metricas_manual_data con estructura {date, valor}
        const manualEntries = (manualData[m.id] ?? []) as Array<{date?: string; valor?: number}>;
        if (manualEntries.length > 0) {
          const fromTs = fromDate.getTime();
          const toTs = toDate.getTime();
          const manualSum = manualEntries
            .filter(e => { const d = e.date ? new Date(e.date).getTime() : 0; return d >= fromTs && d <= toTs; })
            .reduce((s, e) => s + (e.valor ?? 0), 0);
          baseWebhook += manualSum;
        }
        valor = baseWebhook;
      } else if (m.tipo === "embudo_etapa") {
        // Contar agendas donde categoria === m.id en el rango
        const etapaDelEmbudo = embudoRaw.find((e) => e.id === m.id);
        const agendas = await db
          .select({ categoria: resumenesDiariosAgendas.categoria, idcliente: resumenesDiariosAgendas.idcliente, ghl_contact_id: resumenesDiariosAgendas.ghl_contact_id, email_lead: resumenesDiariosAgendas.email_lead })
          .from(resumenesDiariosAgendas)
          .where(
            and(
              eq(resumenesDiariosAgendas.id_cuenta, idCuenta),
              or(
                and(
                  isNotNull(resumenesDiariosAgendas.fecha_reunion),
                  gte(resumenesDiariosAgendas.fecha_reunion, fromDate),
                  lte(resumenesDiariosAgendas.fecha_reunion, toDate),
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
              ),
              sql`LOWER(${resumenesDiariosAgendas.categoria}) = LOWER(${m.id})`,
              eq(resumenesDiariosAgendas.excluida_dashboard, false),
            )
          );
        
        // Si es_unica: deduplicar por idcliente || ghl_contact_id || email_lead
        if (etapaDelEmbudo?.es_unica === true) {
          const deduped = new Set<string>();
          agendas.forEach((a) => {
            const key = a.idcliente || a.ghl_contact_id || a.email_lead || "";
            if (key) deduped.add(key);
          });
          valor = deduped.size;
        } else {
          valor = agendas.length;
        }
      } else {
        valor = calcMetricaAutomatica(m, kpis, metricasValores, dateFrom, dateTo, metricaCtx);
      }
      metricasValores[m.id] = typeof valor === "number" ? valor : parseFloat(String(valor)) || 0;
      // Incluir series de tiempo para métricas webhook con visualización de barra
      let seriesTiempo: { fecha: string; valor: number }[] | undefined;
      if (m.tipo === "webhook" && m.visualizacion === "barra" && m.webhookCampo) {
        const seriesMap = webhookSeriesPorCampo[m.webhookCampo] ?? {};
        seriesTiempo = Object.entries(seriesMap)
          .map(([fecha, val]) => ({ fecha, valor: val }))
          .sort((a, b) => a.fecha.localeCompare(b.fecha));
      }
      metricasComputadas.push({ id: m.id, nombre: m.nombre, valor, descripcion: m.descripcion, ubicacion: m.ubicacion, paneles: m.paneles, formato: m.formato, color: m.color, visualizacion: m.visualizacion, seriesTiempo });
      computed.add(m.id);
    }
  }

  for (const m of sorted) {
    if (computed.has(m.id)) continue;
    metricasComputadas.push({ id: m.id, nombre: m.nombre, valor: "—", descripcion: m.descripcion, ubicacion: m.ubicacion, paneles: m.paneles, formato: m.formato, color: m.color, visualizacion: m.visualizacion });
  }

  const CALL_SUB_METRICS: Record<string, { label: string; value: number; formato?: string }[]> = {
    callsMade: [
      { label: "Nuevos", value: kpis.callsNuevos },
      { label: "Reactivados", value: kpis.callsReactivados },
    ],
    contestadas: [
      { label: "Nuevos", value: kpis.contestadasNuevos },
      { label: "Reactivados", value: kpis.contestadasReactivados },
    ],
    answerRate: [
      { label: "Nuevos", value: kpis.answerRateNuevos, formato: "porcentaje" },
      { label: "Reactivados", value: kpis.answerRateReactivados, formato: "porcentaje" },
    ],
  };
  for (const mc of metricasComputadas) {
    const cfg = sorted.find((s) => s.id === mc.id);
    if (cfg?.tipo === "automatica" && cfg.formula?.tipo === "directo" && cfg.formula.fuente) {
      const subs = CALL_SUB_METRICS[cfg.formula.fuente];
      if (subs) mc.subMetrics = subs;
    }
  }

  // ----------------------------------------------------------------
  // Chat KPIs — consultar chats_logs en el mismo rango de fechas
  // ----------------------------------------------------------------
  const chatConditions: Parameters<typeof and>[0][] = [
    eq(chatsLogs.id_cuenta, idCuenta),
    gte(sql`COALESCE(${chatsLogs.primer_msg_at}, ${chatsLogs.primer_msg_lead_at}, ${chatsLogs.fecha_y_hora_z})`, fromDate),
    lte(sql`COALESCE(${chatsLogs.primer_msg_at}, ${chatsLogs.primer_msg_lead_at}, ${chatsLogs.fecha_y_hora_z})`, toDate),
    sql`${chatsLogs.excluida_dashboard} IS NOT TRUE`,
  ];
  // Filtro por asesor en chats: usa asesor_asignado (equivalente a closer_mail en llamadas).
  // Sin esto, usuarios sin ver_todo ven los chats de todo el account.
  if (emails.length > 0) {
    chatConditions.push(inArray(chatsLogs.asesor_asignado, emails));
  }
  const chatRows = await db
    .select({
      chatid: chatsLogs.chatid,
      chat: chatsLogs.chat,
      estado: chatsLogs.estado,
      notas_extra: chatsLogs.notas_extra,
      fecha_y_hora_z: chatsLogs.fecha_y_hora_z,
      primer_msg_lead_at: chatsLogs.primer_msg_lead_at,
      primer_msg_at: chatsLogs.primer_msg_at,
      ia_objeciones: chatsLogs.ia_objeciones,
      nombre_lead: chatsLogs.nombre_lead,
      id_lead: chatsLogs.id_lead,
      asesor_asignado: chatsLogs.asesor_asignado,
    })
    .from(chatsLogs)
    .where(and(...chatConditions));

  // ── Leads reactivados + Oportunidades creadas (dedup por ghl_contact_id) ──
  // Reactivado = lead con actividad (llamada/chat/cita) en el período que NO
  // fue creado en el período. Se excluyen los descartados.
  const descartadoContactIds = new Set<string>(
    (await db.execute(sql`
      SELECT DISTINCT ghl_contact_id FROM registros_de_llamada
      WHERE id_cuenta = ${idCuenta} AND calificacion_manual = 'descartado'
        AND ghl_contact_id IS NOT NULL
    `)).rows.map((r) => String((r as { ghl_contact_id: string }).ghl_contact_id)),
  );
  const creadosContactIds = new Set<string>(
    filteredNewLeadEvents.map((nl) => nl.contact_id_ghl?.trim()).filter((x): x is string => !!x),
  );
  const activosContactIds = new Set<string>();
  for (const c of filteredCalls) if (c.contact_id_ghl?.trim()) activosContactIds.add(c.contact_id_ghl.trim());
  for (const a of filteredAgendas) if (a.ghl_contact_id?.trim()) activosContactIds.add(a.ghl_contact_id.trim());
  for (const ch of chatRows) if (ch.id_lead?.trim()) activosContactIds.add(ch.id_lead.trim());
  let leadsReactivados = 0;
  for (const cid of activosContactIds) {
    if (!creadosContactIds.has(cid) && !descartadoContactIds.has(cid)) leadsReactivados++;
  }
  kpis.leadsReactivados = leadsReactivados;

  // Oportunidades creadas en el período (excluye contactos descartados).
  const oppRes = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM oportunidades o
    WHERE o.id_cuenta = ${idCuenta}
      AND o.fecha_creada >= ${fromDate} AND o.fecha_creada <= ${toDate}
      AND COALESCE(o.status, '') <> 'deleted'
      AND NOT EXISTS (
        SELECT 1 FROM registros_de_llamada r
        WHERE r.id_cuenta = ${idCuenta}
          AND r.ghl_contact_id = o.ghl_contact_id
          AND r.calificacion_manual = 'descartado'
      )
  `);
  kpis.oportunidadesCreadas = Number((oppRes.rows[0] as { n?: number })?.n ?? 0);

  // ----------------------------------------------------------------
  // Objeciones — fase 2: chats
  // ----------------------------------------------------------------
  for (const c of chatRows) {
    mergeObjeciones(toList(c.ia_objeciones), 'chat', {
      leadName: c.nombre_lead ?? '',
      advisorName: c.asesor_asignado ?? '',
      datetime: c.fecha_y_hora_z ? String(c.fecha_y_hora_z) : '',
    });
  }

  // ----------------------------------------------------------------
  // Objeciones — fase 3: Call-AI (llamadas en tiempo real)
  // ----------------------------------------------------------------
  const callAiConditions: Parameters<typeof and>[0][] = [
    eq(eventosLlamadasTiempoReal.id_cuenta, idCuenta),
    gte(eventosLlamadasTiempoReal.fecha_hora_evento, fromDate),
    lte(eventosLlamadasTiempoReal.fecha_hora_evento, toDate),
    isNotNull(eventosLlamadasTiempoReal.objeciones_ia),
  ];
  if (emails.length > 0) {
    callAiConditions.push(inArray(eventosLlamadasTiempoReal.correo_closer, emails));
  }
  const callAiRows = await db
    .select({
      objeciones_ia: eventosLlamadasTiempoReal.objeciones_ia,
      closer: eventosLlamadasTiempoReal.closer,
      correo_closer: eventosLlamadasTiempoReal.correo_closer,
      fecha_hora_evento: eventosLlamadasTiempoReal.fecha_hora_evento,
    })
    .from(eventosLlamadasTiempoReal)
    .where(and(...callAiConditions));
  for (const r of callAiRows) {
    mergeObjeciones(toList(r.objeciones_ia), 'llamada', {
      leadName: '',
      advisorName: r.closer ?? r.correo_closer ?? '',
      datetime: r.fecha_hora_evento ? String(r.fecha_hora_evento) : '',
    });
  }

  // ----------------------------------------------------------------
  // Objeciones — fase 4: log_llamadas (Twilio histórico)
  // ----------------------------------------------------------------
  for (const c of calls) {
    mergeObjeciones(toList(c.ia_objeciones), 'llamada', {
      leadName: c.nombre_lead ?? '',
      advisorName: c.nombre_closer ?? c.closer_mail ?? '',
      datetime: c.ts ? String(c.ts) : '',
    });
  }

  // Objeciones — resultado final unificado + por canal
  const buildObjecionList = (map: Record<string, ObjEntry>): DashboardObjecionConDetalle[] => {
    const total = Object.values(map).reduce((s, o) => s + o.count, 0);
    return Object.entries(map)
      .map(([name, { count, quotes, details }]) => ({
        name,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
        tipos: quotes.size,
        details,
      }))
      .sort((a, b) => b.count - a.count);
  };
  const objeciones: DashboardObjecion[] = buildObjecionList(objMapGlobal);
  const CANAL_LABELS: Record<ObjecionCanal, string> = { videollamada: 'Videollamadas', chat: 'Chats', llamada: 'Llamadas' };
  const objecionesPorCanal: DashboardObjecionesPorCanal[] = (
    ['videollamada', 'chat', 'llamada'] as ObjecionCanal[]
  )
    .filter((c) => Object.keys(objMapByCanal[c]).length > 0)
    .map((c) => ({ canal: c, label: CANAL_LABELS[c], objeciones: buildObjecionList(objMapByCanal[c]) }));

  // ----------------------------------------------------------------
  // Funnel unificado — agregar leads de chats al distribucionEmbudo
  // Usa chats_logs.estado (escrito por la IA nocturna) directamente.
  // Solo suma a etapas que tienen 'chats' en sus fuentes (o sin fuentes = todas)
  // ----------------------------------------------------------------
  {
    // Construir set de etapas que aceptan chats como fuente
    const etapasConChats = new Set<string>();
    for (const etapa of embudoRaw as EmbudoEtapa[]) {
      const fuentes = (etapa as any).fuentes as string[] | undefined;
      // Si no tiene fuentes definidas → aplica a todos los canales (default)
      // Si tiene fuentes → solo si incluye 'chats'
      if (!fuentes || fuentes.length === 0 || fuentes.includes("chats")) {
        if (etapa.nombre) etapasConChats.add(etapa.nombre);
        if (etapa.id) etapasConChats.add(etapa.id);
      }
    }
    // Si no hay embudo personalizado, todos los estados son válidos
    const sinEmbudo = embudoRawArr.length === 0;

    for (const chatRow of chatRows) {
      // La IA escribe el estado directamente en chats_logs.estado
      const estado = chatRow.estado ?? null;
      // Solo sumar si la etapa destino acepta chats como fuente
      if (estado && (sinEmbudo || etapasConChats.has(estado))) {
        distribucionEmbudo[estado] = (distribucionEmbudo[estado] ?? 0) + 1;
      }
    }
  }

  const chatKpis: ChatKpis = (() => {
    const totalChats = chatRows.length;
    if (totalChats === 0) {
      return {
        total: 0,
        leadsUnicos: 0,
        conRespuesta: 0,
        tasaRespuesta: 0,
        speedToLeadAvg: null,
        speedToLeadMedian: null,
        speedToLeadCount: 0,
        mensajesPromedioPorLead: null,
        distribucionCanales: {},
        topClosers: [],
      };
    }

    const uniqueChatIds = new Set(chatRows.map((r) => r.chatid).filter(Boolean));
    let chatsConAgente = 0;
    let totalMensajes = 0;
    const speedValues: number[] = [];
    const distribucionCanales: Record<string, number> = {};
    const closerCounts: Record<string, number> = {};

    const chatConfig = cuentaRow?.configuracion_ui?.chat_config ?? {};
    const tieneChatbot = chatConfig.tiene_chatbot ?? false;
    const emojiTomaAtencion = (chatConfig.emoji_toma_atencion ?? "").trim();

    for (const row of chatRows) {
      const msgs: ChatMessage[] = Array.isArray(row.chat) ? (row.chat as ChatMessage[]) : [];
      totalMensajes += msgs.length;

      // Si hay bot, "contactado" = hay mensaje de agente DESPUÉS del emoji de toma de atención
      // Si no hay bot, "contactado" = cualquier mensaje de agente
      let hasAgent: boolean;
      if (tieneChatbot && emojiTomaAtencion) {
        const emojiIdx = msgs.findIndex(
          (m) => m.role === "agent" && (m.message ?? "").includes(emojiTomaAtencion)
        );
        // Hay agente humano después del emoji del bot
        hasAgent = emojiIdx >= 0
          ? msgs.slice(emojiIdx + 1).some((m) => m.role === "agent")
          : msgs.some((m) => m.role === "agent");
      } else {
        hasAgent = msgs.some((m) => m.role === "agent");
      }
      if (hasAgent) chatsConAgente++;

      // Speed to lead: tiempo entre primer msg lead y primer msg agent (humano si hay bot)
      const firstLeadMsg = msgs.find((m) => m.role === "lead");
      let firstAgentMsg: ChatMessage | undefined;
      if (tieneChatbot && emojiTomaAtencion) {
        const emojiIdx = msgs.findIndex(
          (m) => m.role === "agent" && (m.message ?? "").includes(emojiTomaAtencion)
        );
        firstAgentMsg = emojiIdx >= 0
          ? msgs.slice(emojiIdx + 1).find((m) => m.role === "agent")
          : msgs.find((m) => m.role === "agent");
      } else {
        firstAgentMsg = msgs.find((m) => m.role === "agent");
      }
      // Usar primer_msg_lead_at (calculado por Cerebro) en lugar del JSONB para el gate de fecha.
      // NULL = chat sin mensajes inbound del lead → excluir del speed-to-lead (AUT-153).
      if (row.primer_msg_lead_at != null && firstAgentMsg?.timestamp) {
        const leadTs = row.primer_msg_lead_at.getTime();
        const agentTs = new Date(firstAgentMsg.timestamp).getTime();
        if (leadTs >= fromDate.getTime()) {
          const diffSecs = (agentTs - leadTs) / 1000;
          if (diffSecs > 0) {
            speedValues.push(diffSecs);
          }
        }
      }

      // Distribución de canales — tipo del primer mensaje
      const firstMsg = msgs[0];
      if (firstMsg?.type) {
        const channel = firstMsg.type;
        distribucionCanales[channel] = (distribucionCanales[channel] ?? 0) + 1;
      }

      // Vendedor con más chats — de notas_extra
      const closer = row.notas_extra?.trim();
      if (closer) {
        closerCounts[closer] = (closerCounts[closer] ?? 0) + 1;
      }
    }

    const topClosers = Object.entries(closerCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const speedCount = speedValues.length;
    const speedAvgChat = speedCount > 0 ? speedValues.reduce((s, v) => s + v, 0) / speedCount : null;
    const speedMedian = (() => {
      if (speedCount === 0) return null;
      const sorted = [...speedValues].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    })();

    return {
      total: totalChats,
      leadsUnicos: uniqueChatIds.size,
      conRespuesta: chatsConAgente,
      tasaRespuesta: totalChats > 0 ? (chatsConAgente / totalChats) * 100 : 0,
      speedToLeadAvg: speedAvgChat,
      speedToLeadMedian: speedMedian,
      speedToLeadCount: speedCount,
      mensajesPromedioPorLead: uniqueChatIds.size > 0 ? totalMensajes / uniqueChatIds.size : null,
      distribucionCanales,
      topClosers,
    };
  })();

  // ----------------------------------------------------------------
  // Metas del tenant — calcular alertas de progreso
  // ----------------------------------------------------------------
  const metasRows = await db
    .select()
    .from(metasCuenta)
    .where(eq(metasCuenta.id_cuenta, idCuenta))
    .limit(1);
  const metasRow = metasRows[0] ?? null;

  const alertasMetas: AlertaMeta[] = [];
  if (metasRow) {
    // Calcular número de días y semanas del período
    const msPerDay = 1000 * 60 * 60 * 24;
    const dias = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / msPerDay));
    const semanas = Math.max(1, dias / 7);

    type Canal = "llamadas" | "videollamadas" | "chats" | "general";

    const addAlerta = (
      label: string,
      actual: number,
      meta: number | null | undefined,
      canal: Canal,
      unidad?: string,
      invertido?: boolean,
    ) => {
      const metaNum = meta != null ? parseFloat(String(meta)) : 0;
      if (!metaNum) return;
      // Para métricas invertidas (menos = mejor), el pct se calcula al revés:
      // si actual <= meta → 100% (cumple). Si actual > meta → % proporcional degradado.
      let pct: number;
      if (invertido) {
        pct = actual <= 0 ? 0 : Math.round((metaNum / actual) * 100);
      } else {
        pct = Math.round((actual / metaNum) * 100);
      }
      const cumple = invertido ? actual <= metaNum : pct >= 100;
      const sinDatos = actual === 0 && !invertido;
      alertasMetas.push({
        label,
        actual: Math.round(actual * 10) / 10,
        meta: metaNum,
        cumple,
        pct: Math.min(200, pct), // cap para no distorsionar UI
        unidad,
        canal,
        invertido,
        sinDatos,
      });
    };

    // ── LLAMADAS ────────────────────────────────────────────────────
    // Usar meta_llamadas_semanales si existe, sino meta_llamadas_diarias × días (backward compat)
    const metaLlamadasTotal = metasRow.meta_llamadas_semanales
      ? parseFloat(String(metasRow.meta_llamadas_semanales)) * semanas
      : metasRow.meta_llamadas_diarias
        ? metasRow.meta_llamadas_diarias * dias
        : null;

    // Historial diario de metas de llamadas — para mostrar qué días se cumplió
    const metaDiariaLlamadas = metasRow.meta_llamadas_diarias
      ? parseFloat(String(metasRow.meta_llamadas_diarias))
      : null;
    const historialLlamadas = metaDiariaLlamadas
      ? volumeByDay.map((d) => ({
          fecha: String(d.date),
          actual: d.llamadas,
          meta: metaDiariaLlamadas,
          cumple: d.llamadas >= metaDiariaLlamadas,
        }))
      : undefined;

    const metaLlamadasAlerta = alertasMetas.length; // índice donde se insertará
    addAlerta("📞 Llamadas realizadas", kpis.callsMade, metaLlamadasTotal, "llamadas", "llamadas en el período");
    // Inyectar historial en la alerta recién creada
    if (historialLlamadas && alertasMetas[metaLlamadasAlerta]) {
      alertasMetas[metaLlamadasAlerta]!.historialDiario = historialLlamadas;
    }
    addAlerta(
      "📞 % Contestación",
      kpis.answerRate * 100,
      metasRow.meta_contestacion_llamadas ? parseFloat(String(metasRow.meta_contestacion_llamadas)) : null,
      "llamadas",
      "%",
    );
    // Speed to lead de llamadas — invertido (menos min = mejor)
    const metaSpeedLlamadas = metasRow.meta_speed_llamadas_min
      ? parseFloat(String(metasRow.meta_speed_llamadas_min))
      : metasRow.meta_speed_to_lead_min
        ? parseFloat(String(metasRow.meta_speed_to_lead_min))
        : null;
    addAlerta("📞 Speed to lead", kpis.speedToLeadAvg, metaSpeedLlamadas, "llamadas", "min", true);

    // Backward-compat: tasa contestación vieja
    if (!metasRow.meta_contestacion_llamadas && metasRow.meta_tasa_contestacion) {
      addAlerta(
        "📞 Tasa contestación (legacy)",
        kpis.answerRate * 100,
        parseFloat(String(metasRow.meta_tasa_contestacion)) * 100,
        "llamadas",
        "%",
      );
    }

    // ── VIDEOLLAMADAS ───────────────────────────────────────────────
    // Solo si hay agendas o metas de video configuradas
    const hasVideoMetas = metasRow.meta_citas_semanales_video || metasRow.meta_citas_semanales || metasRow.meta_cierres_semanales || metasRow.meta_revenue_mensual || metasRow.meta_revenue_video;
    if (hasVideoMetas) {
      const metaCitasVideo = metasRow.meta_citas_semanales_video
        ? parseFloat(String(metasRow.meta_citas_semanales_video)) * semanas
        : metasRow.meta_citas_semanales
          ? parseFloat(String(metasRow.meta_citas_semanales)) * semanas
          : null;
      addAlerta("🎥 Citas agendadas", kpis.meetingsBooked, metaCitasVideo, "videollamadas", "citas");
      const metaCierresVideo = metasRow.meta_cierres_semanales
        ? parseFloat(String(metasRow.meta_cierres_semanales)) * semanas
        : null;
      addAlerta("🎥 Cierres", kpis.meetingsClosed, metaCierresVideo, "videollamadas", "cierres");
      addAlerta(
        "🎥 % Cierre",
        kpis.tasaCierre,
        metasRow.meta_cierre_video ? parseFloat(String(metasRow.meta_cierre_video)) : null,
        "videollamadas",
        "%",
      );
      // Backward-compat: meta_tasa_cierre vieja → videollamadas
      if (!metasRow.meta_cierre_video && metasRow.meta_tasa_cierre) {
        addAlerta(
          "🎥 Tasa de cierre (legacy)",
          kpis.tasaCierre,
          parseFloat(String(metasRow.meta_tasa_cierre)) * 100,
          "videollamadas",
          "%",
        );
      }
      const metaRevenue = metasRow.meta_revenue_video
        ? parseFloat(String(metasRow.meta_revenue_video))
        : metasRow.meta_revenue_mensual
          ? parseFloat(String(metasRow.meta_revenue_mensual))
          : null;
      addAlerta("🎥 Revenue", kpis.revenue, metaRevenue, "videollamadas", "$");
    }

    // ── CHATS ───────────────────────────────────────────────────────
    const hasChatMetas = metasRow.meta_chats_diarios || metasRow.meta_chats_contestacion || metasRow.meta_speed_chat_min;
    if (hasChatMetas) {
      const chatTotal = chatKpis?.total ?? 0;
      addAlerta(
        "💬 Chats atendidos",
        chatTotal,
        metasRow.meta_chats_diarios ? metasRow.meta_chats_diarios * dias : null,
        "chats",
        "chats",
      );
      addAlerta(
        "💬 % Con respuesta",
        chatKpis?.tasaRespuesta ?? 0,
        metasRow.meta_chats_contestacion ? parseFloat(String(metasRow.meta_chats_contestacion)) : null,
        "chats",
        "%",
      );
      // Speed chat — invertido
      // Solo mostrar alerta si hay datos reales (speedToLeadAvg !== null).
      // Null significa que no hay chats con primer_msg_lead_at en el período,
      // no que el speed sea 0.0 min — mostrar 0 sería estadísticamente engañoso.
      const chatSpeedRaw = chatKpis && chatKpis.speedToLeadCount > 0 && chatKpis.speedToLeadCount < 5
        ? chatKpis.speedToLeadMedian
        : chatKpis?.speedToLeadAvg;
      const chatSpeedMin = chatSpeedRaw != null ? chatSpeedRaw / 60 : null;
      if (chatSpeedMin != null) {
        addAlerta(
          "💬 Speed to lead chat",
          chatSpeedMin,
          metasRow.meta_speed_chat_min ? parseFloat(String(metasRow.meta_speed_chat_min)) : null,
          "chats",
          "min",
          true,
        );
      }
    }
  }

  // ── Ads summary para widget en Panel Ejecutivo ──────────────────────────────
  // Re-uses adsAggRowEarly computed at the start (no extra DB query needed)
  let adsSummary: DashboardAdsSummary | undefined;
  if (hasAdsConfigEarly && (adsGastoTotal > 0 || adsPlataformasEarly.length > 0 || adsPlayRate > 0)) {
    adsSummary = {
      hasAds: true,
      gastoTotal: adsGastoTotal,
      impresiones: adsImpresiones,
      clicks: adsClicks,
      ctr: adsCtr,
      cpm: adsCpm,
      cpc: adsCpc,
      playRate: adsPlayRate > 0 ? adsPlayRate : undefined,
      engagementRate: adsEngagement > 0 ? adsEngagement : undefined,
      camposExtra: adsCamposExtra,
      plataformas: adsPlataformasEarly,
    };
  }

  // ----------------------------------------------------------------
  // Segmentación calificado × canal + agendó / no agendó
  // Canal se infiere: videollamada (fathom_recording_id), llamada (logLlamadas efectiva), chat (chatsLogs)
  // ----------------------------------------------------------------
  const segmentacionCalificadoCanal: SegmentoCalificadoCanal[] = (() => {
    const counters: Record<SegmentoCanal, { cal: number; noCal: number; calAg: number; calNoAg: number; noCalAg: number; noCalNoAg: number }> = {
      llamada: { cal: 0, noCal: 0, calAg: 0, calNoAg: 0, noCalAg: 0, noCalNoAg: 0 },
      chat: { cal: 0, noCal: 0, calAg: 0, calNoAg: 0, noCalAg: 0, noCalNoAg: 0 },
      videollamada: { cal: 0, noCal: 0, calAg: 0, calNoAg: 0, noCalAg: 0, noCalNoAg: 0 },
    };

    // Videollamadas: agendas con Fathom recording
    for (const a of filteredAgendas) {
      if (!a.fathom_recording_id) continue;
      const cat = (a.categoria ?? "").toLowerCase().trim();
      if (!cat || cat === "pdte" || cat === "pendiente") continue;
      const isQualified = effectiveQualifiedSet.has(cat);
      const hasAgenda = a.fecha_reunion != null;
      const c = counters.videollamada;
      if (isQualified) {
        c.cal++;
        if (hasAgenda) c.calAg++; else c.calNoAg++;
      } else {
        c.noCal++;
        if (hasAgenda) c.noCalAg++; else c.noCalNoAg++;
      }
    }

    // Llamadas: log_llamadas (fuente real de datos de llamadas)
    const SKIP_CALL_ESTADOS = new Set(["no_contestada", ""]);
    for (const call of filteredCalls) {
      const estado = (call.estado_resultado ?? "").toLowerCase().trim();
      if (SKIP_CALL_ESTADOS.has(estado)) continue;
      const isQualified = effectiveQualifiedSet.has(estado);
      const c = counters.llamada;
      if (isQualified) {
        c.cal++;
        c.calNoAg++;
      } else {
        c.noCal++;
        c.noCalNoAg++;
      }
    }

    for (const chatRow of chatRows) {
      const estado = (chatRow.estado ?? "").toLowerCase().trim();
      if (!estado) continue;
      const isQualified = effectiveQualifiedSet.has(estado);
      const c = counters.chat;
      if (isQualified) {
        c.cal++;
        c.calNoAg++;
      } else {
        c.noCal++;
        c.noCalNoAg++;
      }
    }

    return (Object.entries(counters) as [SegmentoCanal, typeof counters.llamada][])
      .filter(([, v]) => v.cal + v.noCal > 0)
      .map(([canal, v]) => ({
        canal,
        calificado: v.cal,
        noCalificado: v.noCal,
        calificadoAgendo: v.calAg,
        calificadoNoAgendo: v.calNoAg,
        noCalificadoAgendo: v.noCalAg,
        noCalificadoNoAgendo: v.noCalNoAg,
      }));
  })();

  return {
    kpis,
    advisorRanking,
    volumeByDay,
    objeciones,
    objecionesPorCanal: objecionesPorCanal.length > 0 ? objecionesPorCanal : undefined,
    razonesPerdida: razonesPerdida.length > 0 ? razonesPerdida : undefined,
    advisors,
    fuenteDatosFinancieros: fuenteFinanciera ?? "nativa",
    embudoPersonalizado: etapas?.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      color: e.color,
      orden: e.orden,
      condition: e.condition,
    })),
    distribucionEmbudo,
    tagsDisponibles: [...allTags].sort(),
    tagCounts,
    metricasPersonalizadas: Array.isArray(cuentaRow?.metricas_personalizadas) ? cuentaRow.metricas_personalizadas : [],
    metricasComputadas,
    dashboardsPersonalizados: Array.isArray(cuentaRow?.dashboards_personalizados) ? cuentaRow.dashboards_personalizados as { id: string; nombre: string; icono?: string }[] : [],
    chatKpis: chatKpis.total > 0 ? chatKpis : undefined,
    alertasMetas: alertasMetas.length > 0 ? alertasMetas : undefined,
    adsSummary,
    segmentacionCalificadoCanal: segmentacionCalificadoCanal.length > 0 ? segmentacionCalificadoCanal : undefined,
    configuracion_ui: cuentaRow?.configuracion_ui as DashboardResponse["configuracion_ui"] ?? undefined,
    fuente_llamadas: (cuentaRow?.fuente_llamadas === "ghl" ? "ghl" : "twilio") as "twilio" | "ghl",
  };
}
