// LeadMaster — Report v2 shared types (AUT-381 / AUT-387)
// All blocks are nullable: if the block has no data, the API returns null
// and the component renders nothing.

// ─── Bloque 0 — Resumen Ejecutivo ──────────────────────────────────────────

export interface ReportExecutiveSummaryData {
  texto: string; // AI-generated narrative
  alertasCriticas: string[]; // e.g. ["47% de leads sin contacto", "Speed-to-lead promedio 3.2h"]
  mejorAsesor: string | null;
  mejorAnuncio: string | null;
  totalLeads: number;
  contactados: number;
  sinContacto: number;
}

// ─── Bloque 1 — Rendimiento de Anuncios ────────────────────────────────────

export interface ReportAnuncio {
  nombre: string;
  gasto: number;
  leads: number;
  cpl: number; // costo por lead
  ctr: number | null;
}

export interface ReportAdsPerformanceData {
  plataformas: string[];
  gastoTotal: number;
  impresiones: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpl: number; // costo por lead total
  top3Anuncios: ReportAnuncio[];
  tendenciaGasto: Array<{ fecha: string; gasto: number }>; // daily trend
}

// ─── Bloque 2 — Asesores Llamadas ──────────────────────────────────────────

export interface ReportAsesorCalls {
  nombre: string;
  leads: number;
  llamadas: number;
  contestadas: number;
  tasaContacto: number; // 0-1
  agendadas: number;
  tasaAgendamiento: number; // 0-1
  speedToLeadAvgMin: number | null; // minutes, null if no data
  intentosPromedio: number;
  score: number; // 0-100 composite
}

export interface ReportAdvisorCallsData {
  asesores: ReportAsesorCalls[];
  speedToLeadUmbral: number; // recommended threshold in minutes (e.g., 15)
  totalLlamadas: number;
  totalContestadas: number;
  tasaContactoEquipo: number;
}

// ─── Bloque 3 — Asesores Chats ─────────────────────────────────────────────

export interface ReportAsesorChats {
  nombre: string;
  chats: number;
  leadsUnicos: number;
  tasaRespuesta: number; // 0-1
  speedToLeadAvgMin: number | null; // minutes, null if no data
  categorias: {
    cerrada: number;
    noCalificada: number;
    enSeguimiento: number;
    sinCategoria: number;
  };
}

export interface ReportAdvisorChatsData {
  asesores: ReportAsesorChats[];
  sinAsignar: { chats: number; categorias: ReportAsesorChats['categorias'] } | null;
  speedToLeadUmbral: number; // recommended threshold in minutes (e.g., 5)
  totalChats: number;
  tasaRespuestaEquipo: number;
  advertencia: string | null; // e.g., "Fill rate bajo en esta cuenta (20%)"
}

// ─── Bloque 4 — Asesores Videollamadas ─────────────────────────────────────

export interface ReportAsesorVideocalls {
  nombre: string;
  citas: number; // agendadas
  asistidas: number;
  noShows: number;
  cerradas: number;
  canceladas: number;
  tasaCierre: number; // cerradas / asistidas
  tasaNoShow: number; // noShows / citas
}

export interface ReportAdvisorVideocallsData {
  asesores: ReportAsesorVideocalls[];
  totalCitas: number;
  totalAsistidas: number;
  totalNoShows: number;
  totalCerradas: number;
  tasaCierreEquipo: number;
}

// ─── Bloque 5 — Funnel de Leads ────────────────────────────────────────────

export interface ReportFunnelStage {
  id: string;
  label: string;
  count: number;
  pct: number; // 0-1 relative to totalLeads
  color: 'cyan' | 'green' | 'amber' | 'red' | 'purple' | 'blue';
  sublabel?: string; // e.g., "no atendieron"
}

export interface ReportLeadFunnelData {
  totalLeads: number;
  stages: ReportFunnelStage[];
  analisis: string | null; // narrative paragraph
}

// ─── Bloque 5b — Funnel de Leads Árbol (LeadFunnelTree) ────────────────────

export interface ReportLeadFunnelTreeData {
  totalLeads: number;
  contactados: {
    count: number;
    pct: number; // 0-1 relative to totalLeads
    seguimientoActivo: number;
    agendasCita: number;
    noInteresados: number;
    noCalificados: number;
  };
  sinContacto: {
    count: number;
    pct: number; // 0-1 relative to totalLeads
    sinIntento: number;
    intentaronSinRespuesta: number;
    sinSeguimientoPostContacto: number;
  };
  presupuestoAdsDesperdiciadoPct: number | null; // 0-1; null if no ads data
  asesorMayorAbandono: { nombre: string; pct: number } | null;
}

// ─── Bloque 6 — Higiene CRM ────────────────────────────────────────────────

export interface ReportCrmHealthLeadDetalle {
  nombre: string;
  asesor: string | null;
  diasSinActividad: number;
}

export interface ReportCrmHealthData {
  puntajeHigiene: number; // 0-100
  leadsEnLimbo: number; // leads with last activity > 5 days
  leadsSinEstado: number;
  asignadosSinAccion: number; // assigned but 0 calls/chats
  asesorMasLimbo: { nombre: string; count: number } | null;
  diasLimboUmbral: number; // threshold used (e.g., 5)
  leadsSinAccionDetalle: ReportCrmHealthLeadDetalle[];
  leadsEnLimboDetalle: ReportCrmHealthLeadDetalle[];
}

// ─── Bloque 7 — Análisis de Conversaciones ─────────────────────────────────

export interface ReportObjecion {
  nombre: string;
  count: number;
  pct: number; // 0-1
}

export interface ReportHallazgo {
  tipo: 'positivo' | 'negativo' | 'neutro';
  texto: string;
}

export interface ReportConversationAnalysisData {
  totalAnalizadas: number; // transcriptions analyzed
  topObjeciones: ReportObjecion[];
  hallazgos: ReportHallazgo[];
  patronesFrecuentes: string[]; // e.g., ["Preguntan por precio antes de ver el producto"]
  alertas: string[]; // e.g., ["23% de llamadas terminan antes de 2 min"]
  fuentesDatos: string[]; // e.g., ["Llamadas (58% fill rate)", "Chats (100%)"]
}

// ─── Bloque 8 — Desglose por Canal de Contactabilidad ──────────────────────

export interface ReportCanalContactabilidad {
  canal: 'llamadas' | 'chats';
  total: number;
  contesto: number;
  noContesto: number;
  califico: number;
  noCalifco: number;
  tasaRespuesta: number; // 0-1
  tasaCalificacion: number; // 0-1 relative to canal total
}

export interface ReportContactabilidadCanalData {
  canales: ReportCanalContactabilidad[];
  totalGeneral: number;
  contestoGeneral: number;
  calificoGeneral: number;
  tasaRespuestaGlobal: number;
  tasaCalificacionGlobal: number;
}

// ─── Bloque 9 — Comparativo ────────────────────────────────────────────────

export interface ReportComparacionRow {
  label: string;
  actual: number | string;
  anterior: number | string;
  variacionPct: number | null; // null if anterior is 0 or N/A
  tendencia: 'sube' | 'baja' | 'igual';
  // Whether "sube" is good or bad (e.g., noShows ↑ is bad, revenue ↑ is good)
  subirEsBueno: boolean;
  unidad?: 'pct' | 'currency' | 'number' | 'minutes';
}

export interface ReportComparisonData {
  periodoActual: string; // e.g., "01/05 – 25/05"
  periodoAnterior: string; // e.g., "01/04 – 30/04"
  filas: ReportComparacionRow[];
}
