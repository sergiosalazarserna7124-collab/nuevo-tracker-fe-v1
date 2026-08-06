// LeadMaster — Report JSON v2 shared contract (AUT-1302 · Reporte v2 · WS2)
// -----------------------------------------------------------------------------
// Contrato de datos COMPARTIDO por los 3 workstreams del rediseño del reporte
// (plan: AUT-1298). Este archivo es la fuente de verdad del *shape* del JSON:
//   - WS1 (Cerebro, AUT-1301) llena las columnas IA/enriquecimiento que
//     alimentan los campos marcados `// [WS1]`.
//   - WS2 (esta capa, AUT-1302) agrega y produce este objeto en su totalidad.
//   - WS3 (Frontend, AUT-1303) renderiza contra este contrato (mock hasta que
//     WS1/WS2 aterricen).
//
// Reglas del contrato (del plan de Juan):
//   - Cada bloque de canal se OCULTA si el cliente no usa ese canal → los
//     campos `porCanal.*` y `conversaciones.*` son `| null`.
//   - Denominadores chicos exponen `n` para poder mostrar "n = X" en UI.
//   - Toda métrica de ubicación es *aproximada por lada* → se etiqueta.
//   - SIN talk-ratio y SIN DND (eliminados del reporte por decisión de Juan).
// -----------------------------------------------------------------------------

/** Canal de contacto. `video` = videollamadas (Fathom). */
export type ReportV2Canal = "llamadas" | "chats" | "video";

/** Valor + denominador para poder renderizar "n = X" en muestras chicas. */
export interface ReportV2Metric {
  valor: number;
  /** Tamaño de muestra que respalda el valor (para "n = X"). */
  n: number;
}

/** Item de una distribución (tono, motivo, objeción, etc.). */
export interface ReportV2Distribucion {
  label: string;
  count: number;
  pct: number; // 0-1 relativo al denominador de la sección
}

// ─── Meta / periodo / canales activos ────────────────────────────────────────

export interface ReportV2Periodo {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  type: "daily" | "weekly" | "monthly" | "custom";
  dias: number;
}

export interface ReportV2Meta {
  cuentaId: number;
  nombre: string | null;
  subdominio: string;
  periodo: ReportV2Periodo;
  periodoPrevio: ReportV2Periodo | null; // null si cliente <30 días (sin histórico)
  /**
   * Qué canales tiene datos el cliente en el periodo. WS3 usa esto para ocultar
   * páginas/bloques de canales ausentes (nunca mostrar ceros como datos).
   */
  canalesActivos: Record<ReportV2Canal, boolean>;
  /** true si el pase IA (WS1) aún no cubre el periodo → cualitativo parcial. */
  enriquecimientoParcial: boolean;
  hasGeminiKey: boolean;
  geminiPremiumStatus: "active" | "paused_invalid_key" | "paused_quota_exceeded" | null;
}

// ─── kpis ────────────────────────────────────────────────────────────────────

export interface ReportV2Kpis {
  leadsAnalizados: number;
  nuevos: number;
  reactivados: number;
  citasAgendadas: number;
  citasRealizadas: number;
  showRate: number; // 0-1
}

// ─── funnel ──────────────────────────────────────────────────────────────────

export interface ReportV2FunnelStage {
  id: string;
  label: string;
  count: number;
  pct: number; // 0-1 relativo a leadsAnalizados
}

export interface ReportV2Funnel {
  // analizados → conIntento → conversación → calificaron → citaAgendada →
  // citaRealizada → visita/propuesta
  stages: ReportV2FunnelStage[];
}

// ─── estadoFinal ─────────────────────────────────────────────────────────────

export interface ReportV2EstadoFinal {
  enConversacion: number;
  calificados: number;
  noCalificados: number;
  contactadosSinRespuesta: number;
  unSoloIntento: number;
  sinActividad: number;
}

// ─── origen ──────────────────────────────────────────────────────────────────

export interface ReportV2Origen {
  nuevos: number;
  reactivados: number;
  narrativaReactivacion: string | null; // [WS1] IA
}

// ─── higieneCRM ──────────────────────────────────────────────────────────────

export interface ReportV2HigieneLeadDetalle {
  nombre: string;
  asesor: string | null;
  diasSinActividad: number;
}

export interface ReportV2HigieneCRM {
  leadsSinActividadTotal: number;
  porAsesor: Array<{ asesor: string; count: number }>;
  detalle: ReportV2HigieneLeadDetalle[];
  diasUmbral: number;
}

// ─── porCanal ────────────────────────────────────────────────────────────────

export interface ReportV2CanalLlamadas {
  realizadas: number;
  leadsLlamados: number;
  contestaronPorLead: number; // leads que contestaron al menos 1 vez
  calificados: number;
  noCalificados: number;
  intentosProm: number;
  speedToLeadProm: number | null; // minutos; null si no hay dato
  duracionPromContestadas: number | null; // segundos [WS1 #3]; null si sin dato
  mejorFranja: string | null; // p.ej. "10:00–12:00"
}

export interface ReportV2CanalChats {
  conversaciones: number;
  mensajes: number;
  respondieron: number;
  tPrimeraRespuesta: number | null; // minutos
  conBot: number;
  escaladas: number;
}

export interface ReportV2CanalVideo {
  agendadas: number;
  realizadas: number;
  showRate: number; // 0-1
  calificados: number;
  noCalificados: number;
  reagendadas: number;
  noShow: number;
  duracionProm: number | null; // segundos [WS1 #3]
  avanzaron: number; // pasaron a visita/propuesta
}

export interface ReportV2PorCanal {
  llamadas: ReportV2CanalLlamadas | null; // null si canal ausente
  chats: ReportV2CanalChats | null;
  video: ReportV2CanalVideo | null;
}

// ─── demografia ──────────────────────────────────────────────────────────────

export interface ReportV2UbicacionItem {
  zona: string; // derivado de lada
  canal: ReportV2Canal; // etiquetar de qué canal salió
  aprox: true; // SIEMPRE aprox por lada
  count: number;
  pct: number; // 0-1 sobre leads con lada
}

export interface ReportV2Demografia {
  ubicacion: ReportV2UbicacionItem[]; // [WS1 #1] lada→zona
  ubicacionDenominador: number; // leads con dato de lada
  motivo: ReportV2Distribucion[]; // [WS1] IA
  perfil: ReportV2Distribucion[]; // [WS1] IA
  edadDominante: string | null; // [WS1] IA
  presupuestoProm: number | null; // [WS1] IA
  iaDenominador: number; // leads con dato IA
}

// ─── cobertura ───────────────────────────────────────────────────────────────

export interface ReportV2Cobertura {
  canalesPorLead: {
    llamadaYChat: number;
    soloLlamada: number;
    soloChat: number;
  };
  /** A qué # de intento contesta el lead (1/2/3/4+). */
  aQueIntentoContesta: ReportV2Distribucion[];
  /** Tasa de respuesta por franja horaria. */
  franjasHorarias: Array<{ franja: string; tasaRespuesta: number; total: number; asesores: Array<{ mail: string; total: number }> }>;
}

// ─── comparativo ─────────────────────────────────────────────────────────────

export interface ReportV2ComparativoRow {
  label: string;
  actual: number;
  anterior: number;
  variacionPct: number | null; // null si anterior = 0 / N/A
  tendencia: "sube" | "baja" | "igual";
  subirEsBueno: boolean;
  unidad: "pct" | "number" | "minutes";
}

export interface ReportV2Comparativo {
  // null completo si no hay periodo previo (cliente nuevo <30 días)
  filas: ReportV2ComparativoRow[];
}

// ─── conversaciones (cualitativo IA — [WS1]) ─────────────────────────────────

/** Bloque cualitativo por canal. SIN talk-ratio. Todo IA/Gemini (WS1). */
export interface ReportV2ConversacionCanal {
  totalAnalizadas: number; // denominador real (máx cobertura)
  recepcion: ReportV2Distribucion[]; // recepción/tono
  entendiaContexto: ReportV2Distribucion[];
  aceptacion: ReportV2Distribucion[];
  engagement: ReportV2Distribucion[];
  calidadCierre: ReportV2Distribucion[];
  narrativaAsesor: string | null; // "cómo abordó el asesor"
}

export interface ReportV2Conversaciones {
  llamadas: ReportV2ConversacionCanal | null;
  chats: ReportV2ConversacionCanal | null;
  video: ReportV2ConversacionCanal | null;
}

// ─── rankingAsesores ─────────────────────────────────────────────────────────

export interface ReportV2AsesorRow {
  nombre: string;
  leads: number;
  seguimiento: number;
  llamadas: number;
  contactoPct: number; // 0-1
  spdLead: number | null; // minutos
  intProm: number;
  dosMasIntPct: number; // 0-1 (2+ intentos)
  citas: number;
  asistieron: number;
  /** Score compuesto = volumen+contacto+velocidad+seguimiento+citas. 0-100. */
  score: number;
}

export interface ReportV2RankingAsesores {
  destacados: {
    mejor: string | null;
    masRapido: string | null;
    masSeguimiento: string | null;
    masLlamadas: string | null;
  };
  tabla: ReportV2AsesorRow[];
  alertas: string | null; // narrativa [WS1] IA
}

// ─── objeciones / frases / conclusiones ─────────────────────────────────────

export interface ReportV2Objecion {
  nombre: string;
  count: number;
  pct: number; // 0-1
  fraseTextual: string | null; // ejemplo textual
}

export interface ReportV2FraseRepetitiva {
  frase: string;
  leads: number;
  insight: string | null; // [WS1] IA
}

// ─── narrativa (ejecutiva — Gemini sobre agregados + muestra amplia) ─────────

export interface ReportV2Narrativa {
  resumenEjecutivo: string; // [WS2] Gemini sobre agregados
  alertasCriticas: string[];
}

// ─── Contrato raíz ───────────────────────────────────────────────────────────

export interface ReportV2 {
  meta: ReportV2Meta;
  kpis: ReportV2Kpis;
  funnel: ReportV2Funnel;
  estadoFinal: ReportV2EstadoFinal;
  origen: ReportV2Origen;
  higieneCRM: ReportV2HigieneCRM;
  porCanal: ReportV2PorCanal;
  demografia: ReportV2Demografia;
  cobertura: ReportV2Cobertura;
  comparativo: ReportV2Comparativo | null; // null = sin periodo previo
  conversaciones: ReportV2Conversaciones;
  rankingAsesores: ReportV2RankingAsesores;
  objeciones: ReportV2Objecion[];
  frasesRepetitivas: ReportV2FraseRepetitiva[];
  conclusiones: string[]; // [WS1/WS2] IA sobre todo el reporte
  narrativa: ReportV2Narrativa;
}
