// LeadMaster - Data Model V2 (GHL-ready, Marca Blanca)

export type AdvisorRole = 'closer' | 'setter' | 'admin' | 'gerente' | 'director_comercial';

export interface Advisor {
  id: string;
  name: string;
  team: string;
  role: AdvisorRole;
  avatar?: string;
}

export type LeadStatus =
  | 'nuevo'
  | 'contactado'
  | 'interesado'
  | 'no_interesado'
  | 'agendado'
  | 'asistio'
  | 'cerrado'
  | 'pdte'
  | 'en_seguimiento';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: LeadStatus;
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ad_name?: string;
  createdAt: string; // ISO
  assignedAdvisorId: string;
  lastContactAt?: string;
  notes?: string;
  tags: string[];
}

export interface CallPhone {
  id: string;
  leadId: string;
  advisorId: string;
  datetime: string;
  duration: number; // seconds
  outcome: 'answered' | 'no_answer' | 'busy' | 'completed';
  attemptsCountForLead: number;
  firstContactAt?: string;
  speedToLeadSeconds?: number;
  recordingUrl?: string;
  notes?: string;
  tags: string[];
  summary?: string;
  objections?: string[];
}

export interface VideoMeeting {
  id: string;
  leadId: string;
  advisorId: string;
  datetime: string;
  attended: boolean;
  qualified: boolean;
  booked: boolean;
  canceled: boolean;
  outcome?: string;
  amountBought?: number;
  amountPaid?: number;
  cashCollected?: number;
  ticket?: number;
  notes?: string;           // Análisis IA (resumenIa)
  transcript?: string;      // Transcripción real de Fathom
  tags: string[];
  source?: string;
  utm_source?: string;
  utm_campaign?: string;
  ad_name?: string;
  objections?: string[];
  /** Por cada objeción, la cita exacta de lo que dijo el lead (IA/transcripción). */
  objectionDetails?: { category: string; quote: string }[];
  /** URL de la grabación de la videollamada (ej. Fathom, Zoom). */
  recordingUrl?: string;
}

export type EmojiStatus = '👍' | '👎' | '💡' | '💰' | '⏳' | '💬' | '☀️';

export interface ChatEvent {
  id: string;
  leadId: string;
  advisorId: string;
  datetime: string;
  assigned: boolean;
  contacted: boolean;
  emojiStatus?: EmojiStatus;
  qualified: boolean;
  interested: boolean;
  bought: boolean;
  notes?: string;
  tags: string[];
  speedToLeadSeconds?: number;
  messageCount?: number;
}

export interface MetricsAggregate {
  period: 'day' | 'week' | 'month';
  dateFrom: string;
  dateTo: string;
  advisorId?: string;
  totalLeads: number;
  callsMade: number;
  meetingsBooked: number;
  meetingsAttended: number;
  meetingsCanceled: number;
  effectiveAppointments: number;
  revenue: number;
  cashCollected: number;
  avgTicket: number;
  ROAS?: number;
  speedToLeadAvg: number;
  avgAttempts: number;
  attemptsToFirstContactAvg: number;
  contactRate: number;
  bookingRate: number;
  attendanceRate: number;
  answerRate: number;
}

export interface ByChannelStats {
  llamadas: {
    leads: number;
    contactRate: number;
    bookingRate: number;
    closingRate: number;
  };
  videollamadas: {
    leads: number;
    attendanceRate: number;
    closingRate: number;
    revenue: number;
  };
  chats: {
    leads: number;
    conRespuesta: number;
    tasaRespuesta: number;
    topOrigen: string | null;
  };
}

export interface AcquisitionResponse {
  rows: AcquisitionRow[];
  sources: string[];
  byChannel: ByChannelStats;
}

export interface AcquisitionRow {
  id: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ad_name?: string;
  medium?: string;
  leads: number;
  called: number; // leads a los que se les llamó
  answered: number;
  booked: number;
  attended: number;
  closed?: number; // reuniones cerradas (venta)
  revenue: number;
  contactRate: number;
  bookingRate: number;
  attendanceRate: number;
  closingRate?: number; // tasa de cierre = closed / attended
}

export interface TagRule {
  id: string;
  name: string;
  condition: string; // e.g. "amountPaid > 5000000"
  tag: string;
  source: 'call' | 'chat' | 'meeting';
}

export interface CustomMetricRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  increment: number;
  source: 'call' | 'chat' | 'meeting';
  whenMeasured?: string;
  isRecurring?: 'recurrente' | 'unica';
  section?: string;
  panel?: string;
}

/* ================================================================== */
/*  API response types — datos reales de PostgreSQL                   */
/* ================================================================== */

export interface ApiAdvisor {
  id: string;
  name: string;
  email?: string;
}

export interface ApiVideollamada {
  id: number;
  datetime: string;
  leadName: string;
  /** Clave canónica del asesor (email lowercase o nombre lowercase) — misma que advisorMetrics usa como key */
  closerCanonicalKey: string | null;
  leadEmail: string | null;
  /** IDs en GHL / CRM — útiles para búsqueda */
  idcliente: string | null;
  ghl_contact_id: string | null;
  closer: string | null;
  categoria: string | null;
  attended: boolean;
  qualified: boolean;
  canceled: boolean;
  outcome: string;
  facturacion: number;
  cashCollected: number;
  resumenIa: string | null;
  transcripcionFathom: string | null;
  linkLlamada: string | null;
  objeciones: { objecion: string; categoria: string }[];
  reportmarketing: string | null;
  origen: string | null;
  tags: string | null;
  /** AUT-270: timestamp de la última re-ingesta de Fathom que cambió la categoría (null si no hubo) */
  fathomReingestAt: string | null;
  /** AUT-270: categoría anterior antes de la corrección de Fathom */
  categoriaPrevia: string | null;
  excludedFromDashboard: boolean;
}

export interface VideollamadasAdvisorMetrics {
  advisorName: string;
  agendadas: number;
  asistencias: number;
  cerradas: number;
  pctCierre: number;
  facturacion: number;
  cashCollected: number;
}

export interface MetricaComputada {
  id: string;
  nombre: string;
  valor: string | number;
  descripcion?: string | null;
  ubicacion?: string;
}

export interface VideollamadasResponse {
  registros: ApiVideollamada[];
  agg: {
    agendadas: number;
    asistidas: number;
    canceladas: number;
    efectivas: number;
    cerradas: number;
    noShows: number;
    revenue: number;
    cashCollected: number;
    ticket: number;
  };
  advisorMetrics: Record<string, VideollamadasAdvisorMetrics>;
  advisors: ApiAdvisor[];
  metricasComputadas?: MetricaComputada[];
}

export interface LlamadaEnrichment {
  tono_lead: string | null;
  engagement: string | null;
  recepcion_lead: string | null;
  calidad_cierre: string | null;
  aceptacion_propuesta: string | null;
  razon_calificacion: string | null;
  frases_relevantes: string[];
}

export interface ApiLlamadaLog {
  id: number;
  /** Enlace a registros_de_llamada; prioridad para asociar historial al lead correcto */
  id_registro: number | null;
  datetime: string;
  leadName: string | null;
  leadEmail: string | null;
  phone: string | null;
  closerMail: string | null;
  closerName: string | null;
  tipoEvento: string;
  outcome: 'answered' | 'no_answer' | 'voicemail' | 'pending';
  transcripcion: string | null;
  iaDescripcion: string | null;
  speedToLeadMinutes: number | null;
  creativoOrigen: string | null;
  estadoResultado: string | null;
  duracionSegundos: number | null;
  enrichment: LlamadaEnrichment | null;
  objeciones: { objecion: string; frase_textual: string | null }[] | null;
  resumenLlamada: ResumenLlamada | null;
}

export interface ResumenLlamada {
  interes_lead?: string;
  ubicacion: string;
  objetivo?: string;
  presupuesto: string;
  quien_decide: string;
  tiempo_compra?: string;
  desenlace: string;
}

export interface LlamadasAdvisorMetrics {
  advisorName: string;
  advisorEmail: string;
  llamadas: number;
  contestadas: number;
  pctContestacion: number;
  tiempoAlLead: number | null;
  /** Número de leads (registros_de_llamada) asignados a este closer en el rango */
  leadsAsignados: number;
  agendas: number;
  asistencia: number;
}

/** Lead desde registros_de_llamada (una fila por persona en Performance > Llamadas) */
export interface LlamadaLead {
  id_registro: number;
  nombre_lead: string | null;
  mail_lead: string | null;
  estado: string | null;
  phone: string | null;
  speed_to_lead_min: number | null;
  closer_mail: string | null;
  fecha_evento: string | null;
  id_user_ghl: string | null;
}

export interface LlamadasResponse {
  registros: ApiLlamadaLog[];
  /** Leads desde registros_de_llamada (mismo rango y asesor); el listado expandido muestra esto */
  leads: LlamadaLead[];
  /** Leads con estado PDTE (nunca llamados) cuya fecha_evento cae en el rango */
  pendingLeads: LlamadaLead[];
  agg: {
    totalLeads: number;
    totalCalls: number;
    answered: number;
    speedAvg: number;
    attemptsAvg: number;
    firstContactAttempts: number;
    answerRate: number;
    leadsNuevos: number;
    leadsReactivados: number;
    contestadasNuevos: number;
    contestadasReactivados: number;
    answerRateNuevos: number;
    answerRateReactivados: number;
  };
  advisorMetrics: Record<string, LlamadasAdvisorMetrics>;
  advisors: ApiAdvisor[];
  fuente_llamadas?: "twilio" | "ghl";
  embudoEtapas?: { id: string; nombre: string }[];
  /** Tipos de llamada configurados — alimentan el selector de filtro en UI */
  tipos_eventos_config?: { id: string; nombre: string; activo: boolean }[];
}

export interface ApiChatMessage {
  name: string;
  role: string;
  type: string;
  message: string;
  timestamp: string;
}

export interface ApiChatLead {
  id: number;
  leadName: string | null;
  leadId: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  agentName: string | null;
  asesorAsignado: string | null;
  datetime: string;
  totalMessages: number;
  agentMessages: number;
  leadMessages: number;
  speedToLeadSeconds: number | null;
  estado: string | null;
  notasExtra: string | null;
  messages: ApiChatMessage[];
  tagsInternos?: string[];
  triggerAplicado?: string;
  /** Minutos transcurridos desde el último mensaje del lead sin respuesta del agente.
   *  null si el agente ya respondió después del último mensaje del lead, o si no hay mensajes del lead. */
  minutesSinceLastLeadMsg: number | null;
  /**
   * true si un humano realmente atendió el chat.
   * - Con chatbot (emojiTomaAtencion configurado): solo true si el emoji de toma de atención
   *   apareció en un mensaje del agente (un humano tomó el control).
   * - Sin chatbot: true si hay al menos un mensaje de role="agent".
   */
  humanTookOver: boolean;
  /** Categoría de interés detectada por la IA nocturna (ej: "precio", "producto", "soporte"). */
  iaCategoria?: string | null;
  /** Objeciones detectadas por la IA nocturna en la conversación. */
  iaObjeciones?: Array<{ objecion: string; categoria: string }> | null;
  /**
   * true si el chat cumple los criterios de calificación configurados por la cuenta.
   * Se computa en el cliente comparando iaCategoria contra los criterios configurados.
   * null = criterios no configurados (backward compat: todos califican).
   */
  esCalificado?: boolean | null;
}

export interface ChatsAdvisorMetrics {
  advisorName: string;
  asignados: number;
  activos: number;
  seguimientos: number;
  speedToLead: number | null;
}

export interface ChatsResponse {
  chats: ApiChatLead[];
  agg: {
    assigned: number;
    activos: number;
    seguimientosTotal: number;
    speedAvg: number | null;
  };
  advisorMetrics: Record<string, ChatsAdvisorMetrics>;
  advisors: ApiAdvisor[];
  /** Métricas custom tipo "chat" calculadas para el rango. Key = metrica id, Value = valor agregado. */
  metricasCustom?: Record<string, number | null>;
  /** Config de las métricas tipo "chat" para renderizar nombres y formatos en el frontend. */
  metricasChatConfig?: Array<{ id: string; nombre: string; formato?: string; color?: string; descripcion?: string | null }>;
  /** true si el cliente desinstalaron la app de GHL — los chats no están llegando. */
  ghl_app_desconectada?: boolean;
}

export interface DashboardKpis {
  totalLeads: number;
  callsMade: number;
  contestadas: number;
  answerRate: number;
  meetingsBooked: number;
  meetingsAttended: number;
  meetingsCanceled: number;
  meetingsClosed: number;
  effectiveAppointments: number;
  tasaCierre: number;
  tasaAgendamiento: number;
  revenue: number;
  cashCollected: number;
  avgTicket: number;
  speedToLeadAvg: number;
  avgAttempts: number;
  attemptsToFirstContactAvg: number;
  noShows: number;
  pendientesAgendas?: number;
  callsNuevos: number;
  callsReactivados: number;
  contestadasNuevos: number;
  contestadasReactivados: number;
  answerRateNuevos: number;
  answerRateReactivados: number;
}

export interface SubMetric {
  label: string;
  value: number;
  formato?: string;
}

export interface LeadDetailItem {
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  ultimaActividad: string | null;
}

export interface AdvisorFilteredMetrics {
  totalLeads: number;
  callsMade: number;
  contestadas: number;
  speedToLeadAvg: number | null;
  speedToLeadLaboral: number | null;
  meetingsBooked: number;
  meetingsAttended: number;
  ventas: number;
  revenue: number;
  cashCollected: number;
  dineroEntrante: number;
  contactRate: number;
  bookingRate: number;
  tasaContestacion: number;
  tasaAsistencia: number;
  tasaCierre: number;
}

export interface DashboardAdvisorRow {
  advisorName: string;
  advisorEmail: string | null;
  totalLeads: number;
  leadsGenerados: number;
  leadsConActividad: number;
  leadsReactivados: number;
  leadsGeneradosDetalle: LeadDetailItem[];
  leadsConActividadDetalle: LeadDetailItem[];
  leadsReactivadosDetalle: LeadDetailItem[];
  callsMade: number;
  contestadas: number;
  speedToLeadAvg: number | null;
  speedToLeadLaboral: number | null;
  meetingsBooked: number;
  meetingsAttended: number;
  ventas: number;
  revenue: number;
  cashCollected: number;
  dineroEntrante: number;
  contactRate: number;
  bookingRate: number;
  tasaContestacion: number;
  tasaAsistencia: number;
  tasaCierre: number;
  metricasWebhook?: Record<string, number>;
  metricsNuevos?: AdvisorFilteredMetrics;
  metricsReactivados?: AdvisorFilteredMetrics;
}

export interface DashboardVolumeDay {
  date: string;
  llamadas: number;
  citasPresentaciones: number;
  cierres: number;
}

export interface DashboardObjecion {
  name: string;
  count: number;
  percent: number;
  tipos: number;
}

export interface DashboardObjecionDetail {
  leadName: string;
  advisorName: string;
  datetime: string;
  quote: string;
  contexto?: string;
  respuestaVendedor?: string;
}

export type ObjecionCanal = 'videollamada' | 'chat' | 'llamada';

export interface DashboardObjecionConDetalle extends DashboardObjecion {
  details: DashboardObjecionDetail[];
}

export interface DashboardObjecionesPorCanal {
  canal: ObjecionCanal;
  label: string;
  objeciones: DashboardObjecionConDetalle[];
}

export interface DashboardRazonPerdida {
  id: string;
  name: string;
  count: number;
  percent: number;
  color?: string;
}

export interface EmbudoEtapaUI {
  id: string;
  nombre: string;
  color?: string;
  orden: number;
  condition?: string;
}

export interface MetricaPersonalizadaUI {
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

export interface ChatKpis {
  total: number;
  leadsUnicos: number;
  conRespuesta: number;
  tasaRespuesta: number;
  speedToLeadAvg: number | null; // segundos
  speedToLeadMedian: number | null; // segundos
  speedToLeadCount: number;
  mensajesPromedioPorLead: number | null;
  distribucionCanales: Record<string, number>;
  topClosers: Array<{ name: string; count: number }>;
}

export interface MetaDiariaHistorial {
  fecha: string; // "YYYY-MM-DD"
  actual: number;
  meta: number;
  cumple: boolean;
}

export interface AlertaMeta {
  label: string;
  actual: number;
  meta: number;
  cumple: boolean;
  pct: number; // % de cumplimiento
  unidad?: string; // e.g. "llamadas", "%", "min", "$"
  canal: "llamadas" | "videollamadas" | "chats" | "general";
  invertido?: boolean; // true = menos es mejor (ej. speed to lead)
  sinDatos?: boolean; // true = hay meta pero actual = 0
  historialDiario?: MetaDiariaHistorial[]; // días del rango con cumplimiento
}

export type SegmentoCanal = "llamada" | "chat" | "videollamada";

export interface SegmentoCalificadoCanal {
  canal: SegmentoCanal;
  calificado: number;
  noCalificado: number;
  calificadoAgendo: number;
  calificadoNoAgendo: number;
  noCalificadoAgendo: number;
  noCalificadoNoAgendo: number;
}

export interface LeadSegmentoItem {
  nombre: string | null;
  telefono: string | null;
  ghl_contact_id: string | null;
  canal: SegmentoCanal;
  calificado: boolean;
  agendo: boolean;
}

export interface DashboardAdsSummary {
  hasAds: boolean;
  gastoTotal: number;
  impresiones: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  playRate?: number;      // Vturb: avg play rate % across active days
  engagementRate?: number; // Vturb: avg engagement % across active days
  camposExtra: Record<string, number>; // frequency, unique_ctr, etc.
  plataformas: string[];
}

export interface DashboardResponse {
  kpis: DashboardKpis;
  advisorRanking: DashboardAdvisorRow[];
  volumeByDay: DashboardVolumeDay[];
  objeciones: DashboardObjecion[];
  objecionesPorCanal?: DashboardObjecionesPorCanal[];
  razonesPerdida?: DashboardRazonPerdida[];
  advisors: ApiAdvisor[];
  fuenteDatosFinancieros: "nativa" | "api_externa";
  embudoPersonalizado?: EmbudoEtapaUI[];
  distribucionEmbudo?: Record<string, number>;
  tagsDisponibles?: string[];
  tagCounts?: Record<string, number>;
  metricasPersonalizadas?: MetricaPersonalizadaUI[];
  metricasComputadas?: { id: string; nombre: string; valor: string | number; descripcion?: string | null; ubicacion?: string; paneles?: string[]; formato?: string; color?: string; visualizacion?: "kpi_card" | "barra" | "comparativo"; seriesTiempo?: { fecha: string; valor: number }[]; subMetrics?: SubMetric[] }[];
  dashboardsPersonalizados?: { id: string; nombre: string; icono?: string | null }[];
  chatKpis?: ChatKpis;
  alertasMetas?: AlertaMeta[];
  adsSummary?: DashboardAdsSummary;
  segmentacionCalificadoCanal?: SegmentoCalificadoCanal[];
  configuracion_ui?: {
    modulos_activos?: {
      seccion_chats_dashboard?: boolean;
      [key: string]: boolean | undefined;
    };
    ranking_columnas?: string[];
    [key: string]: unknown;
  };
  fuente_llamadas?: "twilio" | "ghl";
}

// ── Canal: Llamadas ───────────────────────────────────────────────────────────

export interface AsesorLeadCRM {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ghlContactId: string | null;
  estado: string | null;
  /** Estado normalizado para agrupar en columnas del pipeline */
  estadoNormalizado: 'pendiente' | 'no_contesto' | 'buzon' | 'seguimiento' | 'interesado' | 'programado' | 'calificada' | 'no_calificada' | 'cerrada' | 'no_interesado' | 'otro';
  intentosContacto: number;
  speedToLead: string;
  // Cada llamada individual del lead con su resultado (para filtrar en el detalle).
  notasLlamadas: { date: string; text: string; estado?: string; categoria?: string }[];
  leadNote: string | null;
  excluido: boolean;
}

// ── Canal: Videollamadas ──────────────────────────────────────────────────────

export interface AsesorVideollamada {
  id: number;
  leadName: string | null;
  leadEmail: string | null;
  ghlContactId: string | null;
  categoria: string;           // el id de la etapa del embudo (calificada, cerrada, etc.)
  fechaReunion: string | null;
  facturacion: number;
  cashCollected: number;
  fathomUrl: string | null;
  resumenIa: string | null;
}

// ── Canal: Chats ──────────────────────────────────────────────────────────────

export interface AsesorChatMessage {
  role: string;
  timestamp: string;
  message: string;
}

export interface AsesorChat {
  chatId: string;
  leadName: string | null;
  leadEmail: string | null;
  asesorName: string | null;
  estado: string | null;
  fechaUltimoMensaje: string;
  respondido: boolean;
  speedToLeadSeg: number | null;
  messages: AsesorChatMessage[];
}

// ── Canal: Métricas personalizadas atribuibles ────────────────────────────────

export interface AsesorMetricaCustom {
  id: string;
  nombre: string;
  valor: number;
  formato: string;
  color: string;
}

// ── KPIs por canal ────────────────────────────────────────────────────────────

export interface AsesorKpis {
  // Llamadas
  leadsAsignados: number;
  llamadasRealizadas: number;
  llamadasContestadas: number;
  tasaContacto: number;
  // Videollamadas
  reunionesAgendadas: number;
  reunionesAsistidas: number;
  reunionesCalificadas: number;
  reunionesCerradas: number;
  reunionesNoShow: number;
  reunionesCanceladas: number;
  tasaAgendamiento: number;
  // Chats
  totalChats: number;
  chatsConRespuesta: number;
  tasaRespuestaChats: number;
  speedToLeadChatsAvg: number | null; // segundos
}

// ── Canales activos del tenant (para mostrar/ocultar tabs) ────────────────────

export interface AsesorCanales {
  llamadas: boolean;
  videollamadas: boolean;
  chats: boolean;
  metricasCustom: boolean;
}

/** Desglose por canal/origen para KPIs del panel asesor */
export interface AsesorBreakdown {
  leadsAsignados: {
    desdeLlamadas: number;
    desdeAgendas: number;
    desdeRegistros: number;
    soloLlamadas: number;
    soloAgendas: number;
    soloRegistros: number;
    enAmbos: number;
  };
  llamadasRealizadas: {
    total: number;
    porTipo: Record<string, number>;
  };
  llamadasContestadas: { total: number };
  reunionesAgendadas: { total: number };
}

export interface AsesorResponse {
  kpis: AsesorKpis;
  // Pipeline de llamadas (registros_de_llamada normalizados)
  leads: AsesorLeadCRM[];
  // Pipeline de videollamadas (resumenes_diarios_agendas)
  videollamadas: AsesorVideollamada[];
  // Pipeline de chats (chats_logs)
  chats: AsesorChat[];
  // Métricas custom atribuibles al asesor
  metricasCustom: AsesorMetricaCustom[];
  // Etapas del embudo de la cuenta para el pipeline de videollamadas
  embudoEtapas: { id: string; nombre: string; color: string; es_fija?: boolean }[];
  // Canales disponibles en la cuenta (basado en datos del asesor seleccionado)
  canales: AsesorCanales;
  // Módulos habilitados a nivel de tenant (no depende del asesor seleccionado)
  modulosHabilitados: AsesorCanales;
  advisors: ApiAdvisor[];
  advisorsList?: ApiAdvisor[];
  breakdown?: AsesorBreakdown;
  fuente_llamadas: "twilio" | "ghl";
  ghlLocationId: string | null;
}

// ── Vista unificada de leads (customer journey) ─────────────────────────────

export type JourneyStage = "solo_chat" | "chat_llamada" | "cita";

export interface UnifiedLeadChat {
  id: number;
  datetime: string;
  estado: string | null;
  asesor: string | null;
  totalMessages: number;
  leadMessages: number;
  agentMessages: number;
  speedToLeadSeconds: number | null;
  humanTookOver: boolean;
  iaCategoria: string | null;
  messages: ApiChatMessage[];
}

export interface UnifiedLeadCall {
  id: number;
  datetime: string;
  tipoEvento: string;
  outcome: string;
  closerName: string | null;
  closerMail: string | null;
  duracionSegundos: number | null;
  transcripcion: string | null;
  iaDescripcion: string | null;
  speedToLeadMinutes: number | null;
}

export interface UnifiedLeadAppointment {
  id: number;
  datetime: string;
  closer: string | null;
  categoria: string | null;
  attended: boolean;
  qualified: boolean;
  canceled: boolean;
  facturacion: number;
  cashCollected: number;
  resumenIa: string | null;
  linkLlamada: string | null;
}

export interface UnifiedLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ghlContactId: string | null;
  journeyStage: JourneyStage;
  lastActivity: string;
  advisor: string | null;
  chats: UnifiedLeadChat[];
  calls: UnifiedLeadCall[];
  appointments: UnifiedLeadAppointment[];
}

export interface UnifiedLeadsResponse {
  leads: UnifiedLead[];
  agg: {
    total: number;
    soloChat: number;
    chatLlamada: number;
    cita: number;
  };
  advisors: ApiAdvisor[];
}

export interface MapaTiemposAsesor {
  asesor: string;
  t1_mediana_seconds: number | null;
  t1_p90_seconds: number | null;
  t1_n: number;
  t2_mediana_seconds: number | null;
  t2_p90_seconds: number | null;
  t2_n: number;
  t3_mediana_seconds: number | null;
  t3_p90_seconds: number | null;
  t3_n: number;
  t4_mediana_seconds: number | null;
  t4_p90_seconds: number | null;
  t4_n: number;
  t5_mediana_seconds: number | null;
  t5_p90_seconds: number | null;
  t5_n: number;
}

export interface MapaTiemposLeadTimeline {
  id_registro: number;
  nombre_lead: string | null;
  asesor: string;
  t_llegada: string;
  t_llamada: string | null;
  t_agenda: string | null;
  t_asista: string | null;
  t_aparta: string | null;
  t_compra: string | null;
  t1_seconds: number | null;
  t2_seconds: number | null;
  t3_seconds: number | null;
  t4_seconds: number | null;
  t5_seconds: number | null;
}

export interface MapaTiemposStuckCounts {
  sin_llamar: number;
  sin_agendar: number;
  sin_asistir: number;
  sin_apartar: number;
  sin_comprar: number;
}

export interface MapaTiemposResponse {
  success: boolean;
  asesores: MapaTiemposAsesor[];
  lead_timeline: MapaTiemposLeadTimeline | null;
  total_leads: number;
  stuck: MapaTiemposStuckCounts;
}
