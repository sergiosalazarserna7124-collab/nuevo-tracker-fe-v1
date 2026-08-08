import {
  pgTable,
  serial,
  bigserial,
  bigint,
  text,
  integer,
  jsonb,
  date,
  timestamp,
  varchar,
  numeric,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/*  cuentas — tabla maestra de tenants                                */
/* ------------------------------------------------------------------ */

export interface ChatConfig {
  tiene_chatbot?: boolean;
  emoji_toma_atencion?: string;
  trigger_mode?: "unico" | "multiple";
  trigger_confirmaciones?: number;
}

export interface ConfiguracionUI {
  logo_url?: string;
  color_primario?: string;
  color_secundario?: string;
  nombre_empresa_display?: string;
  modulos_activos?: {
    chats?: boolean;
    citas_ghl?: boolean;
    llamadas_twilio?: boolean;
    videollamadas_fathom?: boolean;
    seccion_chats_dashboard?: boolean;
  };
  nombres_secciones?: Record<string, string>;
  columnas_visibles?: Record<string, string[]>;
  kpis_visibles?: Record<string, string[]>;
  fuente_datos_financieros?: "nativa" | "api_externa";
  chat_config?: ChatConfig;
  /** Horario laboral para el "speed to lead asesor" (minutos en horario). */
  horario_laboral?: {
    /** Días ISO: 1=Lun … 7=Dom. */
    dias: number[];
    /** "HH:MM" hora local de la cuenta. */
    hora_inicio: string;
    hora_fin: string;
  };
  idioma?: "es" | "en";
  /** Columnas visibles en el ranking de asesores. Si undefined → todas visibles. */
  ranking_columnas?: string[];
  /** Notas GHL: controla qué se guarda en GHL después de procesar una videollamada de Fathom */
  ghl_notas?: {
    /** Guardar nota con el análisis IA (categoría, etiquetas, resumen). Default: true */
    ia?: boolean;
    /** Guardar nota con la transcripción completa. Default: false (consume tokens, puede fallar por límite de 65k chars) */
    transcripcion?: boolean;
  };
  /** Notas GHL para LLAMADAS telefónicas (canal GHL calls). Independiente de ghl_notas (videollamadas). */
  ghl_notas_llamadas?: {
    ia?: boolean;
    transcripcion?: boolean;
  };
  /** Campos personalizados de GHL donde escribir el contenido auto-generado de VIDEOLLAMADAS (Fathom).
   *  Valor = key/id del custom field en GHL (ej. "contact.transcripcion"). Vacío = no escribir. */
  ghl_campos?: {
    /** Custom field donde se escribe el resumen/análisis IA */
    ia?: string;
    /** Custom field donde se escribe la transcripción completa */
    transcripcion?: string;
  };
  /** Campos personalizados de GHL para LLAMADAS telefónicas. Independiente de ghl_campos (videollamadas). */
  ghl_campos_llamadas?: {
    ia?: string;
    transcripcion?: string;
  };
  /** Toggle: si true, las etapas con es_cerrada:true también cuentan como calificadas. Default: true */
  cerradas_cuentan_como_calificadas?: boolean;
  secciones_ocultas?: string[];
  ranking_metrica_base?: string;
}

export interface ReglaExclusionCoach {
  canal: "llamada" | "chat" | "videollamada" | "todos";
  campo: "estado_resultado" | "tipo_evento" | "canal";
  operador: "eq" | "neq" | "contains" | "not_contains";
  valor: string;
}

export interface ExclusionesCoach {
  reglas: ReglaExclusionCoach[];
}

export interface DynamicValueRange {
  min: number;
  label: string;
}

export interface DynamicValueConfig {
  fuente: "custom_field" | "formula";
  fieldId?: string;
  formula?: string;
  tipo?: "numero" | "si_no" | "texto" | "fecha";
  ranges?: DynamicValueRange[];
  labelSi?: string;
  labelNo?: string;
  mode?: "exacto" | "aproximado";
}

export interface AccionRegla {
  tipo: "cambiar_estado" | "asignar_etiqueta" | "etapa_cambiada" | "incrementar_metrica" | "asignar_categoria" | "escribir_campo_ghl" | "escribir_campo_ghl_ia";
  valor?: string;
  funnelStage?: string;
  metrica_id?: string;
  metrica_incremento?: number;
  categoria_id?: string;
  fieldId?: string;
  prompt?: string;
}

export interface ReglaEtiqueta {
  id: string;
  nombre: string;
  condicion: string;
  acciones?: AccionRegla[];
  fuentes?: string[];
  // Legacy fields (kept for backward compatibility)
  accion?: "cambiar_estado" | "asignar_etiqueta" | "etapa_cambiada" | "incrementar_metrica" | "asignar_categoria";
  valor?: string;
  fuente?: "chats" | "videollamadas" | "llamadas" | "todas";
  metrica_id?: string;
  metrica_incremento?: number;
  categoria_id?: string;
  dynamicValue?: DynamicValueConfig;
  condition?: string;
  tag?: string;
  source?: string;
  funnelStage?: string;
}

export function normalizeReglaEtiqueta(r: ReglaEtiqueta): Required<Pick<ReglaEtiqueta, 'id' | 'nombre' | 'condicion' | 'acciones' | 'fuentes'>> & ReglaEtiqueta {
  const acciones: AccionRegla[] = r.acciones && r.acciones.length > 0
    ? r.acciones
    : [{
        tipo: r.accion ?? 'asignar_etiqueta',
        valor: r.valor ?? r.tag,
        funnelStage: r.funnelStage,
        metrica_id: r.metrica_id,
        metrica_incremento: r.metrica_incremento,
        categoria_id: r.categoria_id,
      }];
  const fuentes: string[] = r.fuentes && r.fuentes.length > 0
    ? r.fuentes
    : (r.fuente && r.fuente !== 'todas')
      ? [r.fuente]
      : r.source === 'call'
        ? ['llamadas']
        : r.source === 'meeting'
          ? ['videollamadas']
          : (r.source && r.source !== 'todas')
            ? [r.source]
            : ['llamadas', 'videollamadas', 'chats'];
  return { ...r, acciones, fuentes, condicion: r.condicion ?? r.condition ?? '', nombre: r.nombre ?? '' };
}

export interface MetricaPersonalizada {
  id: string;
  name: string;
  description: string;
  condition: string;
  increment: number;
  whenMeasured: string;
  isRecurring: "recurrente" | "unica";
  section: string;
  panel: string;
  ubicacion?: "panel_ejecutivo" | "rendimiento" | "ambos";
}

/** Campo de una métrica manual (texto, número, fecha, boolean) */
export interface MetricaCampoConfig {
  id: string;
  nombre: string;
  tipo: "texto" | "numero" | "fecha" | "boolean";
  esClaveFiltro?: boolean;
}

/** Fórmula de métrica automática */
export interface MetricaFormulaConfig {
  tipo: "directo" | "suma" | "promedio" | "division" | "multiplicacion" | "resta" | "condicion";
  fuente?: string;
  fuentes?: string[];
  operador?: ">" | "<" | ">=" | "<=" | "==" | "!=";
  valorComparacion?: number | string | boolean;
  valorSiCumple?: number | string;
  valorSiNo?: number | string;
}

// ─── Dashboards personalizados ────────────────────────────────────────────────

/** Un dashboard personalizado creado por el usuario (máx. 3 por cuenta) */
export interface DashboardPersonalizado {
  id: string;       // "dashboard-1" | "dashboard-2" | "dashboard-3"
  nombre: string;   // Nombre libre que pone el usuario
  icono?: string | null;   // Emoji o similar
  creado_en: string; // ISO timestamp
}

// ─── Métricas ─────────────────────────────────────────────────────────────────

/** Paneles disponibles. Los "dashboard-N" son los personalizados creados por el usuario. */
export type UbicacionPanel =
  | "panel_ejecutivo"
  | "rendimiento"
  | "ambos"
  | "dashboard-1"
  | "dashboard-2"
  | "dashboard-3";

/** Configuración de visualización en barra o línea */
export interface MetricaBarraConfig {
  /** ID de otra MetricaConfig que actúa como categoría / eje X (ej. "Asesor") — opcional */
  categoria_metrica_id?: string;
  /** ID de la MetricaConfig que aporta el segundo valor en gráfico comparativo */
  comparar_con_id?: string;
  /** Etiqueta del eje Y */
  label_y?: string;
}

/** Campos disponibles de chats_logs para métricas tipo "chat" */
export type ChatMetricaCampo =
  | "total_mensajes"
  | "mensajes_agente"
  | "mensajes_lead"
  | "speed_to_lead"
  | "humano_tomo_control"
  | "objeciones_detectadas";

export type KeywordMatchScope = "mensajes_lead" | "todo_el_chat";
export type KeywordCountMode = "chats" | "ocurrencias";

/** Configuración de métrica (manual, automática, fija, webhook, ads, embudo_etapa, chat) */
export interface MetricaConfig {
  id: string;
  nombre: string;
  descripcion?: string | null;
  tipo: "manual" | "automatica" | "fija" | "webhook" | "ads" | "embudo_etapa" | "chat";
  /** Deprecated: usar paneles[] para multi-panel. Se mantiene para backward compat. */
  ubicacion?: UbicacionPanel;
  /** Lista de paneles donde aparece esta métrica. Sustituye a ubicacion. */
  paneles?: UbicacionPanel[];
  orden?: number;
  campos?: MetricaCampoConfig[];
  formula?: MetricaFormulaConfig;
  valorFijo?: number | string;
  webhookCampo?: string;
  /** For tipo="ads": which field from adsSummary to use (gastoTotal, impresiones, clicks, ctr, cpm, cpc, or a camposExtra key like "frequency", "unique_ctr") */
  adsCampo?: string;
  /** For tipo="chat": which field from chats_logs to aggregate */
  chatCampo?: ChatMetricaCampo;
  /** For tipo="chat": how to aggregate across chats ("suma" | "promedio" | "conteo") */
  chatAgregacion?: "suma" | "promedio" | "conteo";
  /** For tipo="chat" + chatSubtipo="conteo_keyword" */
  chatSubtipo?: "conteo_keyword";
  keywords?: string[];
  matchScope?: KeywordMatchScope;
  countMode?: KeywordCountMode;
  normalizeAccents?: boolean;
  formato?: "numero" | "moneda" | "porcentaje" | "tiempo" | "decimal";
  color?: string;
  /** Tipo de visualización del KPI */
  visualizacion?: "kpi_card" | "barra" | "comparativo";
  /** Config para visualización barra/comparativo */
  barra_config?: MetricaBarraConfig;
  /** Si true, cada entrada puede atribuirse a un usuario GHL (closer) o contacto. Default false. */
  atribuible_a_usuario?: boolean;
}

/** Campos reservados en MetricaManualEntry para atribución */
export interface MetricaAtribucion {
  /** ID del usuario GHL (closer/asesor) que generó esta entrada */
  _ghl_user_id?: string;
  /** Nombre del usuario GHL para mostrar (no usar para agrupar, usar el id) */
  _ghl_user_name?: string;
  /** ID del contacto/cliente en GHL */
  _ghl_customer_id?: string;
  /** Nombre del contacto para mostrar */
  _ghl_customer_name?: string;
}

/** Entrada manual: valores por campo + atribución opcional */
export type MetricaManualEntry = Record<string, string | number | boolean | null> & MetricaAtribucion;

export interface ReglaAutomatica {
  evento: 'no_show' | 'cancelada' | 'sin_actividad_dias';
  valor?: number;
}

export interface EmbudoEtapa {
  id: string;
  nombre: string;
  name?: string; // legacy key emitted by some onboarding flows; normalised to `nombre` at read time
  color?: string;
  orden: number;
  condition?: string;
  fuentes?: ('llamadas' | 'videollamadas' | 'chats')[];
  reglas_automaticas?: ReglaAutomatica[];
  es_fallback?: boolean;
  es_fija?: boolean;
  es_calificada?: boolean;
  es_cerrada?: boolean;
  es_unica?: boolean;
  metrica_id?: string;
}

export function normalizeEmbudoEtapas(raw: unknown[]): EmbudoEtapa[] {
  return (raw as (EmbudoEtapa & { name?: string })[]).map(({ name, ...rest }) => ({
    ...rest,
    nombre: rest.nombre ?? name ?? rest.id,
  }));
}

export interface ChatTrigger {
  trigger: string;
  accion: "cambiar_estado" | "asignar_etiqueta";
  valor: string;
}

export interface TipoEventoConfig {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface RolConfig {
  id: string;
  nombre: string;
  permisos: string[];
}

export interface ConfiguracionAds {
  meta?: {
    activo: boolean;
    ad_account_id: string;
    access_token: string;
    cron_hora: number;
    campos_extra?: string[];
    pixel_id?: string;
  };
  google?: {
    activo: boolean;
    customer_id: string;
    developer_token: string;
    client_id: string;
    client_secret: string;
    refresh_token: string;
    cron_hora: number;
  };
  tiktok?: {
    activo: boolean;
    advertiser_id: string;
    access_token: string;
    cron_hora: number;
  };
  vturb?: {
    activo: boolean;
    api_token: string;
    auth_header?: string; // Header de auth de Vturb — default: x-api-token
    nombre_player: string;
    cron_hora: number;
  };
}

// ─── Razones de pérdida ──────────────────────────────────────────────────────

export interface RazonPerdidaOption {
  id: string;
  label: string;
  color?: string;
  activo: boolean;
}

export interface RazonPerdidaEntry {
  razon_id: string;
  contact_id?: string;
  contact_name?: string;
  closer_email?: string;
  fecha: string;
  notas?: string;
}

// ─── Categorías de llamada (AUT-1143) ─────────────────────────────────────────

export interface CategoriaLlamada {
  id: string;
  nombre: string;
  definicion?: string;
  temas: string[];
  prompt: string;
  /** Etiqueta de GHL que ancla esta categoría: si el contacto la tiene, la llamada se evalúa con este prompt */
  etiqueta?: string;
}

// ─── Categorías de evaluación de citas (videollamadas) ────────────────────────

export interface CategoriaCita {
  id: string;
  nombre: string;
  /** Etiqueta de GHL que ancla esta categoría al tipo de contacto */
  etiqueta: string;
  prompt: string;
}

// ─── Categorías de evaluación de chats (por etiqueta del contacto) ────────────

export interface CategoriaChat {
  id: string;
  nombre: string;
  etiqueta: string;
  prompt: string;
}

// ─── Categorías de LEADS unificadas (etapa del lead) ──────────────────────────
// La etiqueta del contacto define su etapa; TODA interacción (chat, llamada,
// cita) se evalúa con el prompt de la etapa, se resume con prompt_resumen y
// las reglas de etiquetas de la etapa aplican SOLO ahí.

// Regla de etiquetas de la etapa: mismo modelo completo que las reglas globales
// (condición + N acciones + fuentes + exclusiones), pero aplican SOLO cuando el
// contacto está en esta etapa.
export interface AccionReglaEtapa {
  tipo: "asignar_etiqueta" | "incrementar_metrica" | "asignar_categoria" | "escribir_campo_ghl" | "escribir_campo_ghl_ia" | "actualizar_pipeline";
  valor?: string;
  funnelStage?: string;
  metrica_id?: string;
  metrica_incremento?: number;
  categoria_id?: string;
  fieldId?: string;
  prompt?: string;
  pipeline_id?: string;
  pipeline_nombre?: string;
  stage_id?: string;
  stage_nombre?: string;
}
export interface ReglaEtapaLead {
  id: string;
  condicion: string;
  acciones: AccionReglaEtapa[];
  fuentes: string[];             // ["llamadas","videollamadas","chats"] | ["todas"]
  excluye?: string[];
  // legacy simple (compat con datos previos)
  tag?: string;
  condition?: string;
}

// Coach de ventas de la etapa: guión con secciones (como el coach por canal),
// pero evaluado en conjunto sobre TODAS las interacciones del contacto (chats,
// llamadas y citas, unidas por contact_id). Decide pasó / no pasó por umbral.
export interface SeccionGuionEtapa {
  id: string;
  nombre: string;
  criterio: string;
  tipo: "must_have" | "deseable";
}
export interface CoachEtapaLead {
  secciones: SeccionGuionEtapa[];
  umbral?: number;              // % mínimo de cumplimiento para "pasó" (default 70)
  nota_cumplido?: string;       // instrucción a la IA para la nota cuando cumple
  nota_no_cumplido?: string;    // instrucción a la IA para la nota cuando no cumple
  tags_cumplido?: string[];     // etiquetas GHL a poner si pasó
  tags_no_cumplido?: string[];  // etiquetas GHL a poner si no pasó
}

export interface CategoriaLead {
  id: string;
  nombre: string;
  etiqueta: string;
  prompt: string;
  prompt_resumen?: string;
  reglas_etiquetas?: ReglaEtapaLead[];
  coach?: CoachEtapaLead;
}

// ─── Closer merge rules ───────────────────────────────────────────────────────

export interface CloserMergeRule {
  canonical_email: string;   // email canónico (the real one)
  canonical_nombre: string;  // nombre canónico normalizado
  aliases: Array<{
    email?: string;           // emails que deben mapearse a este canonical
    nombre?: string;          // nombres que deben mapearse a este canonical
  }>;
  created_at: string;        // ISO timestamp
}

/** Info comercial de la cuenta: qué se vendió, cuánto paga, comisiones */
export interface InfoComercial {
  productos?: string[];          // ["GHL", "Ads", "LeadMaster", ...]
  precio_mensual?: number;       // valor de la mensualidad
  moneda?: string;               // "USD" | "COP" | ...
  paga_comision?: boolean;       // si paga comisión por ventas
  comision_pct?: number;         // % de comisión
  notas?: string;                // notas libres
}

export const cuentas = pgTable("cuentas", {
  id_cuenta: serial("id_cuenta").primaryKey(),
  nombre_cuenta: varchar("nombre_cuenta"),
  subdominio: text("subdominio").unique().notNull(),
  configuracion_ui: jsonb("configuracion_ui").$type<ConfiguracionUI>(),
  estado_cuenta: text("estado_cuenta"),
  zona_horaria_iana: text("zona_horaria_iana"),
  prompt_ventas: text("prompt_ventas"),
  prompt_videollamadas: text("prompt_videollamadas"),
  prompt_llamadas: text("prompt_llamadas"),
  reglas_etiquetas: jsonb("reglas_etiquetas").$type<ReglaEtiqueta[]>(),
  metricas_personalizadas: jsonb("metricas_personalizadas").$type<MetricaPersonalizada[]>(),
  openai_api_key: text("openai_api_key"),
  embudo_personalizado: jsonb("embudo_personalizado").$type<EmbudoEtapa[]>(),
  chat_triggers: jsonb("chat_triggers").$type<ChatTrigger[]>(),
  tipos_eventos_config: jsonb("tipos_eventos_config").$type<TipoEventoConfig[]>(),
  roles_config: jsonb("roles_config").$type<RolConfig[]>(),
  metricas_config: jsonb("metricas_config").$type<MetricaConfig[]>(),
  metricas_manual_data: jsonb("metricas_manual_data").$type<Record<string, MetricaManualEntry[]>>(),
  dashboards_personalizados: jsonb("dashboards_personalizados").$type<DashboardPersonalizado[]>().default([]),
  fuente_llamadas: text("fuente_llamadas").default("twilio"),
  configuracion_ads: jsonb("configuracion_ads").$type<ConfiguracionAds>(),
  ghl_location_id: text("ghl_location_id"),
  locationid: text("locationid"),  // GHL location ID (campo real de la tabla)
  token_ghl: text("token_ghl"),    // Token de GHL de la cuenta (columna creada por el backend)
  info_comercial: jsonb("info_comercial").$type<InfoComercial>(),  // Qué se vendió, precio, comisión
  ghl_app_uninstalled_at: timestamp("ghl_app_uninstalled_at", { withTimezone: true }),
  // ── V8: reglas de deduplicación inteligente de closers ────────────────────
  closer_merge_rules: jsonb("closer_merge_rules").$type<CloserMergeRule[]>().default([]),
  razones_perdida_config: jsonb("razones_perdida_config").$type<RazonPerdidaOption[]>(),
  razones_perdida_data: jsonb("razones_perdida_data").$type<RazonPerdidaEntry[]>(),
  categorias_llamadas: jsonb("categorias_llamadas").$type<CategoriaLlamada[]>(),
  categorias_citas: jsonb("categorias_citas").$type<CategoriaCita[]>(),
  categorias_chats: jsonb("categorias_chats").$type<CategoriaChat[]>(),
  categorias_leads: jsonb("categorias_leads").$type<CategoriaLead[]>(),
  exclusiones_coach: jsonb("exclusiones_coach").$type<ExclusionesCoach>(),
  gemini_api_key: text("gemini_api_key"),
  gemini_premium_status: text("gemini_premium_status").$type<"active" | "paused_invalid_key" | "paused_quota_exceeded" | null>(),
});

/* ------------------------------------------------------------------ */
/*  usuarios_dashboard                                                */
/* ------------------------------------------------------------------ */

export const usuariosDashboard = pgTable("usuarios_dashboard", {
  id_evento: serial("id_evento").primaryKey(),
  id_cuenta: integer("id_cuenta").references(() => cuentas.id_cuenta),
  nombre: text("nombre"),
  email: text("email").unique().notNull(),
  pass: text("pass"),
  rol: text("rol").notNull(),
  permisos: jsonb("permisos").$type<Record<string, boolean>>(),
  fathom: text("fathom"),
  id_webhook_fathom: text("id_webhook_fathom"),
  nombre_closer: text("nombre_closer"),
  tipo_usuario: text("tipo_usuario").notNull().default("analista"),
  must_change_password: boolean("must_change_password").notNull().default(false),
  // Sync automático desde GHL (migración 061 del backend)
  ghl_user_id: text("ghl_user_id"),
  origen: text("origen").notNull().default("manual"),
  activo: boolean("activo").notNull().default(true),
  ghl_synced_at: timestamp("ghl_synced_at", { withTimezone: true }),
});

/* ------------------------------------------------------------------ */
/*  actividad_dashboard — páginas visitadas y clics por usuario       */
/* ------------------------------------------------------------------ */

export const actividadDashboard = pgTable("actividad_dashboard", {
  id: serial("id").primaryKey(),
  id_cuenta: integer("id_cuenta"),
  email: text("email").notNull(),
  tipo: text("tipo").notNull(), // 'page_view' | 'click'
  pagina: text("pagina"),
  detalle: text("detalle"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  login_codes — códigos de verificación para login sin contraseña   */
/* ------------------------------------------------------------------ */

export const loginCodes = pgTable("login_codes", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  code_hash: text("code_hash").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumed_at: timestamp("consumed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  resumenes_diarios_agendas — citas y videollamadas (Cerebro)       */
/* ------------------------------------------------------------------ */

export interface ObjecionIA {
  objecion: string;
  categoria: string;
  respuesta_vendedor?: string;
}

export const resumenesDiariosAgendas = pgTable("resumenes_diarios_agendas", {
  id_registro_agenda: serial("id_registro_agenda").primaryKey(),
  id_cuenta: integer("id_cuenta").notNull(),
  fecha: date("fecha").notNull(),
  nombre_de_lead: varchar("nombre_de_lead").notNull(),
  origen: varchar("origen"),
  email_lead: varchar("email_lead"),
  categoria: varchar("categoria"),
  closer: varchar("closer"),
  fecha_reunion: timestamp("fecha_reunion", { withTimezone: true }),
  idcliente: text("idcliente"),
  ghl_contact_id: text("ghl_contact_id"),
  tags: text("tags"),
  cash_collected: text("cash_collected"),
  facturacion: text("facturacion"),
  resumen_ia: text("resumen_ia"),
  link_llamada: text("link_llamada"),
  objeciones_ia: jsonb("objeciones_ia").$type<ObjecionIA[]>(),
  reportmarketing: text("reportmarketing"),
  tags_internos: jsonb("tags_internos").$type<string[]>(),
  transcripcion_fathom: text("transcripcion_fathom"),
  // AUT-270: re-ingesta Fathom — corrección de categoría
  fathom_reingest_at: timestamp("fathom_reingest_at", { withTimezone: true }),
  categoria_previa: varchar("categoria_previa"),
  // AUT-632: discriminador videollamada vs llamada telefónica
  fathom_recording_id: text("fathom_recording_id"),
  fathom_ingestion_source: text("fathom_ingestion_source"),
  // AUT-774: exclusión reversible de reuniones del dashboard de Videollamadas
  excluida_dashboard: boolean("excluida_dashboard").notNull().default(false),
});

/* ------------------------------------------------------------------ */
/*  log_llamadas — historial inmutable de eventos telefónicos         */
/* ------------------------------------------------------------------ */

export const logLlamadas = pgTable("log_llamadas", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  id_registro: integer("id_registro"),
  id_cuenta: integer("id_cuenta").notNull(),
  mail_lead: text("mail_lead"),
  id_user_ghl: text("id_user_ghl"),
  contact_id_ghl: text("contact_id_ghl"),
  nombre_lead: text("nombre_lead"),
  phone: text("phone"),
  tipo_evento: text("tipo_evento").notNull(),
  estado_resultado: text("estado_resultado"),
  call_sid: text("call_sid"),
  transcripcion: text("transcripcion"),
  ia_descripcion: text("ia_descripcion"),
  closer_mail: text("closer_mail"),
  nombre_closer: text("nombre_closer"),
  creativo_origen: text("creativo_origen"),
  speed_to_lead: text("speed_to_lead"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  tags_internos: jsonb("tags_internos").$type<string[]>(),
  gemini_enriquecimiento: jsonb("gemini_enriquecimiento"),
  duracion_segundos: integer("duracion_segundos"),
  ia_objeciones: jsonb("ia_objeciones").$type<ObjecionIA[]>(),
  resumen_llamada: jsonb("resumen_llamada").$type<ResumenLlamada>(),
});

export interface ResumenLlamada {
  interes_lead?: string;
  ubicacion: string;
  objetivo?: string;
  presupuesto: string;
  quien_decide: string;
  tiempo_compra?: string;
  desenlace: string;
}

/* ------------------------------------------------------------------ */
/*  registros_de_llamada — estado actual del lead en ciclo llamadas   */
/* ------------------------------------------------------------------ */

export const registrosDeLlamada = pgTable("registros_de_llamada", {
  id_registro: serial("id_registro").primaryKey(),
  fecha_evento: timestamp("fecha_evento", { withTimezone: true }).defaultNow(),
  id_cuenta: varchar("id_cuenta"),
  nombre_lead: varchar("nombre_lead"),
  estado: varchar("estado"),
  mail_lead: varchar("mail_lead"),
  phone_raw_format: varchar("phone_raw_format"),
  creativo_origen: varchar("creativo_origen"),
  closer_mail: varchar("closer_mail"),
  nombre_closer: varchar("nombre_closer"),
  fecha_y_hora_de_seguimiento: timestamp("fecha_y_hora_de_seguimiento", { withTimezone: true }),
  speed_to_lead: text("speed_to_lead"),
  intentos_contacto: integer("intentos_contacto").default(0),
  fecha_primera_llamada: timestamp("fecha_primera_llamada", { withTimezone: true }),
  trancription: text("trancription"),
  callsid: varchar("callsid"),
  iadescripcion: text("iadescripcion"),
  id_user_ghl: text("id_user_ghl"),
  ghl_contact_id: text("ghl_contact_id"),
  tags_internos: jsonb("tags_internos").$type<string[]>(),
});

/* ------------------------------------------------------------------ */
/*  chats_logs — conversaciones de chat (JSONB con mensajes)          */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  name: string;
  role: "lead" | "agent" | string;
  type: string;
  status: string;
  message: string;
  timestamp: string;
}

export const chatsLogs = pgTable("chats_logs", {
  id_evento: serial("id_evento").primaryKey(),
  fecha_y_hora_z: timestamp("fecha_y_hora_z", { withTimezone: true }).defaultNow(),
  id_cuenta: integer("id_cuenta"),
  nombre_lead: text("nombre_lead"),
  chat: jsonb("chat").$type<ChatMessage[]>(),
  estado: text("estado"),
  notas_extra: text("notas_extra"),
  id_lead: text("id_lead"),
  chatid: text("chatid"),
  origen: text("origen"),
  asesor_asignado: text("asesor_asignado"),
  tags_internos: jsonb("tags_internos").$type<string[]>(),
  // ── Timestamps calculados por Cerebro ─────────────────────────────────────
  primer_msg_lead_at: timestamp("primer_msg_lead_at", { withTimezone: true }),
  primer_msg_at: timestamp("primer_msg_at", { withTimezone: true }),
  // ── IA nocturna ──────────────────────────────────────────────────────────
  ia_categoria: text("ia_categoria"),
  ia_analizado_at: timestamp("ia_analizado_at", { withTimezone: true }),
  ia_objeciones: jsonb("ia_objeciones").$type<ObjecionIA[]>(),
  excluida_dashboard: boolean("excluida_dashboard"),
});

/* ------------------------------------------------------------------ */
/*  metas_cuenta — metas persistentes multi-tenant                    */
/* ------------------------------------------------------------------ */

export interface MetaPorAsesor {
  email: string;
  meta_llamadas_diarias?: number;
  meta_cierres_semanales?: number;
  meta_revenue_mensual?: number;
}

export interface MetaPorRol {
  rol_id: string;
  rol_nombre: string;
  meta_llamadas_diarias?: number | null;
  meta_chats_diarios?: number | null;
  meta_cierres_semanales?: number | null;
  meta_contestacion?: number | null;
}

export const metasCuenta = pgTable("metas_cuenta", {
  id_meta: serial("id_meta").primaryKey(),
  id_cuenta: integer("id_cuenta").notNull().references(() => cuentas.id_cuenta),
  meta_llamadas_diarias: integer("meta_llamadas_diarias").notNull().default(50),
  leads_nuevos_dia_1: integer("leads_nuevos_dia_1").notNull().default(3),
  leads_nuevos_dia_2: integer("leads_nuevos_dia_2").notNull().default(4),
  leads_nuevos_dia_3: integer("leads_nuevos_dia_3").notNull().default(5),
  meta_citas_semanales: integer("meta_citas_semanales"),
  meta_cierres_semanales: integer("meta_cierres_semanales"),
  meta_revenue_mensual: numeric("meta_revenue_mensual", { precision: 12, scale: 2 }),
  meta_cash_collected_mensual: numeric("meta_cash_collected_mensual", { precision: 12, scale: 2 }),
  meta_tasa_cierre: numeric("meta_tasa_cierre", { precision: 5, scale: 4 }),
  meta_tasa_contestacion: numeric("meta_tasa_contestacion", { precision: 5, scale: 4 }),
  meta_speed_to_lead_min: numeric("meta_speed_to_lead_min", { precision: 8, scale: 2 }),
  // ── Nuevos campos por canal (2025) ─────────────────────────────
  meta_llamadas_semanales: integer("meta_llamadas_semanales"),
  meta_contestacion_llamadas: numeric("meta_contestacion_llamadas", { precision: 5, scale: 2 }),
  meta_speed_llamadas_min: numeric("meta_speed_llamadas_min", { precision: 8, scale: 2 }),
  meta_citas_semanales_video: integer("meta_citas_semanales_video"),
  meta_cierre_video: numeric("meta_cierre_video", { precision: 5, scale: 2 }),
  meta_revenue_video: numeric("meta_revenue_video", { precision: 12, scale: 2 }),
  meta_chats_diarios: integer("meta_chats_diarios"),
  meta_chats_contestacion: numeric("meta_chats_contestacion", { precision: 5, scale: 2 }),
  meta_speed_chat_min: numeric("meta_speed_chat_min", { precision: 8, scale: 2 }),
  // ── IA nocturna — hora del cron de análisis de chats (0-23) ─────────────
  chat_analisis_hora: integer("chat_analisis_hora").default(2),
  metas_por_asesor: jsonb("metas_por_asesor").$type<MetaPorAsesor[]>(),
  metas_por_rol: jsonb("metas_por_rol").$type<MetaPorRol[]>().default([]),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("metas_cuenta_id_cuenta_unique").on(table.id_cuenta),
]);

/* ------------------------------------------------------------------ */
/*  kpis_externos — datos financieros inyectados vía API externa       */
/* ------------------------------------------------------------------ */

export const kpisExternos = pgTable("kpis_externos", {
  id_registro: serial("id_registro").primaryKey(),
  id_cuenta: integer("id_cuenta").notNull().references(() => cuentas.id_cuenta),
  fecha: date("fecha").notNull(),
  origen: text("origen").default("api_externa"),
  metricas: jsonb("metricas").$type<Record<string, number>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  api_keys_cuenta — tokens de autenticación para webhooks externos   */
/* ------------------------------------------------------------------ */

export const apiKeysCuenta = pgTable("api_keys_cuenta", {
  id_key: serial("id_key").primaryKey(),
  id_cuenta: integer("id_cuenta").notNull().references(() => cuentas.id_cuenta),
  nombre_key: text("nombre_key").notNull(),
  token: text("token").unique().notNull(),
  activa: boolean("activa").default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  uso_api_mensual — tracking de consumo mensual por cuenta           */
/* ------------------------------------------------------------------ */

export const usoApiMensual = pgTable("uso_api_mensual", {
  id_uso: serial("id_uso").primaryKey(),
  id_cuenta: integer("id_cuenta").notNull().references(() => cuentas.id_cuenta),
  mes_anio: text("mes_anio").notNull(),
  tipo_consumo: text("tipo_consumo").notNull(),
  cantidad: integer("cantidad").default(0),
}, (table) => [
  uniqueIndex("uso_api_mensual_unique").on(table.id_cuenta, table.mes_anio, table.tipo_consumo),
]);

/* ------------------------------------------------------------------ */
/*  eventos_huerfanos — sala de espera de eventos fallidos             */
/* ------------------------------------------------------------------ */

export const eventosHuerfanos = pgTable("eventos_huerfanos", {
  id_huerfano: serial("id_huerfano").primaryKey(),
  id_cuenta: integer("id_cuenta").notNull().references(() => cuentas.id_cuenta, { onDelete: "cascade" }),
  origen: text("origen").notNull(),
  motivo: text("motivo").notNull(),
  payload_original: jsonb("payload_original").notNull(),
  estado: text("estado").default("pendiente"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_huerfanos_cuenta_estado").on(table.id_cuenta, table.estado),
]);

/* ------------------------------------------------------------------ */
/*  comisiones_config — configuración de comisiones por closer         */
/* ------------------------------------------------------------------ */

export interface TramoEscalada {
  meta_pct: number;      // % de meta a partir del cual aplica este tramo
  comision_pct: number;  // % de comisión para este tramo
}

export interface SocioSplit {
  email: string;
  nombre?: string;
  pct: number; // Porcentaje de la comisión que le corresponde a este socio
}

export const comisionesConfig = pgTable("comisiones_config", {
  id: serial("id").primaryKey(),
  id_cuenta: integer("id_cuenta").notNull().references(() => cuentas.id_cuenta, { onDelete: "cascade" }),
  closer_email: text("closer_email").notNull(),
  closer_nombre: text("closer_nombre"),
  tipo: text("tipo").notNull().default("porcentaje"), // 'porcentaje' | 'monto_fijo'
  valor: numeric("valor", { precision: 10, scale: 4 }).notNull().default("0"),
  aplica_sobre: text("aplica_sobre").default("cash_collected"), // 'cash_collected' | 'facturacion'
  activo: boolean("activo").default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  // Tipo de comisión: 'individual' | 'global' | 'equipo' | 'escalada'
  tipo_comision: text("tipo_comision").notNull().default("individual"),
  // Para tipo='equipo': array de emails de asesores bajo su cargo
  asesores_equipo: jsonb("asesores_equipo").$type<string[]>().default([]),
  // Para tipo='escalada': array de tramos {meta_pct, comision_pct}
  tramos_escalada: jsonb("tramos_escalada").$type<TramoEscalada[]>().default([]),
  // Campos extendidos
  subtipo: text("subtipo").default("estandar"), // 'estandar' | 'proyecto' | 'division'
  nombre_proyecto: text("nombre_proyecto"),
  pct_division: numeric("pct_division", { precision: 10, scale: 4 }).default("100"),
  forma_pago: text("forma_pago").default("transferencia"),
  socios_split: jsonb("socios_split").$type<SocioSplit[]>().default([]),
  notas: text("notas"),
}, (table) => [
  index("idx_comisiones_id_cuenta").on(table.id_cuenta),
]);

/* ------------------------------------------------------------------ */
/*  metricas_webhook — métricas enviadas vía webhook por los clientes  */
/* ------------------------------------------------------------------ */

export const metricasWebhook = pgTable("metricas_webhook", {
  id: serial("id").primaryKey(),
  id_cuenta: integer("id_cuenta").notNull().references(() => cuentas.id_cuenta, { onDelete: "cascade" }),
  fecha: date("fecha").notNull(),
  campo: text("campo").notNull(),
  valor: numeric("valor", { precision: 18, scale: 4 }).notNull().default("0"),
  /** ID del usuario GHL (closer) que generó este dato. null = no atribuido / cuenta global */
  ghl_user_id: text("ghl_user_id"),
  /** ID del contacto/cliente en GHL. null = no atribuido */
  ghl_customer_id: text("ghl_customer_id"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_metricas_webhook_cuenta_fecha").on(table.id_cuenta, table.fecha),
  // Unique solo en el aggregate global (sin user ni customer). Con user/customer se acumulan individualmente.
  uniqueIndex("uq_metricas_webhook").on(table.id_cuenta, table.fecha, table.campo),
]);

/* ------------------------------------------------------------------ */
/*  historial_acciones — audit trail de todas las acciones de usuario  */
/* ------------------------------------------------------------------ */

export const historialAcciones = pgTable("historial_acciones", {
  id_evento: serial("id_evento").primaryKey(),
  id_cuenta: integer("id_cuenta").notNull(),
  usuario_asociado: varchar("usuario_asociado", { length: 255 }),
  accion: varchar("accion", { length: 100 }).notNull(),
  detalles: jsonb("detalles").default({}),
  fecha_y_hora_evento: timestamp("fecha_y_hora_evento", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_historial_id_cuenta").on(table.id_cuenta),
  index("idx_historial_fecha").on(table.fecha_y_hora_evento),
]);

/* ------------------------------------------------------------------ */
/*  closer_merge_suggestions — sugerencias de deduplicación de closers */
/* ------------------------------------------------------------------ */

export interface CloserMergeAlias {
  email?: string;
  nombre: string;
  conteo: number;
}

export const closerMergeSuggestions = pgTable("closer_merge_suggestions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  id_cuenta: integer("id_cuenta").notNull().references(() => cuentas.id_cuenta, { onDelete: "cascade" }),
  aliases: jsonb("aliases").$type<CloserMergeAlias[]>().notNull(),
  canonical_email: text("canonical_email"),
  canonical_nombre: text("canonical_nombre").notNull(),
  status: text("status").notNull().default("pending"),
  resuelto_at: timestamp("resuelto_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_cms_cuenta_status").on(table.id_cuenta, table.status),
]);

/* ------------------------------------------------------------------ */
/*  Modo Enfoque — sesiones y resultados (Fase 1)                     */
/* ------------------------------------------------------------------ */

export type ResultadoCanonicoEnfoque =
  | "contesto"
  | "no_contesto"
  | "buzon"
  | "seguimiento"
  | "interesado"
  | "programado"
  | "calificada"
  | "no_calificada"
  | "cerrada"
  | "no_interesado";

export type OrdenEnfoque = "mas_antiguo" | "menos_intentos";

export const sesionesEnfoque = pgTable("sesiones_enfoque", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  id_cuenta: integer("id_cuenta").notNull().references(() => cuentas.id_cuenta, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  modo: text("modo").notNull().default("llamada"),
  filtro_estado: jsonb("filtro_estado").$type<string[]>(),
  filtro_asesores: jsonb("filtro_asesores").$type<string[]>(),
  orden: text("orden").$type<OrdenEnfoque>().notNull().default("mas_antiguo"),
  lock_expiracion_min: integer("lock_expiracion_min").notNull().default(15),
  poll_intervalo_seg: integer("poll_intervalo_seg").notNull().default(4),
  activa: boolean("activa").notNull().default(true),
  created_by: text("created_by").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  max_intentos: integer("max_intentos").notNull().default(3),
  retry_intervalo_min: integer("retry_intervalo_min").notNull().default(30),
  retry_estados: jsonb("retry_estados").$type<string[]>().notNull().$default(() => ["no_contesto", "buzon"]),
  accion_agotado: text("accion_agotado").notNull().default("seguimiento"),
  expiry_streak_max: integer("expiry_streak_max").notNull().default(5),
}, (table) => [
  index("idx_sesiones_enfoque_cuenta").on(table.id_cuenta),
]);

export const enfoqueLock = pgTable("enfoque_lock", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  id_sesion: text("id_sesion").notNull().references(() => sesionesEnfoque.id, { onDelete: "cascade" }),
  id_cuenta: integer("id_cuenta").notNull().references(() => cuentas.id_cuenta, { onDelete: "cascade" }),
  id_registro: integer("id_registro").notNull().references(() => registrosDeLlamada.id_registro),
  en_progreso_por: text("en_progreso_por").notNull(),
  lock_ts: timestamp("lock_ts", { withTimezone: true }).notNull().defaultNow(),
  dial_ts: timestamp("dial_ts", { withTimezone: true }),
  call_sid: text("call_sid"),
  snapshot_canonico: text("snapshot_canonico"),
}, (table) => [
  uniqueIndex("uq_enfoque_lock_sesion_registro").on(table.id_sesion, table.id_registro),
  index("idx_enfoque_lock_sesion_closer").on(table.id_sesion, table.en_progreso_por),
]);

export const enfoqueResultado = pgTable("enfoque_resultado", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  id_sesion: text("id_sesion").notNull().references(() => sesionesEnfoque.id, { onDelete: "cascade" }),
  id_cuenta: integer("id_cuenta").notNull().references(() => cuentas.id_cuenta, { onDelete: "cascade" }),
  closer_mail: text("closer_mail").notNull(),
  id_registro: integer("id_registro").notNull().references(() => registrosDeLlamada.id_registro),
  resultado_canonico: text("resultado_canonico").$type<ResultadoCanonicoEnfoque>().notNull(),
  nota: text("nota"),
  duracion_seg: integer("duracion_seg"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  attempt_no: integer("attempt_no"),
  detectado_por: text("detectado_por"),
}, (table) => [
  index("idx_enfoque_resultado_sesion").on(table.id_sesion),
  index("idx_enfoque_resultado_cuenta").on(table.id_cuenta),
]);

export const eventosLlamadasTiempoReal = pgTable("eventos_llamadas_tiempo_real", {
  id_evento: bigint("id_evento", { mode: "number" }).primaryKey(),
  id_cuenta: integer("id_cuenta"),
  fecha_hora_evento: timestamp("fecha_hora_evento", { withTimezone: true }),
  closer: varchar("closer"),
  correo_closer: varchar("correo_closer"),
  objeciones_ia: jsonb("objeciones_ia").$type<ObjecionIA[]>(),
});

/* ------------------------------------------------------------------ */
/*  accesos_dashboard — registro de logins al dashboard (AUT-1818)     */
/* ------------------------------------------------------------------ */

export const accesosDashboard = pgTable("accesos_dashboard", {
  id: serial("id").primaryKey(),
  id_cuenta: integer("id_cuenta"),
  email: text("email").notNull(),
  nombre: text("nombre"),
  ip: text("ip"),
  user_agent: text("user_agent"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_accesos_dashboard_cuenta").on(table.id_cuenta),
  index("idx_accesos_dashboard_created").on(table.created_at),
]);

export const enfoqueAdminAudit = pgTable("enfoque_admin_audit", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  id_cuenta: integer("id_cuenta"),
  id_sesion: text("id_sesion"),
  actor_email: text("actor_email"),
  accion: text("accion"),
  target_email: text("target_email"),
  id_registro: integer("id_registro"),
  detalle: jsonb("detalle"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});
