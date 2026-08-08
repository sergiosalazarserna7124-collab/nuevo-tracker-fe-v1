import { db } from "@/lib/db";
import { cuentas, metasCuenta, normalizeEmbudoEtapas } from "@/lib/db/schema";
import type { ReglaEtiqueta, MetricaPersonalizada, ChatTrigger, EmbudoEtapa, TipoEventoConfig, RolConfig, MetricaConfig, MetricaManualEntry, ConfiguracionAds, DashboardPersonalizado, CategoriaLlamada,
  CategoriaCita, CategoriaChat, ExclusionesCoach } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseMetricasConfig } from "@/lib/metricas-engine";
import { HORARIO_LABORAL_DEFAULT, type HorarioLaboral } from "@/lib/business-hours";

export interface ChatConfigData {
  tiene_chatbot: boolean;
  emoji_toma_atencion: string;
  // Legacy fields kept for backward compatibility (no longer shown in UI)
  trigger_mode?: "unico" | "multiple";
  trigger_confirmaciones?: number;
}

export interface SystemConfigData {
  prompt_ventas: string;
  prompt_videollamadas: string;
  prompt_llamadas: string;
  fuente_llamadas: "twilio" | "ghl";
  ghl_location_id: string | null;
  reglas_etiquetas: ReglaEtiqueta[];
  metricas_personalizadas: MetricaPersonalizada[];
  metricas_config: MetricaConfig[];
  metricas_manual_data: Record<string, MetricaManualEntry[]>;
  dashboards_personalizados: DashboardPersonalizado[];
  embudo_personalizado: EmbudoEtapa[];
  tipos_eventos_config: TipoEventoConfig[];
  has_openai_key: boolean;
  has_gemini_key: boolean;
  gemini_premium_status: "active" | "paused_invalid_key" | "paused_quota_exceeded" | null;
  fuente_datos_financieros: "nativa" | "api_externa";
  seccion_chats_dashboard: boolean;
  configuracion_ads: ConfiguracionAds;
  roles_config: RolConfig[];
  chat_config: ChatConfigData;
  chat_analisis_hora: number;
  idioma: "es" | "en";
  /** Columnas visibles en el ranking de asesores. Si undefined → todas visibles. */
  ranking_columnas: string[] | null;
  /** Secciones ocultas del dashboard (ej. 'panel_ranking'). */
  secciones_ocultas: string[];
  /** Métrica base para ordenar el ranking de asesores. Null → score compuesto. */
  ranking_metrica_base: string | null;
  /** Control de notas en GHL tras procesar videollamada de Fathom */
  ghl_notas?: { ia?: boolean; transcripcion?: boolean };
  ghl_notas_llamadas?: { ia?: boolean; transcripcion?: boolean };
  /** Custom fields de GHL donde escribir el contenido auto-generado (key/id del campo) */
  ghl_campos?: { ia?: string; transcripcion?: string };
  ghl_campos_llamadas?: { ia?: string; transcripcion?: string };
  /** Toggle: si true, las etapas con es_cerrada:true también cuentan como calificadas */
  cerradas_cuentan_como_calificadas?: boolean;
  categorias_llamadas: CategoriaLlamada[];
  categorias_citas: CategoriaCita[];
  categorias_chats: CategoriaChat[];
  exclusiones_coach: ExclusionesCoach | null;
  /** Horario laboral para el "speed to lead asesor". */
  horario_laboral: HorarioLaboral;
}

export interface SystemConfigUpdatePayload extends Partial<Omit<SystemConfigData, "has_openai_key" | "has_gemini_key" | "gemini_premium_status" | "fuente_llamadas">> {
  fuente_llamadas?: "twilio" | "ghl";
  ghl_location_id?: string | null;
  openai_api_key?: string;
  gemini_api_key?: string;
  seccion_chats_dashboard?: boolean;
  chat_config?: ChatConfigData;
  idioma?: "es" | "en";
  configuracion_ads?: ConfiguracionAds;
  ranking_columnas?: string[] | null;
  secciones_ocultas?: string[];
  ranking_metrica_base?: string | null;
  ghl_notas?: { ia?: boolean; transcripcion?: boolean };
  ghl_notas_llamadas?: { ia?: boolean; transcripcion?: boolean };
  ghl_campos?: { ia?: string; transcripcion?: string };
  ghl_campos_llamadas?: { ia?: string; transcripcion?: string };
  cerradas_cuentan_como_calificadas?: boolean;
  categorias_llamadas?: CategoriaLlamada[];
  exclusiones_coach?: ExclusionesCoach | null;
}

const DEFAULT_PROMPT_VENTAS =
  "Somos una empresa de formación en ventas. Ofrecemos programas de 90 días con mentoría y seguimiento.";
const DEFAULT_PROMPT_VIDEO =
  "Evalúa la cita según: 1) Claridad del valor ofrecido, 2) Manejo de objeciones, 3) Cierre o siguiente paso definido. Asigna puntaje 1-10 por criterio.";
const DEFAULT_PROMPT_LLAMADAS =
  "Evalúa la llamada telefónica según: 1) Saludo y presentación, 2) Calificación del lead (interés, autoridad, necesidad), 3) Manejo de objeciones, 4) Cierre o siguiente paso (agendar, callback). Asigna puntaje 1-10 por criterio.";

export async function getSystemConfig(idCuenta: number): Promise<SystemConfigData> {
  const [rows, metasRows] = await Promise.all([
    db
      .select({
        prompt_ventas: cuentas.prompt_ventas,
        prompt_videollamadas: cuentas.prompt_videollamadas,
        prompt_llamadas: cuentas.prompt_llamadas,
        reglas_etiquetas: cuentas.reglas_etiquetas,
        metricas_personalizadas: cuentas.metricas_personalizadas,
        embudo_personalizado: cuentas.embudo_personalizado,
        tipos_eventos_config: cuentas.tipos_eventos_config,
        openai_api_key: cuentas.openai_api_key,
        configuracion_ui: cuentas.configuracion_ui,
        roles_config: cuentas.roles_config,
        metricas_config: cuentas.metricas_config,
        metricas_manual_data: cuentas.metricas_manual_data,
        dashboards_personalizados: cuentas.dashboards_personalizados,
        fuente_llamadas: cuentas.fuente_llamadas,
        ghl_location_id: cuentas.ghl_location_id,
        configuracion_ads: cuentas.configuracion_ads,
        categorias_llamadas: cuentas.categorias_llamadas,
        categorias_citas: cuentas.categorias_citas,
        categorias_chats: cuentas.categorias_chats,
        exclusiones_coach: cuentas.exclusiones_coach,
        gemini_api_key: cuentas.gemini_api_key,
        gemini_premium_status: cuentas.gemini_premium_status,
      })
      .from(cuentas)
      .where(eq(cuentas.id_cuenta, idCuenta))
      .limit(1),
    db
      .select({ chat_analisis_hora: metasCuenta.chat_analisis_hora })
      .from(metasCuenta)
      .where(eq(metasCuenta.id_cuenta, idCuenta))
      .limit(1),
  ]);

  const chatAnalisisHora = metasRows[0]?.chat_analisis_hora ?? 2;

  if (rows.length === 0) {
    return {
      prompt_ventas: DEFAULT_PROMPT_VENTAS,
      prompt_videollamadas: DEFAULT_PROMPT_VIDEO,
      prompt_llamadas: DEFAULT_PROMPT_LLAMADAS,
      reglas_etiquetas: [],
      metricas_personalizadas: [],
      embudo_personalizado: [],
      tipos_eventos_config: [],
      has_openai_key: false,
      has_gemini_key: false,
      gemini_premium_status: null,
      fuente_datos_financieros: "nativa",
      seccion_chats_dashboard: true,
      roles_config: [],
      metricas_config: [],
      metricas_manual_data: {},
      dashboards_personalizados: [],
      chat_config: { tiene_chatbot: false, emoji_toma_atencion: "" },
      chat_analisis_hora: chatAnalisisHora,
      fuente_llamadas: "twilio" as const,
      ghl_location_id: null,
      idioma: "es" as const,
      configuracion_ads: {},
      ranking_columnas: null,
      secciones_ocultas: [],
      ranking_metrica_base: null,
      cerradas_cuentan_como_calificadas: true,
      categorias_llamadas: [],
      categorias_citas: [],
      categorias_chats: [],
      exclusiones_coach: null,
      horario_laboral: HORARIO_LABORAL_DEFAULT,
    };
  }

  const r = rows[0];
  return {
    prompt_ventas: r.prompt_ventas ?? DEFAULT_PROMPT_VENTAS,
    prompt_videollamadas: r.prompt_videollamadas ?? DEFAULT_PROMPT_VIDEO,
    prompt_llamadas: r.prompt_llamadas ?? DEFAULT_PROMPT_LLAMADAS,
    reglas_etiquetas: Array.isArray(r.reglas_etiquetas) ? r.reglas_etiquetas : [],
    metricas_personalizadas: Array.isArray(r.metricas_personalizadas) ? r.metricas_personalizadas : [],
    embudo_personalizado: Array.isArray(r.embudo_personalizado) ? normalizeEmbudoEtapas(r.embudo_personalizado) : [],
    tipos_eventos_config: Array.isArray(r.tipos_eventos_config) ? r.tipos_eventos_config : [],
    has_openai_key: !!r.openai_api_key,
    has_gemini_key: !!r.gemini_api_key,
    gemini_premium_status: (r.gemini_premium_status as SystemConfigData["gemini_premium_status"]) ?? null,
    fuente_datos_financieros: r.configuracion_ui?.fuente_datos_financieros ?? "nativa",
    seccion_chats_dashboard: r.configuracion_ui?.modulos_activos?.seccion_chats_dashboard !== false,
    roles_config: Array.isArray(r.roles_config) ? r.roles_config : [],
    metricas_config: parseMetricasConfig(r.metricas_config),
    metricas_manual_data: (r.metricas_manual_data && typeof r.metricas_manual_data === "object") ? r.metricas_manual_data as Record<string, MetricaManualEntry[]> : {},
    dashboards_personalizados: Array.isArray(r.dashboards_personalizados) ? r.dashboards_personalizados as DashboardPersonalizado[] : [],
    chat_config: {
      tiene_chatbot: r.configuracion_ui?.chat_config?.tiene_chatbot ?? false,
      emoji_toma_atencion: r.configuracion_ui?.chat_config?.emoji_toma_atencion ?? "",
    },
    chat_analisis_hora: chatAnalisisHora,
    fuente_llamadas: (r.fuente_llamadas === "ghl" ? "ghl" : "twilio") as "twilio" | "ghl",
    ghl_location_id: r.ghl_location_id ?? null,
    idioma: (r.configuracion_ui?.idioma === "en" ? "en" : "es") as "es" | "en",
    configuracion_ads: (r.configuracion_ads && typeof r.configuracion_ads === "object") ? r.configuracion_ads as ConfiguracionAds : {},
    ranking_columnas: Array.isArray(r.configuracion_ui?.ranking_columnas) ? r.configuracion_ui.ranking_columnas : null,
    secciones_ocultas: Array.isArray(r.configuracion_ui?.secciones_ocultas) ? r.configuracion_ui.secciones_ocultas as string[] : [],
    ranking_metrica_base: (typeof r.configuracion_ui?.ranking_metrica_base === 'string') ? r.configuracion_ui.ranking_metrica_base : null,
    ghl_notas: r.configuracion_ui?.ghl_notas ?? { ia: true, transcripcion: false },
    ghl_notas_llamadas: r.configuracion_ui?.ghl_notas_llamadas ?? { ia: true, transcripcion: true },
    ghl_campos: r.configuracion_ui?.ghl_campos ?? { ia: "", transcripcion: "" },
    ghl_campos_llamadas: r.configuracion_ui?.ghl_campos_llamadas ?? { ia: "", transcripcion: "" },
    cerradas_cuentan_como_calificadas: r.configuracion_ui?.cerradas_cuentan_como_calificadas ?? true,
    categorias_llamadas: Array.isArray(r.categorias_llamadas) ? r.categorias_llamadas : [],
    categorias_citas: Array.isArray(r.categorias_citas) ? r.categorias_citas : [],
    categorias_chats: Array.isArray(r.categorias_chats) ? r.categorias_chats : [],
    exclusiones_coach: (r.exclusiones_coach && typeof r.exclusiones_coach === "object") ? r.exclusiones_coach as ExclusionesCoach : null,
    horario_laboral: r.configuracion_ui?.horario_laboral ?? HORARIO_LABORAL_DEFAULT,
  };
}

export async function updateSystemConfig(
  idCuenta: number,
  data: SystemConfigUpdatePayload,
): Promise<SystemConfigData> {
  const setClause: Record<string, unknown> = {};

  if (data.prompt_ventas !== undefined) setClause.prompt_ventas = data.prompt_ventas;
  if (data.prompt_videollamadas !== undefined) setClause.prompt_videollamadas = data.prompt_videollamadas;
  if (data.prompt_llamadas !== undefined) setClause.prompt_llamadas = data.prompt_llamadas;
  if (data.fuente_llamadas !== undefined) setClause.fuente_llamadas = data.fuente_llamadas;
  if (data.ghl_location_id !== undefined) setClause.ghl_location_id = data.ghl_location_id;
  if (data.reglas_etiquetas !== undefined) setClause.reglas_etiquetas = data.reglas_etiquetas;
  if (data.metricas_personalizadas !== undefined) setClause.metricas_personalizadas = data.metricas_personalizadas;
  if (data.embudo_personalizado !== undefined) {
    const embudoNuevo = normalizeEmbudoEtapas(data.embudo_personalizado as unknown[]);
    setClause.embudo_personalizado = embudoNuevo;
    const metricsExisting = [...(data.metricas_config ?? [])] as MetricaConfig[];

    const [currentRow] = await db
      .select({
        metricas_config: cuentas.metricas_config,
        embudo_personalizado: cuentas.embudo_personalizado,
      })
      .from(cuentas)
      .where(eq(cuentas.id_cuenta, idCuenta))
      .limit(1);

    const previousEtapaIds = new Set(
      (Array.isArray(currentRow?.embudo_personalizado)
        ? currentRow.embudo_personalizado
        : []
      ).map((e: { id: string }) => e.id),
    );

    for (const etapa of embudoNuevo) {
      if (etapa.es_fija !== true && !previousEtapaIds.has(etapa.id)) {
        const metricId = `embudo-${etapa.id}`;
        const alreadyExists = metricsExisting.some((m) => m.id === metricId);
        if (!alreadyExists) {
          const newMetric: MetricaConfig = {
            id: metricId,
            nombre: etapa.nombre,
            tipo: "embudo_etapa",
            paneles: ["panel_ejecutivo"],
            formato: "numero",
            color: etapa.color ?? "cyan",
            descripcion: `Leads clasificados como "${etapa.nombre}"`,
          };
          metricsExisting.push(newMetric);
        }
      }
    }
    const idsEtapasVigentes = new Set(embudoNuevo.map((e) => `embudo-${e.id}`));
    setClause.metricas_config = metricsExisting.filter(
      (m) => m.tipo !== "embudo_etapa" || idsEtapasVigentes.has(m.id),
    );
  }
  if (data.tipos_eventos_config !== undefined) setClause.tipos_eventos_config = data.tipos_eventos_config;
  if (data.openai_api_key !== undefined) setClause.openai_api_key = data.openai_api_key;
  if (data.gemini_api_key !== undefined) {
    setClause.gemini_api_key = data.gemini_api_key;
    setClause.gemini_premium_status = "active";
  }
  if (data.roles_config !== undefined) setClause.roles_config = data.roles_config;
  if (data.metricas_config !== undefined && data.embudo_personalizado === undefined) setClause.metricas_config = data.metricas_config;
  if (data.metricas_manual_data !== undefined) setClause.metricas_manual_data = data.metricas_manual_data;
  if (data.configuracion_ads !== undefined) setClause.configuracion_ads = data.configuracion_ads;
  if (data.categorias_llamadas !== undefined) setClause.categorias_llamadas = data.categorias_llamadas;
  if (data.categorias_citas !== undefined) setClause.categorias_citas = data.categorias_citas;
  if (data.categorias_chats !== undefined) setClause.categorias_chats = data.categorias_chats;
  if (data.exclusiones_coach !== undefined) setClause.exclusiones_coach = data.exclusiones_coach;

  // Handle chat_analisis_hora — update metas_cuenta table
  const dataAnyTop = data as Record<string, unknown>;
  if (dataAnyTop.chat_analisis_hora !== undefined) {
    const hora = Number(dataAnyTop.chat_analisis_hora);
    if (!isNaN(hora) && hora >= 0 && hora <= 23) {
      await db
        .insert(metasCuenta)
        .values({ id_cuenta: idCuenta, chat_analisis_hora: hora })
        .onConflictDoUpdate({
          target: metasCuenta.id_cuenta,
          set: { chat_analisis_hora: hora },
        });
    }
  }

  if (
    data.fuente_datos_financieros !== undefined ||
    (data as Record<string, unknown>).seccion_chats_dashboard !== undefined ||
    data.chat_config !== undefined ||
    data.idioma !== undefined ||
    data.ranking_columnas !== undefined ||
    data.secciones_ocultas !== undefined ||
    data.ranking_metrica_base !== undefined ||
    (data as Record<string, unknown>).ghl_notas !== undefined ||
    (data as Record<string, unknown>).ghl_notas_llamadas !== undefined ||
    (data as Record<string, unknown>).ghl_campos !== undefined ||
    (data as Record<string, unknown>).ghl_campos_llamadas !== undefined ||
    (data as Record<string, unknown>).cerradas_cuentan_como_calificadas !== undefined ||
    data.horario_laboral !== undefined
  ) {
    const [row] = await db
      .select({ configuracion_ui: cuentas.configuracion_ui })
      .from(cuentas)
      .where(eq(cuentas.id_cuenta, idCuenta))
      .limit(1);
    const existing = row?.configuracion_ui ?? {};
    const existingModulos = existing.modulos_activos ?? {};
    const updatedUi: typeof existing = { ...existing };
    if (data.fuente_datos_financieros !== undefined) {
      updatedUi.fuente_datos_financieros = data.fuente_datos_financieros;
    }
    const dataAny = data as Record<string, unknown>;
    if (dataAny.seccion_chats_dashboard !== undefined) {
      updatedUi.modulos_activos = { ...existingModulos, seccion_chats_dashboard: dataAny.seccion_chats_dashboard as boolean };
    }
    if (data.chat_config !== undefined) {
      updatedUi.chat_config = data.chat_config;
    }
    if (data.idioma !== undefined) {
      updatedUi.idioma = data.idioma;
    }
    if (data.ranking_columnas !== undefined) {
      updatedUi.ranking_columnas = data.ranking_columnas ?? undefined;
    }
    if (data.secciones_ocultas !== undefined) {
      updatedUi.secciones_ocultas = data.secciones_ocultas;
    }
    if (data.ranking_metrica_base !== undefined) {
      updatedUi.ranking_metrica_base = data.ranking_metrica_base ?? undefined;
    }
    if ((data as Record<string, unknown>).ghl_notas !== undefined) {
      updatedUi.ghl_notas = (data as Record<string, unknown>).ghl_notas as { ia?: boolean; transcripcion?: boolean };
    }
    if ((data as Record<string, unknown>).ghl_notas_llamadas !== undefined) {
      updatedUi.ghl_notas_llamadas = (data as Record<string, unknown>).ghl_notas_llamadas as { ia?: boolean; transcripcion?: boolean };
    }
    if ((data as Record<string, unknown>).ghl_campos !== undefined) {
      updatedUi.ghl_campos = (data as Record<string, unknown>).ghl_campos as { ia?: string; transcripcion?: string };
    }
    if ((data as Record<string, unknown>).ghl_campos_llamadas !== undefined) {
      updatedUi.ghl_campos_llamadas = (data as Record<string, unknown>).ghl_campos_llamadas as { ia?: string; transcripcion?: string };
    }
    if (data.horario_laboral !== undefined) {
      updatedUi.horario_laboral = data.horario_laboral;
    }
    if ((data as Record<string, unknown>).cerradas_cuentan_como_calificadas !== undefined) {
      updatedUi.cerradas_cuentan_como_calificadas = (data as Record<string, unknown>).cerradas_cuentan_como_calificadas as boolean;
    }
    setClause.configuracion_ui = updatedUi;
  }

  if (Object.keys(setClause).length > 0) {
    await db.update(cuentas).set(setClause).where(eq(cuentas.id_cuenta, idCuenta));
  }

  return getSystemConfig(idCuenta);
}
