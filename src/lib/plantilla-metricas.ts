/**
 * Plantilla de métricas base para todos los tenants de LeadMaster.
 * Estas 22 métricas replican el sistema anterior y se precargan en cada cuenta nueva.
 * Se aplican también retroactivamente a tenants existentes (ver script de migración).
 *
 * Regla de IDs: todos los IDs tienen prefijo "base-" para que la migración
 * retroactiva pueda detectar cuáles ya existen y no duplicar.
 *
 * Canales condicionales: las métricas de Publicidad/VSL (base-inversion-*, base-impresiones,
 * base-ctr, base-vsl-*) existen en TODOS los tenants pero la UI las oculta si el tenant
 * no tiene canal Ads/VSL conectado.
 */

import type { MetricaConfig } from "@/lib/db/schema";

export const PLANTILLA_METRICAS_BASE: MetricaConfig[] = [
  // ─── BLOQUE 1: Publicidad (fuente externa — se ingresa manualmente) ─────────
  {
    id: "base-inversion-publicidad",
    nombre: "Inversión en publicidad",
    descripcion: "Gasto total en pauta publicitaria del periodo",
    tipo: "manual",
    paneles: ["panel_ejecutivo"],
    orden: 0,
    formato: "moneda",
    color: "amber",
    campos: [
      { id: "fecha", nombre: "Fecha", tipo: "fecha", esClaveFiltro: true },
      { id: "inversion", nombre: "Inversión ($)", tipo: "numero" },
    ],
  },
  {
    id: "base-impresiones",
    nombre: "Impresiones",
    descripcion: "Total de impresiones de anuncios en el periodo",
    tipo: "manual",
    paneles: ["panel_ejecutivo"],
    orden: 1,
    formato: "numero",
    color: "blue",
    campos: [
      { id: "fecha", nombre: "Fecha", tipo: "fecha", esClaveFiltro: true },
      { id: "impresiones", nombre: "Impresiones", tipo: "numero" },
    ],
  },
  {
    id: "base-ctr",
    nombre: "CTR",
    descripcion: "Click-Through Rate de los anuncios",
    tipo: "ads",
    adsCampo: "ctr",
    paneles: ["panel_ejecutivo"],
    orden: 2,
    formato: "porcentaje",
    color: "blue",
  },

  // ─── BLOQUE 2: VSL ────────────────────────────────────────────────────────
  {
    id: "base-vsl-play-rate",
    nombre: "VSL Play Rate",
    descripcion: "% de visitantes que reproducen el video de ventas",
    tipo: "manual",
    paneles: ["panel_ejecutivo"],
    orden: 3,
    formato: "porcentaje",
    color: "purple",
    campos: [
      { id: "fecha", nombre: "Fecha", tipo: "fecha", esClaveFiltro: true },
      { id: "play_rate", nombre: "Play Rate (%)", tipo: "numero" },
    ],
  },
  {
    id: "base-vsl-engagement",
    nombre: "VSL Engagement",
    descripcion: "% de espectadores que ven más del 75% del VSL",
    tipo: "manual",
    paneles: ["panel_ejecutivo"],
    orden: 4,
    formato: "porcentaje",
    color: "purple",
    campos: [
      { id: "fecha", nombre: "Fecha", tipo: "fecha", esClaveFiltro: true },
      { id: "engagement", nombre: "Engagement (%)", tipo: "numero" },
    ],
  },

  // ─── BLOQUE 3: Pipeline de citas ──────────────────────────────────────────
  {
    id: "base-reuniones-agendadas",
    nombre: "Citas agendadas",
    descripcion: "Citas agendadas en el periodo (fuente: sistema)",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 5,
    formato: "numero",
    color: "cyan",
    formula: { tipo: "directo", fuente: "meetingsBooked" },
  },
  {
    id: "base-reuniones-calificadas",
    nombre: "Citas calificadas",
    descripcion: "Citas con leads que cumplieron el perfil de cliente ideal",
    tipo: "manual",
    paneles: ["panel_ejecutivo"],
    orden: 6,
    formato: "numero",
    color: "cyan",
    campos: [
      { id: "fecha", nombre: "Fecha", tipo: "fecha", esClaveFiltro: true },
      { id: "calificadas", nombre: "Calificadas", tipo: "numero" },
    ],
  },
  {
    id: "base-reuniones-asistidas",
    nombre: "Citas asistidas",
    descripcion: "Shows — leads que se presentaron a la cita",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 7,
    formato: "numero",
    color: "green",
    formula: { tipo: "directo", fuente: "meetingsAttended" },
  },
  {
    id: "base-reuniones-cerradas",
    nombre: "Citas cerradas",
    descripcion: "Citas que terminaron en venta",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 8,
    formato: "numero",
    color: "green",
    formula: { tipo: "directo", fuente: "meetingsClosed" },
  },
  {
    id: "base-reuniones-canceladas",
    nombre: "Citas canceladas",
    descripcion: "Citas canceladas antes de realizarse",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 9,
    formato: "numero",
    color: "red",
    formula: { tipo: "directo", fuente: "meetingsCanceled" },
  },
  {
    id: "base-llamadas-pendientes",
    nombre: "Llamadas pendientes",
    descripcion: "Leads con llamada pendiente de realizar",
    tipo: "manual",
    paneles: ["panel_ejecutivo"],
    orden: 10,
    formato: "numero",
    color: "amber",
    campos: [
      { id: "fecha", nombre: "Fecha", tipo: "fecha", esClaveFiltro: true },
      { id: "pendientes", nombre: "Pendientes", tipo: "numero" },
    ],
  },
  {
    id: "base-no-show",
    nombre: "No Show",
    descripcion: "Leads que no se presentaron a la cita sin avisar",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 11,
    formato: "numero",
    color: "amber",
    formula: { tipo: "directo", fuente: "noShows" },
  },

  // ─── BLOQUE 4: Financiero ─────────────────────────────────────────────────
  {
    id: "base-facturacion",
    nombre: "Facturación",
    descripcion: "Total facturado en el periodo",
    tipo: "manual",
    paneles: ["panel_ejecutivo"],
    orden: 12,
    formato: "moneda",
    color: "green",
    campos: [
      { id: "fecha", nombre: "Fecha", tipo: "fecha", esClaveFiltro: true },
      { id: "facturacion", nombre: "Facturación ($)", tipo: "numero" },
    ],
  },
  {
    id: "base-cash-collected",
    nombre: "Cash Collected",
    descripcion: "Efectivo cobrado en el periodo",
    tipo: "manual",
    paneles: ["panel_ejecutivo"],
    orden: 13,
    formato: "moneda",
    color: "green",
    campos: [
      { id: "fecha", nombre: "Fecha", tipo: "fecha", esClaveFiltro: true },
      { id: "cash", nombre: "Cash Collected ($)", tipo: "numero" },
    ],
  },

  // ─── BLOQUE 5: Métricas derivadas ─────────────────────────────────────────
  {
    id: "base-ticket-promedio",
    nombre: "Ticket promedio",
    descripcion: "Facturación ÷ Citas cerradas",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 14,
    formato: "moneda",
    color: "blue",
    formula: {
      tipo: "division",
      fuentes: ["base-facturacion", "base-reuniones-cerradas"],
    },
  },
  {
    id: "base-cpa-calificada",
    nombre: "Costo por agenda calificada",
    descripcion: "Inversión ÷ Citas calificadas",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 15,
    formato: "moneda",
    color: "amber",
    formula: {
      tipo: "division",
      fuentes: ["base-inversion-publicidad", "base-reuniones-calificadas"],
    },
  },
  {
    id: "base-costo-por-show",
    nombre: "Costo por show",
    descripcion: "Inversión ÷ Citas asistidas",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 16,
    formato: "moneda",
    color: "amber",
    formula: {
      tipo: "division",
      fuentes: ["base-inversion-publicidad", "base-reuniones-asistidas"],
    },
  },
  {
    id: "base-cac",
    nombre: "CAC",
    descripcion: "Costo de Adquisición de Cliente (Inversión ÷ Citas cerradas)",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 17,
    formato: "moneda",
    color: "red",
    formula: {
      tipo: "division",
      fuentes: ["base-inversion-publicidad", "base-reuniones-cerradas"],
    },
  },
  {
    id: "base-roas-facturacion",
    nombre: "ROAS Facturación",
    descripcion: "Facturación ÷ Inversión en publicidad",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 18,
    formato: "decimal",
    color: "green",
    formula: {
      tipo: "division",
      fuentes: ["base-facturacion", "base-inversion-publicidad"],
    },
  },
  {
    id: "base-roas-cash",
    nombre: "ROAS Cash Collected",
    descripcion: "Cash Collected ÷ Inversión en publicidad",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 19,
    formato: "decimal",
    color: "green",
    formula: {
      tipo: "division",
      fuentes: ["base-cash-collected", "base-inversion-publicidad"],
    },
  },
  {
    id: "base-revenue-por-show",
    nombre: "Revenue por Show",
    descripcion: "Facturación ÷ Citas asistidas",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 20,
    formato: "moneda",
    color: "green",
    formula: {
      tipo: "division",
      fuentes: ["base-facturacion", "base-reuniones-asistidas"],
    },
  },
  {
    id: "base-pct-calificacion",
    nombre: "% Calificación",
    descripcion: "Citas calificadas ÷ Citas agendadas",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 21,
    formato: "porcentaje",
    color: "cyan",
    formula: {
      tipo: "division",
      fuentes: ["base-reuniones-calificadas", "base-reuniones-agendadas"],
    },
  },

  // ─── BLOQUE 6: Calidad de leads ───────────────────────────────────────────
  {
    id: "base-leads-descartados",
    nombre: "Leads descartados",
    descripcion: "Leads marcados como descartados (etiqueta descartar-lead o descarte manual). No cuentan en las métricas globales, pero quedan visibles como métrica.",
    tipo: "automatica",
    paneles: ["panel_ejecutivo"],
    orden: 22,
    formato: "numero",
    color: "red",
    formula: { tipo: "directo", fuente: "leadsDescartados" },
  },
];

/**
 * IDs de las métricas base. Se usan para detectar qué tenants ya las tienen
 * y evitar duplicados en la migración retroactiva.
 */
export const PLANTILLA_METRICAS_BASE_IDS = new Set(
  PLANTILLA_METRICAS_BASE.map((m) => m.id),
);

/**
 * Dado un array existente de métricas, retorna las métricas base que faltan.
 * No modifica ni elimina métricas existentes.
 */
export function getMetricasBaseFaltantes(
  metricasExistentes: MetricaConfig[],
): MetricaConfig[] {
  const idsExistentes = new Set(metricasExistentes.map((m) => m.id));
  return PLANTILLA_METRICAS_BASE.filter((m) => !idsExistentes.has(m.id));
}

// ─── Vertical: Real Estate ────────────────────────────────────────────────────

/**
 * Plantilla vertical para clientes inmobiliarios (Imexico, etc.)
 * 5 KPIs de recorridos y apartados — ocultas por defecto (paneles vacío).
 * Se activan manualmente desde Configuración > Métricas.
 *
 * Todos los IDs tienen prefijo "re-" para evitar colisión con base-* y métricas custom.
 */
export const PLANTILLA_METRICAS_REALESTATE: MetricaConfig[] = [
  // ─── Recorridos ──────────────────────────────────────────────────────────
  {
    id: "re-recorridos-agendados",
    nombre: "Recorridos agendados",
    descripcion: "Tours inmobiliarios agendados en el período (vía n8n)",
    tipo: "webhook",
    paneles: [],
    orden: 34,
    formato: "numero",
    color: "purple",
    webhookCampo: "re_recorridos_agendados",
    atribuible_a_usuario: true,
  },
  {
    id: "re-recorridos-realizados",
    nombre: "Recorridos realizados",
    descripcion: "Tours inmobiliarios completados (vía n8n)",
    tipo: "webhook",
    paneles: [],
    orden: 35,
    formato: "numero",
    color: "purple",
    webhookCampo: "re_recorridos_realizados",
    atribuible_a_usuario: true,
  },
  {
    id: "re-recorridos-cancelados",
    nombre: "Recorridos cancelados",
    descripcion: "Tours cancelados o no presentados (vía n8n)",
    tipo: "webhook",
    paneles: [],
    orden: 36,
    formato: "numero",
    color: "red",
    webhookCampo: "re_recorridos_cancelados",
    atribuible_a_usuario: true,
  },

  // ─── Apartados ───────────────────────────────────────────────────────────
  {
    id: "re-apartados",
    nombre: "Apartados",
    descripcion: "Propiedades apartadas o reservadas (vía n8n)",
    tipo: "webhook",
    paneles: [],
    orden: 37,
    formato: "numero",
    color: "amber",
    webhookCampo: "re_apartados",
    atribuible_a_usuario: true,
  },
  {
    id: "re-monto-apartados",
    nombre: "Monto apartados",
    descripcion: "Valor total de propiedades apartadas (vía n8n)",
    tipo: "webhook",
    paneles: [],
    orden: 38,
    formato: "moneda",
    color: "green",
    webhookCampo: "re_monto_apartados",
    atribuible_a_usuario: true,
  },
];

/**
 * IDs de las métricas Real Estate. Se usan para evitar duplicados al aplicar la plantilla.
 */
export const PLANTILLA_METRICAS_REALESTATE_IDS = new Set(
  PLANTILLA_METRICAS_REALESTATE.map((m) => m.id),
);

/**
 * Retorna las métricas Real Estate faltantes en un tenant dado.
 */
export function getMetricasRealEstateFaltantes(
  metricasExistentes: MetricaConfig[],
): MetricaConfig[] {
  const idsExistentes = new Set(metricasExistentes.map((m) => m.id));
  return PLANTILLA_METRICAS_REALESTATE.filter((m) => !idsExistentes.has(m.id));
}
