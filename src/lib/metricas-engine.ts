/**
 * Motor de métricas: calcula valores para manuales y automáticas.
 * KPIs por defecto disponibles para fórmulas automáticas.
 */

import type { MetricaConfig, MetricaManualEntry, EmbudoEtapa } from "@/lib/db/schema";

export const KPI_DEFAULT_KEYS = [
  "totalLeads",
  "callsMade",
  "contestadas",
  "answerRate",
  "meetingsBooked",
  "meetingsAttended",
  "meetingsCanceled",
  "meetingsClosed",
  "effectiveAppointments",
  "tasaCierre",
  "tasaAgendamiento",
  "revenue",
  "cashCollected",
  "avgTicket",
  "apartados",
  "montoApartado",
  "ventas",
  "montoVendido",
  "speedToLeadAvg",
  "speedToLeadAsesor",
  "avgAttempts",
  "agendadas",
  "asistidas",
  "canceladas",
  "efectivas",
  "noShows",
  "ticket",
  "pendientesLlamadas",
  "pendientesAgendas",
  "leadsDescartados",
  "leadsReactivados",
  "oportunidadesCreadas",
  "attemptsToFirstContactAvg",
  "callsNuevos",
  "callsReactivados",
  "contestadasNuevos",
  "contestadasReactivados",
  "answerRateNuevos",
  "answerRateReactivados",
] as const;

export type KpiDefaultKey = (typeof KPI_DEFAULT_KEYS)[number];

export const KPI_DEFAULT_LABELS: Record<string, string> = {
  totalLeads: "Leads generados",
  callsMade: "Llamadas",
  contestadas: "Contestadas",
  answerRate: "Tasa de contestación",
  meetingsBooked: "Citas agendadas",
  meetingsAttended: "Asistidas",
  meetingsCanceled: "Canceladas",
  meetingsClosed: "Cerradas",
  effectiveAppointments: "Efectivas",
  tasaCierre: "Tasa de cierre",
  tasaAgendamiento: "Tasa agendamiento",
  revenue: "Ingresos",
  cashCollected: "Efectivo cobrado",
  avgTicket: "Ticket promedio",
  apartados: "Apartados",
  montoApartado: "Monto apartado",
  ventas: "Ventas",
  montoVendido: "Monto vendido",
  speedToLeadAvg: "Tiempo al lead (min)",
  speedToLeadAsesor: "Speed to lead asesor (min)",
  avgAttempts: "Intentos promedio",
  agendadas: "Agendadas (citas)",
  asistidas: "Asistidas (citas)",
  canceladas: "Canceladas (citas)",
  efectivas: "Efectivas (citas)",
  noShows: "No shows",
  ticket: "Ticket (citas)",
  pendientesLlamadas: "Llamadas pendientes",
  pendientesAgendas: "Videollamadas pendientes",
  leadsDescartados: "Leads descartados",
  leadsReactivados: "Leads reactivados",
  oportunidadesCreadas: "Oportunidades creadas",
  attemptsToFirstContactAvg: "Intentos a primer contacto",
  callsNuevos: "Llamadas a nuevos",
  callsReactivados: "Llamadas a reactivados",
  contestadasNuevos: "Contestadas (nuevos)",
  contestadasReactivados: "Contestadas (reactivados)",
  answerRateNuevos: "Tasa contestación (nuevos)",
  answerRateReactivados: "Tasa contestación (reactivados)",
};

/** Métricas por defecto para un CEO / líder comercial. Se usan si metricas_config está vacío. */
export const DEFAULT_METRICAS_CONFIG: MetricaConfig[] = [
  // --- Bloque 1: Generación de leads y contacto ---
  { id: "default-leads", nombre: "Leads nuevos", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 0, formato: "numero", color: "blue", formula: { tipo: "directo", fuente: "totalLeads" }, descripcion: "Todo lead creado en el CRM dentro del período seleccionado." },
  { id: "default-reactivados", nombre: "Leads reactivados", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 1, formato: "numero", color: "cyan", formula: { tipo: "directo", fuente: "leadsReactivados" }, descripcion: "Leads creados ANTES del período pero con actividad dentro (chat, llamada o cita). Excluye descartados." },
  { id: "default-oportunidades", nombre: "Oportunidades creadas", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 2, formato: "numero", color: "purple", formula: { tipo: "directo", fuente: "oportunidadesCreadas" }, descripcion: "Oportunidades creadas en GHL dentro del período. Excluye leads descartados." },
  { id: "default-llamadas", nombre: "Llamadas realizadas", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 1, formato: "numero", color: "cyan", formula: { tipo: "directo", fuente: "callsMade" } },
  { id: "default-contestadas", nombre: "Contestadas", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 2, formato: "numero", color: "cyan", formula: { tipo: "directo", fuente: "contestadas" } },
  { id: "default-tasa-contestacion", nombre: "Tasa de contestación", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 3, formato: "porcentaje", color: "cyan", formula: { tipo: "directo", fuente: "answerRate" } },
  // --- Bloque 2: Velocidad y esfuerzo ---
  { id: "default-speed", nombre: "Speed to lead general", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 4, formato: "tiempo", color: "purple", formula: { tipo: "directo", fuente: "speedToLeadAvg" }, descripcion: "Minutos promedio desde que se creó el lead hasta la primera llamada (sin importar horario ni zona)." },
  { id: "default-speed-asesor", nombre: "Speed to lead asesor", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 5, formato: "tiempo", color: "cyan", formula: { tipo: "directo", fuente: "speedToLeadAsesor" }, descripcion: "Minutos promedio EN HORARIO LABORAL desde que se asignó el lead al asesor hasta la primera llamada." },
  { id: "default-intentos", nombre: "Intentos promedio", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 5, formato: "decimal", color: "amber", formula: { tipo: "directo", fuente: "avgAttempts" }, descripcion: "Llamadas promedio por lead" },
  // --- Bloque 3: Pipeline de citas ---
  { id: "default-agendadas", nombre: "Citas agendadas", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 6, formato: "numero", color: "purple", formula: { tipo: "directo", fuente: "meetingsBooked" } },
  { id: "default-asistidas", nombre: "Citas asistidas", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 7, formato: "numero", color: "green", formula: { tipo: "directo", fuente: "meetingsAttended" }, descripcion: "Leads que asistieron a la cita (con interacción real: grabación/transcript)" },
  { id: "default-tasa-agendamiento", nombre: "Tasa de agendamiento", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 8, formato: "porcentaje", color: "purple", formula: { tipo: "directo", fuente: "tasaAgendamiento" }, descripcion: "Citas ÷ Leads trabajados" },
  { id: "default-no-shows", nombre: "No shows", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 8, formato: "numero", color: "amber", formula: { tipo: "directo", fuente: "noShows" }, descripcion: "Personas que no se presentaron" },
  { id: "default-canceladas", nombre: "Canceladas", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 9, formato: "numero", color: "red", formula: { tipo: "directo", fuente: "meetingsCanceled" }, descripcion: "Citas canceladas por el lead" },
  { id: "default-pendientes-agendas", nombre: "Videollamadas pendientes", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 9, formato: "numero", color: "blue", formula: { tipo: "directo", fuente: "pendientesAgendas" }, descripcion: "Citas agendadas sin resultado aún: la reunión no ha ocurrido, o pasó y espera clasificación (Fathom o el barrido nocturno de no-shows)" },
  // --- Bloque 4: Cierre ---
  { id: "default-tasa-cierre", nombre: "Tasa de cierre", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 10, formato: "porcentaje", color: "green", formula: { tipo: "directo", fuente: "tasaCierre" }, descripcion: "Cerradas ÷ Asistidas" },
  // --- Bloque 5: Dinero ---
  // Apartados/Ventas: se alimentan de las etiquetas GHL "apartado" y "compro"
  // sobre el contacto — el backend marca la oportunidad y guarda los montos
  // (campo custom "Monto de apartado" / value de la oportunidad).
  { id: "default-apartados", nombre: "Apartados", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 11, formato: "numero", color: "cyan", formula: { tipo: "directo", fuente: "apartados" }, descripcion: "Leads con etiqueta 'apartado' (cuenta por oportunidad)" },
  { id: "default-monto-apartado", nombre: "Monto apartado", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 11, formato: "moneda", color: "cyan", formula: { tipo: "directo", fuente: "montoApartado" }, descripcion: "Suma del campo 'Monto de apartado' de las oportunidades apartadas" },
  { id: "default-ventas", nombre: "Ventas", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 11, formato: "numero", color: "green", formula: { tipo: "directo", fuente: "ventas" }, descripcion: "Leads con etiqueta 'compro' (cuenta por oportunidad)" },
  { id: "default-monto-vendido", nombre: "Monto vendido", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 11, formato: "moneda", color: "green", formula: { tipo: "directo", fuente: "montoVendido" }, descripcion: "Suma del value de las oportunidades con etiqueta 'compro'" },
  { id: "default-revenue", nombre: "Ingresos", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 11, formato: "moneda", color: "green", formula: { tipo: "directo", fuente: "revenue" } },
  { id: "default-cash", nombre: "Efectivo cobrado", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 12, formato: "moneda", color: "green", formula: { tipo: "directo", fuente: "cashCollected" } },
  { id: "default-ticket", nombre: "Ticket promedio", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 13, formato: "moneda", color: "blue", formula: { tipo: "directo", fuente: "avgTicket" }, descripcion: "Ingresos ÷ Citas efectivas" },
  // --- Bloque 6: Calidad de leads ---
  { id: "default-descartados", nombre: "Leads descartados", tipo: "automatica", ubicacion: "panel_ejecutivo", orden: 14, formato: "numero", color: "red", formula: { tipo: "directo", fuente: "leadsDescartados" }, descripcion: "Leads marcados como descartados (etiqueta descartar-lead o descarte manual). No cuentan en las métricas globales, pero quedan visibles aquí." },
];

/**
 * Parsea metricas_config tal como puede venir de la BD: array ya parseado o string JSON.
 * Algunos drivers/clientes devuelven JSONB como string; sin esto el dashboard y System no verían las métricas guardadas.
 */
export function parseMetricasConfig(raw: unknown): MetricaConfig[] {
  if (Array.isArray(raw)) return raw as MetricaConfig[];
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as MetricaConfig[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Formato canónico para fuentes KPI conocidas.
 * Previene que métricas creadas manualmente con formato incorrecto muestren valores sin formatear.
 * Ej: speedToLeadAvg siempre debe ser "tiempo" — si alguien la guardó como "numero" mostraría
 * el float crudo (911.2777...) en lugar de "911.3 min".
 */
const KPI_CANONICAL_FORMAT: Partial<Record<string, MetricaConfig["formato"]>> = {
  speedToLeadAvg: "tiempo",
  speedToLeadAsesor: "tiempo",
};

/**
 * Normaliza el campo `formato` de métricas automáticas que usan fuentes KPI con formato conocido.
 * Debe aplicarse en la capa de presentación (dashboard, videollamadas) antes de renderizar valores.
 */
export function normalizeMetricasConfig(configs: MetricaConfig[]): MetricaConfig[] {
  return configs.map((m) => {
    let patched = m;

    if (patched.tipo === "automatica" && patched.formula?.fuente) {
      const canonicalFormato = KPI_CANONICAL_FORMAT[patched.formula.fuente];
      if (canonicalFormato && patched.formato !== canonicalFormato) {
        patched = { ...patched, formato: canonicalFormato };
      }
    }

    if (!patched.paneles || patched.paneles.length === 0) {
      const ub = patched.ubicacion ?? "panel_ejecutivo";
      const standardPanels: string[] =
        ub === "ambos" ? ["panel_ejecutivo", "rendimiento"]
          : ub === "rendimiento" ? ["rendimiento"]
            : ["panel_ejecutivo"];
      patched = { ...patched, paneles: standardPanels as MetricaConfig["paneles"] };
    }

    return patched;
  });
}

/** Etapas por defecto del embudo. Se usan si embudo_personalizado está vacío. */
// Etapas que la IA puede clasificar. No Show y Cancelada las determina el SISTEMA
// (cron y webhook de GHL), no aparecen aquí ni se muestran en el embudo.
export const DEFAULT_EMBUDO_CONFIG: EmbudoEtapa[] = [
  { id: "calificada", nombre: "Calificada", color: "#22c55e", orden: 1, es_fija: true, es_calificada: true, es_unica: true, condition: "El lead cumple el perfil de cliente ideal: tiene necesidad, autoridad y presupuesto. Mostró interés genuino en la oferta." },
  { id: "no_calificada", nombre: "No calificada", color: "#f97316", orden: 2, es_fija: true, es_calificada: false, es_unica: true, condition: "El lead no cumple el perfil de cliente ideal. No tiene necesidad, presupuesto o no es el decisor." },
  { id: "cerrada", nombre: "Cerrada", color: "#10b981", orden: 3, es_fija: true, es_cerrada: true, es_calificada: true, es_unica: true, condition: "El lead aceptó la propuesta y se concretó la venta. Hay confirmación de pago en la llamada." },
];

/** Obtener métricas que dependen de esta (para aviso al borrar) */
export function getMetricasQueDependenDe(
  metricId: string,
  configs: MetricaConfig[],
): MetricaConfig[] {
  return configs.filter((m) => {
    if (m.tipo !== "automatica" || !m.formula) return false;
    const f = m.formula;
    if (f.fuente === metricId) return true;
    if (Array.isArray(f.fuentes) && f.fuentes.includes(metricId)) return true;
    return false;
  });
}

/** Calcular valor de una métrica manual en un rango de fechas */
export function calcMetricaManual(
  config: MetricaConfig,
  entries: MetricaManualEntry[],
  dateFrom: string,
  dateTo: string,
): string | number {
  if (config.tipo !== "manual" || !config.campos?.length) return 0;

  const campoFecha = config.campos.find((c) => c.tipo === "fecha" || c.esClaveFiltro);
  const campoNumero = config.campos.find((c) => c.tipo === "numero");
  const campoTexto = config.campos.find((c) => c.tipo === "texto");
  const campoBoolean = config.campos.find((c) => c.tipo === "boolean");

  const fromTs = new Date(`${dateFrom}T00:00:00Z`).getTime();
  const toTs = new Date(`${dateTo}T23:59:59.999Z`).getTime();

  let filtered = entries;
  if (campoFecha) {
    const key = campoFecha.id;
    filtered = entries.filter((e) => {
      const v = e[key];
      if (v == null) return false;
      const d = typeof v === "string" ? new Date(v).getTime() : 0;
      return d >= fromTs && d <= toTs;
    });
  }

  if (campoNumero) {
    const key = campoNumero.id;
    const nums = filtered
      .map((e) => {
        const v = e[key];
        if (v == null) return NaN;
        return typeof v === "number" ? v : parseFloat(String(v)) || NaN;
      })
      .filter((n) => !isNaN(n));
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : 0;
  }

  if (campoBoolean) {
    const key = campoBoolean.id;
    const trues = filtered.filter((e) => e[key] === true || e[key] === "true").length;
    return trues;
  }

  if (campoTexto && filtered.length > 0) {
    const last = filtered[filtered.length - 1];
    const v = last[campoTexto.id];
    return typeof v === "string" || typeof v === "number" ? v : v != null ? String(v) : "";
  }

  return filtered.length;
}

/**
 * Mapa de fallback: solo para base-llamadas-pendientes (ahora automática).
 * Las métricas manuales como facturación y cash NO se sobreescriben con datos automáticos —
 * si el cliente las tiene como manual es porque quiere ingresar su propio valor.
 */
const METRICA_FALLBACK_KPI: Record<string, KpiDefaultKey> = {
  "base-llamadas-pendientes": "pendientesLlamadas",
};

export interface MetricaEngineContext {
  id_cuenta?: string | number;
  allConfigIds?: Set<string>;
}

function isResolvableSource(
  key: string,
  metricasValores: Record<string, string | number>,
  ctx?: MetricaEngineContext,
): boolean {
  if (KPI_DEFAULT_KEYS.includes(key as KpiDefaultKey)) return true;
  if (key in metricasValores) return true;
  if (METRICA_FALLBACK_KPI[key]) return true;
  if (ctx?.allConfigIds?.has(key)) return true;
  return false;
}

function warnDanglingSource(
  metricaId: string,
  fuenteFaltante: string,
  ctx?: MetricaEngineContext,
): void {
  console.warn("[metricas-engine] fuente inexistente en fórmula", {
    id_cuenta: ctx?.id_cuenta ?? "unknown",
    metricaId,
    fuenteFaltante,
  });
}

/** Calcular valor de una métrica automática */
export function calcMetricaAutomatica(
  config: MetricaConfig,
  kpis: Record<string, unknown>,
  metricasValores: Record<string, string | number>,
  dateFrom: string,
  dateTo: string,
  ctx?: MetricaEngineContext,
): string | number {
  if (config.tipo !== "automatica" || !config.formula) return 0;

  const f = config.formula;
  const warnIfDangling = (key: string): void => {
    if (!isResolvableSource(key, metricasValores, ctx)) {
      warnDanglingSource(config.id, key, ctx);
    }
  };

  const getVal = (key: string): number => {
    warnIfDangling(key);
    if (KPI_DEFAULT_KEYS.includes(key as KpiDefaultKey)) {
      const v = kpis[key];
      return typeof v === "number" ? v : parseFloat(String(v)) || 0;
    }
    const m = metricasValores[key];
    const manualVal = typeof m === "number" ? m : parseFloat(String(m)) || 0;
    // Solo fallback para base-llamadas-pendientes (ahora automática)
    if (manualVal === 0 && METRICA_FALLBACK_KPI[key]) {
      const fallbackKey = METRICA_FALLBACK_KPI[key];
      const fallback = kpis[fallbackKey];
      const fallbackVal = typeof fallback === "number" ? fallback : parseFloat(String(fallback)) || 0;
      if (fallbackVal > 0) return fallbackVal;
    }
    return manualVal;
  };

  const getValStr = (key: string): string | number => {
    warnIfDangling(key);
    if (KPI_DEFAULT_KEYS.includes(key as KpiDefaultKey)) {
      const v = kpis[key];
      return (typeof v === "string" || typeof v === "number") ? v : (v != null ? Number(v) : 0);
    }
    const m = metricasValores[key];
    const manualVal = typeof m === "number" ? m : (typeof m === "string" ? parseFloat(m) || 0 : 0);
    // Solo fallback para base-llamadas-pendientes
    if (manualVal === 0 && METRICA_FALLBACK_KPI[key]) {
      const fallbackKey = METRICA_FALLBACK_KPI[key];
      const fallback = kpis[fallbackKey];
      const fallbackVal = typeof fallback === "number" ? fallback : parseFloat(String(fallback)) || 0;
      if (fallbackVal > 0) return fallbackVal;
    }
    return m ?? 0;
  };

  if (f.tipo === "directo" && f.fuente) {
    return getValStr(f.fuente);
  }

  if (f.tipo === "suma" && f.fuentes?.length) {
    return f.fuentes.reduce((s, k) => s + getVal(k), 0);
  }

  if (f.tipo === "promedio" && f.fuentes?.length) {
    const vals = f.fuentes.map(getVal).filter((v) => !isNaN(v));
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  if (f.tipo === "division" && f.fuentes?.length === 2) {
    const [a, b] = f.fuentes.map(getVal);
    return b !== 0 ? a / b : 0;
  }

  if (f.tipo === "multiplicacion" && f.fuentes?.length) {
    return f.fuentes.reduce((s, k) => s * getVal(k), 1);
  }

  if (f.tipo === "resta" && f.fuentes?.length === 2) {
    const [a, b] = f.fuentes.map(getVal);
    return a - b;
  }

  if (f.tipo === "condicion" && f.fuente && f.operador != null) {
    const v = getVal(f.fuente);
    const comp = f.valorComparacion;
    const cmp = typeof comp === "number" ? comp : parseFloat(String(comp)) || 0;
    let cumple = false;
    switch (f.operador) {
      case ">": cumple = v > cmp; break;
      case "<": cumple = v < cmp; break;
      case ">=": cumple = v >= cmp; break;
      case "<=": cumple = v <= cmp; break;
      case "==": cumple = Math.abs(v - cmp) < 1e-9; break;
      case "!=": cumple = Math.abs(v - cmp) >= 1e-9; break;
      default: cumple = false;
    }
    const res = cumple ? f.valorSiCumple : f.valorSiNo;
    return typeof res === "number" ? res : parseFloat(String(res)) || 0;
  }

  return 0;
}

export interface RefColgante {
  metricaId: string;
  metricaNombre: string;
  fuenteFaltante: string;
}

export function validarRefsMetricasConfig(configs: MetricaConfig[]): RefColgante[] {
  const allIds = new Set(configs.map((m) => m.id));
  const validSource = (key: string): boolean =>
    allIds.has(key) ||
    KPI_DEFAULT_KEYS.includes(key as KpiDefaultKey) ||
    !!METRICA_FALLBACK_KPI[key];

  const errors: RefColgante[] = [];

  for (const m of configs) {
    if (m.tipo !== "automatica" || !m.formula) continue;
    const f = m.formula;

    const check = (src: string) => {
      if (!validSource(src)) {
        errors.push({ metricaId: m.id, metricaNombre: m.nombre, fuenteFaltante: src });
      }
    };

    if (f.fuente) check(f.fuente);
    if (f.fuentes) f.fuentes.forEach(check);

    if (f.tipo === "condicion") {
      for (const val of [f.valorComparacion, f.valorSiCumple, f.valorSiNo]) {
        if (typeof val === "string" && val.startsWith("ref:")) {
          check(val.slice(4));
        }
      }
    }
  }

  return errors;
}
