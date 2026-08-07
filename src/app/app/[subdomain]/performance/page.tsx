"use client";

import { useState, useMemo, useEffect, useCallback, Fragment } from 'react';
import { usePerformanceFilter } from '@/contexts/PerformanceFilterContext';
import { useT } from '@/contexts/LocaleContext';
import KpiTooltip from '@/components/dashboard/KpiTooltip';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import TagFilter from '@/components/dashboard/TagFilter';
import ModalTranscripcionIA from '@/components/dashboard/modals/ModalTranscripcionIA';
import { useApiData } from '@/hooks/useApiData';
import { format, subDays, formatDistanceToNow, isAfter, subDays as subDaysDate } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, Pencil, Search, User, X, Plus, RefreshCw, Eye, EyeOff } from 'lucide-react';
import NuevoRegistroModal from '@/components/dashboard/NuevoRegistroModal';
import { matchesLeadSearch } from '@/lib/performance-search';
import EditRecordSheet from '@/components/dashboard/EditRecordSheet';
import MetricaEditSheet from '@/components/dashboard/MetricaEditSheet';
import type { VideollamadasResponse, ApiVideollamada, VideoMeeting, VideollamadasAdvisorMetrics } from '@/types';
import type { MetricaConfig, MetricaManualEntry, DashboardPersonalizado, UbicacionPanel } from '@/lib/db/schema';
import { BarChart3 } from 'lucide-react';
import { outcomeVideollamadaToSpanish } from '@/utils/outcomeLabels';
import { formatCurrency } from '@/lib/format';
import { useSession } from '@/hooks/useSession';
import { exportVideollamadas } from '@/lib/export-performance';
import { Download } from 'lucide-react';

const fm = formatCurrency;
const pct = (n: number) => `${n.toFixed(1)}%`;

const kpiTooltips = {
  agendadas: { significado: 'Citas o presentaciones programadas. Vienen de los calendarios usados para citas o presentaciones.', calculo: 'Eventos de cita de los calendarios de citas/presentaciones en el rango.' },
  asistidas: { significado: 'Citas a las que el lead asistió (citas y citas GHL).', calculo: 'Citas con attended = true (interacción real verificada).' },
  canceladas: { significado: 'Citas canceladas antes de realizarse. Provienen de las canceladas en GHL.', calculo: 'Citas con canceled = true en GHL.' },
  efectivas: { significado: 'Ventas cerradas. Las que Fathom determina como cerradas.', calculo: 'Citas que Fathom marca como cerradas.' },
  cerradasVendidas: { significado: 'Citas que terminaron en venta (conteo absoluto).', calculo: 'Registros con categoría cerrada/cerrado. Mismo numerador que Tasa de cierre.' },
  noShows: { significado: 'Leads que no se presentaron a la cita agendada.', calculo: 'Registros con categoría no_show en el período seleccionado.' },
  revenue: { significado: 'Lo que se vendió (ingresos por ventas).', calculo: 'Suma del monto vendido en citas cerradas.' },
  cashCollected: { significado: 'Lo que se recolectó (efectivo cobrado por cierres).', calculo: 'Suma de cashCollected por cita.' },
  ticket: { significado: 'Valor promedio por venta.', calculo: 'Efectivo cobrado total / número de ventas.' },
};

function apiToVideoMeeting(r: ApiVideollamada): VideoMeeting {
  return {
    id: String(r.id),
    leadId: r.leadEmail ?? String(r.id),
    advisorId: r.closer ?? '',
    datetime: r.datetime,
    attended: r.attended,
    qualified: r.qualified,
    booked: true,
    canceled: r.canceled,
    outcome: r.outcome,
    amountBought: r.facturacion,
    cashCollected: r.cashCollected,
    notes: r.resumenIa ?? undefined,
    transcript: r.transcripcionFathom ?? undefined,
    tags: r.tags ? r.tags.split(',').map((t) => t.trim()) : [],
    recordingUrl: r.linkLlamada ?? undefined,
    source: r.origen ?? undefined,
    objections: r.objeciones.map((o) => o.categoria),
    objectionDetails: r.objeciones.map((o) => ({ category: o.categoria, quote: o.objecion })),
  };
}

export default function PerformanceVideollamadasPage() {
  const t = useT();
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expandedAdvisorId, setExpandedAdvisorId] = useState<string | null>(null);
  const [modalSelectorMeetings, setModalSelectorMeetings] = useState<VideoMeeting[] | null>(null);
  const [modalTranscripcionIA, setModalTranscripcionIA] = useState<VideoMeeting | null>(null);
  const [apiMeetingsForModal, setApiMeetingsForModal] = useState<ApiVideollamada[] | null>(null);
  const [editingRecord, setEditingRecord] = useState<{id: number; nombre_lead: string | null; closer: string | null; estado: string | null; facturacion?: number | null; cash_collected?: number | null} | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [filterAsistio, setFilterAsistio] = useState<'all' | 'si' | 'no'>('all');
  const [filterCalificada, setFilterCalificada] = useState<'all' | 'si' | 'no'>('all');
  const [filterCompro, setFilterCompro] = useState<'all' | 'si' | 'no'>('all');
  const [showExcluded, setShowExcluded] = useState(false);

  const [metricaSheetOpen, setMetricaSheetOpen] = useState(false);
  const [metricaEditingId, setMetricaEditingId] = useState<string | null>(null);
  const [metricasConfig, setMetricasConfig] = useState<MetricaConfig[]>([]);
  const [metricasManualData, setMetricasManualData] = useState<Record<string, MetricaManualEntry[]>>({});
  const [dashboardsPersonalizados, setDashboardsPersonalizados] = useState<DashboardPersonalizado[]>([]);
  const [systemConfigLoaded, setSystemConfigLoaded] = useState(false);

  const { session } = useSession();
  const canConfigureSystem = session?.rol === 'superadmin' || session?.permisosArray?.includes('configurar_sistema');
  const { isAdvisorVisible, setAdvisorOptions, selectedAdvisors, filterMode } = usePerformanceFilter();

  const loadSystemConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/data/system-config');
      if (res.ok) {
        const cfg = await res.json();
        const loadedConfig = Array.isArray(cfg.metricas_config) ? cfg.metricas_config as MetricaConfig[] : [];
        setMetricasConfig(loadedConfig);
        setMetricasManualData(
          cfg.metricas_manual_data && typeof cfg.metricas_manual_data === 'object'
            ? cfg.metricas_manual_data as Record<string, MetricaManualEntry[]>
            : {},
        );
        setDashboardsPersonalizados(Array.isArray(cfg.dashboards_personalizados) ? cfg.dashboards_personalizados as DashboardPersonalizado[] : []);
      }
    } catch { /* silently fail */ }
    setSystemConfigLoaded(true);
  }, []);

  useEffect(() => { loadSystemConfig(); }, [loadSystemConfig]);

  const { data, loading, refetch } = useApiData<VideollamadasResponse>('/api/data/videollamadas', { from: dateFrom, to: dateTo, tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined, includeExcluded: showExcluded ? 'true' : undefined });
  const rendimientoMetrics = data?.metricasComputadas ?? [];

  useEffect(() => {
    if (!data?.advisorMetrics) return;
    const opts = Object.entries(data.advisorMetrics)
      .map(([key, m]) => ({ key, name: m.advisorName || key }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setAdvisorOptions(opts);
  }, [data?.advisorMetrics, setAdvisorOptions]);

  const openTranscripcionIA = (meetingsOfLead: VideoMeeting[], apiMeetings?: ApiVideollamada[]) => {
    if (apiMeetings) setApiMeetingsForModal(apiMeetings);
    if (meetingsOfLead.length === 1) setModalTranscripcionIA(meetingsOfLead[0]);
    else setModalSelectorMeetings(meetingsOfLead);
  };

  const aggRaw = data?.agg ?? { agendadas: 0, asistidas: 0, canceladas: 0, efectivas: 0, cerradas: 0, noShows: 0, revenue: 0, cashCollected: 0, ticket: 0 };

  const agg = useMemo(() => {
    if (!data?.advisorMetrics) return aggRaw;
    const visibleKeys = Object.keys(data.advisorMetrics).filter(isAdvisorVisible);
    if (visibleKeys.length === Object.keys(data.advisorMetrics).length) return aggRaw;
    let agendadas = 0, asistencias = 0, cerradas = 0, facturacion = 0, cashCollected = 0, canceladas = 0, noShows = 0;
    for (const key of visibleKeys) {
      const m = data.advisorMetrics[key];
      agendadas += m.agendadas;
      asistencias += m.asistencias;
      cerradas += m.cerradas;
      facturacion += m.facturacion;
      cashCollected += m.cashCollected;
    }
    if (data.registros) {
      for (const r of data.registros) {
        const rKey = r.closerCanonicalKey ?? r.closer ?? 'Sin asignar';
        if (!isAdvisorVisible(rKey)) continue;
        if (r.canceled) canceladas++;
        if (r.outcome === 'no_show') noShows++;
      }
    }
    return {
      agendadas, asistidas: asistencias, canceladas, efectivas: cerradas, cerradas, noShows,
      revenue: facturacion, cashCollected, ticket: cerradas > 0 ? cashCollected / cerradas : 0,
    };
  }, [aggRaw, data?.advisorMetrics, data?.registros, isAdvisorVisible]);

  const leadsCalificados = useMemo(() => {
    if (!data?.registros) return 0;
    return data.registros.filter((r) => {
      if (!r.qualified || r.excludedFromDashboard) return false;
      const rKey = r.closerCanonicalKey ?? r.closer ?? 'Sin asignar';
      return isAdvisorVisible(rKey);
    }).length;
  }, [data?.registros, isAdvisorVisible]);

  const isCerrada = (r: ApiVideollamada) =>
    r.outcome === 'cerrada' || r.outcome === 'cerrado' || r.outcome === 'closed';

  const handleToggleExclude = async (id: number, excluir: boolean) => {
    await fetch('/api/data/videollamadas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, excluida_dashboard: excluir }),
    });
    refetch();
  };

  const registrosFiltrados = useMemo(() => {
    if (!data?.registros) return [];
    let records = data.registros;
    if (!showExcluded) records = records.filter((r) => !r.excludedFromDashboard);
    if (selectedAdvisors.length > 0) {
      records = records.filter((r) => {
        const key = r.closerCanonicalKey ?? r.closer ?? 'Sin asignar';
        return isAdvisorVisible(key);
      });
    }
    const q = leadSearch.trim();
    if (q) {
      records = records.filter((r) =>
        matchesLeadSearch(q, [
          r.leadName,
          r.leadEmail,
          r.idcliente,
          r.ghl_contact_id,
          r.tags,
          r.origen,
          String(r.id),
          r.closer,
          r.resumenIa,
        ]),
      );
    }
    if (filterAsistio === 'si') records = records.filter((r) => r.attended);
    else if (filterAsistio === 'no') records = records.filter((r) => !r.attended);
    if (filterCalificada === 'si') records = records.filter((r) => r.qualified);
    else if (filterCalificada === 'no') records = records.filter((r) => !r.qualified);
    if (filterCompro === 'si') records = records.filter(isCerrada);
    else if (filterCompro === 'no') records = records.filter((r) => !isCerrada(r));
    return records;
  }, [data?.registros, leadSearch, filterAsistio, filterCalificada, filterCompro, showExcluded, selectedAdvisors, isAdvisorVisible]);

  const meetingsByAdvisor = useMemo(() => {
    const map: Record<string, ApiVideollamada[]> = {};
    for (const r of registrosFiltrados) {
      // Usar closerCanonicalKey para que la clave coincida con advisorMetrics del servidor
      const key = r.closerCanonicalKey ?? r.closer ?? 'Sin asignar';
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    return map;
  }, [registrosFiltrados]);

  function metricsFromMeetings(ms: ApiVideollamada[]): VideollamadasAdvisorMetrics {
    const asist = ms.filter((r) => r.attended).length;
    const cerr = ms.filter((r) => r.outcome === 'cerrada' || r.outcome === 'cerrado').length;
    const fact = ms.reduce((s, r) => s + r.facturacion, 0);
    const cash = ms.reduce((s, r) => s + r.cashCollected, 0);
    // Dedup por lead único (incluye canceladas) para alinear con advisorMetrics del
    // servidor y con el headline agendadas (AUT-1683). Antes era ms.length (conteo crudo).
    const agendadas = new Set(
      ms.map((r) => r.idcliente?.trim() || r.leadEmail?.trim().toLowerCase() || r.ghl_contact_id?.trim() || `nokey_${r.id}`)
    ).size;
    return {
      advisorName: ms[0]?.closer ?? '',
      agendadas,
      asistencias: asist,
      cerradas: cerr,
      pctCierre: asist > 0 ? (cerr / asist) * 100 : 0,
      facturacion: fact,
      cashCollected: cash,
    };
  }

  type LeadRow = { leadKey: string; name: string; email: string | null; meetings: ApiVideollamada[] };
  const leadsByAdvisor = useMemo(() => {
    const out: Record<string, LeadRow[]> = {};
    for (const [advisorKey, meetings] of Object.entries(meetingsByAdvisor)) {
      const byLead = new Map<string, LeadRow>();
      for (const r of meetings) {
        const leadKey = r.leadEmail ?? r.leadName ?? String(r.id);
        const existing = byLead.get(leadKey);
        if (existing) {
          existing.meetings.push(r);
        } else {
          byLead.set(leadKey, { leadKey, name: r.leadName ?? '—', email: r.leadEmail ?? null, meetings: [r] });
        }
      }
      out[advisorKey] = [...byLead.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return out;
  }, [meetingsByAdvisor]);

  useEffect(() => {
    const q = leadSearch.trim();
    if (!q) return;
    const keys = Object.keys(meetingsByAdvisor);
    if (keys.length === 1) setExpandedAdvisorId(keys[0]);
  }, [leadSearch, meetingsByAdvisor]);

  const defaultTo = new Date();
  const defaultFrom = subDays(defaultTo, 7);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <div className="text-gray-400 text-sm animate-pulse">Cargando datos de citas...</div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-4 space-y-3 text-sm min-w-0 max-w-full overflow-x-hidden">
      <div className="flex flex-wrap items-center gap-2 mb-0">
        <button
          type="button"
          onClick={() => setShowNuevoModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-cyan text-black text-xs font-semibold hover:bg-accent-cyan/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Nueva entrada
        </button>
        <button
          type="button"
          onClick={() => {
            const advisorName = selectedAdvisors.length === 1
              ? (data?.advisorMetrics[selectedAdvisors[0]]?.advisorName ?? selectedAdvisors[0])
              : undefined;
            exportVideollamadas(registrosFiltrados, dateFrom, dateTo, advisorName);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/20 text-accent-green border border-accent-green/30 text-xs font-semibold hover:bg-accent-green/30 transition-colors"
          title={selectedAdvisors.length > 0 ? `Exportar datos filtrados (${selectedAdvisors.length} asesor${selectedAdvisors.length > 1 ? 'es' : ''})` : 'Exportar todos los datos'}
        >
          <Download className="w-3.5 h-3.5" />
          Exportar {selectedAdvisors.length > 0 ? `(${registrosFiltrados.length})` : 'todo'}
        </button>
        <span className="text-xs text-gray-400">Rango de fechas (actividad):</span>
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRange={(from, to) => { setDateFrom(from); setDateTo(to); }}
          defaultFrom={format(defaultFrom, 'yyyy-MM-dd')}
          defaultTo={format(defaultTo, 'yyyy-MM-dd')}
        />
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          <input
            type="search"
            value={leadSearch}
            onChange={(e) => setLeadSearch(e.target.value)}
            placeholder="Buscar: nombre, email, ID contacto, tags, resumen…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-700 border border-surface-500 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-accent-purple"
            aria-label="Buscar en citas"
          />
        </div>
      </div>
      {leadSearch.trim() && (
        <p className="text-[10px] text-gray-500">
          Mostrando {registrosFiltrados.length} de {data?.registros?.length ?? 0} reuniones
          {registrosFiltrados.length === 0 ? ' — prueba otro término' : ''}
        </p>
      )}
      <TagFilter
        tags={[...new Set(data?.registros?.flatMap((r: ApiVideollamada) => (r.tags ?? '').split(',').map(t => t.trim()).filter(Boolean)) ?? [])]}
        selected={selectedTags}
        onChange={setSelectedTags}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Filtrar lista:</span>
        {([
          { key: 'asistio' as const, label: 'Asistió', value: filterAsistio, setter: setFilterAsistio },
          { key: 'calificada' as const, label: 'Calificada', value: filterCalificada, setter: setFilterCalificada },
          { key: 'compro' as const, label: 'Compró', value: filterCompro, setter: setFilterCompro },
        ]).map(({ key, label, value, setter }) => {
          const next: Record<string, 'all' | 'si' | 'no'> = { all: 'si', si: 'no', no: 'all' };
          const display = value === 'all' ? label : value === 'si' ? `${label}: Sí` : `${label}: No`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setter(next[value])}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                value === 'si'
                  ? 'bg-accent-green/20 border-accent-green/50 text-accent-green'
                  : value === 'no'
                  ? 'bg-red-500/20 border-red-500/50 text-red-400'
                  : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-accent-purple/30 hover:text-gray-300'
              }`}
            >
              {display}
            </button>
          );
        })}
        {(filterAsistio !== 'all' || filterCalificada !== 'all' || filterCompro !== 'all') && (
          <span className="text-[10px] text-gray-500">
            — {registrosFiltrados.length} reunión{registrosFiltrados.length !== 1 ? 'es' : ''} · los KPIs de arriba no cambian
          </span>
        )}
        <span className="ml-auto" />
        <button
          type="button"
          onClick={() => setShowExcluded(!showExcluded)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
            showExcluded
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
              : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-amber-500/30 hover:text-gray-300'
          }`}
        >
          {showExcluded ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {showExcluded ? 'Mostrando excluidas' : 'Mostrar excluidas'}
        </button>
      </div>

      <div className="grid grid-cols-2 min-[500px]:grid-cols-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-1.5 sm:gap-2 [grid-auto-rows:minmax(64px,auto)]">
        {[
          { label: t.performance.videollamadas.kpis.agendadas, value: agg.agendadas, color: 'purple', tip: kpiTooltips.agendadas },
          { label: t.performance.videollamadas.kpis.asistidas, value: agg.asistidas, color: 'cyan', tip: kpiTooltips.asistidas },
          { label: t.performance.videollamadas.kpis.canceladas, value: agg.canceladas, color: 'red', tip: kpiTooltips.canceladas },
          { label: t.performance.videollamadas.kpis.noShows, value: agg.noShows, color: 'amber', tip: kpiTooltips.noShows },
          { label: t.performance.videollamadas.kpis.cerradasVendidas, value: agg.cerradas, color: 'green', tip: kpiTooltips.cerradasVendidas },
          { label: t.performance.videollamadas.kpis.ingresos, value: fm(agg.revenue), color: 'green', tip: kpiTooltips.revenue },
          { label: t.performance.videollamadas.kpis.efectivoCobrado, value: fm(agg.cashCollected), color: 'green', tip: kpiTooltips.cashCollected },
          { label: t.performance.videollamadas.kpis.ticketPromedio, value: fm(agg.ticket), color: 'blue', tip: kpiTooltips.ticket },
        ].map(({ label, value, color, tip }) => (
          <div key={label} className={`rounded-lg pl-3 overflow-hidden flex flex-col card-futuristic-${color} kpi-card-fixed`}>
            <p className="text-[9px] font-medium text-gray-400 uppercase tracking-tight mt-1 flex items-center gap-0.5">
              {label}
              <KpiTooltip significado={tip.significado} calculo={tip.calculo} />
            </p>
            <p className={`text-base font-bold mt-0.5 text-accent-${color} break-words`}>{value}</p>
            <div className="kpi-card-spacer" />
          </div>
        ))}
      </div>

      {/* ── KPI Calificados ── */}
      {leadsCalificados > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-medium text-gray-300">Leads calificados:</span>
            <span className="text-base font-bold text-emerald-400">{leadsCalificados}</span>
            <span className="text-[10px] text-gray-500">de {agg.asistidas} asistidas</span>
            <KpiTooltip
              significado="Citas donde el lead fue calificado — cumple criterios para avanzar en el proceso de venta."
              calculo="Conteo de citas con categoría calificada o cerrada en el período."
            />
          </div>
        </div>
      )}

      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-accent-green" />
          Métricas personalizadas
          {canConfigureSystem && (
            <button
              type="button"
              onClick={() => { setMetricaEditingId(null); setMetricaSheetOpen(true); }}
              className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-[10px] font-medium hover:bg-accent-green/20 transition-colors"
              title="Agregar métrica personalizada"
            >
              <Plus className="w-3 h-3" /> Agregar métrica
            </button>
          )}
        </h3>
        {rendimientoMetrics.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 sm:gap-2 [grid-auto-rows:minmax(64px,auto)]">
            {rendimientoMetrics.map((m) => (
              <div key={m.id} className="rounded-lg pl-3 overflow-hidden flex flex-col card-futuristic-green kpi-card-fixed relative group">
                <p className="text-[9px] font-medium text-gray-400 uppercase tracking-tight mt-1 truncate">{m.nombre}</p>
                <p className="text-base font-bold mt-0.5 text-accent-green">{m.valor}</p>
                {m.descripcion && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{m.descripcion}</p>}
                <div className="kpi-card-spacer" />
                {canConfigureSystem && (
                  <button
                    type="button"
                    onClick={() => { setMetricaEditingId(m.id); setMetricaSheetOpen(true); }}
                    className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-600/80 text-gray-400 hover:text-accent-cyan transition-all"
                    title="Editar métrica"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-surface-500 px-4 py-6 text-center">
            <p className="text-xs text-gray-500">No hay métricas personalizadas en Rendimiento.</p>
            {canConfigureSystem && (
              <button
                type="button"
                onClick={() => { setMetricaEditingId(null); setMetricaSheetOpen(true); }}
                className="mt-2 inline-flex items-center gap-1 text-xs text-accent-green hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Crear tu primera métrica
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          {t.performance.videollamadas.titulo}
        </h3>
        <div className="rounded-lg border border-surface-500 overflow-hidden">
          {(data?.registros?.length ?? 0) === 0 ? (
            <div className="px-3 py-4 text-center text-gray-500 text-xs">{t.performance.videollamadas.noData}</div>
          ) : leadSearch.trim() && registrosFiltrados.length === 0 ? (
            <div className="px-3 py-4 text-center text-gray-500 text-xs">Ninguna cita coincide con «{leadSearch.trim()}».</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-700 text-left text-gray-400">
                    <th className="px-2 py-2 font-medium w-6" />
                    <th className="px-2 py-2 font-medium">{t.performance.videollamadas.closer}</th>
                    <th className="px-2 py-2 font-medium">{t.performance.videollamadas.reunion}</th>
                    <th className="px-2 py-2 font-medium">{t.dashboard.kpis.asistidas}</th>
                    <th className="px-2 py-2 font-medium">{t.dashboard.kpis.cerradas}</th>
                    <th className="px-2 py-2 font-medium">{t.dashboard.kpis.tasaCierre}</th>
                    <th className="px-2 py-2 font-medium">{t.dashboard.kpis.ingresos}</th>
                    <th className="px-2 py-2 font-medium">{t.dashboard.kpis.efectivoCobrado}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(meetingsByAdvisor)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([advisorKey, advisorMeetings]) => {
                      const isExpanded = expandedAdvisorId === advisorKey;
                      const metrics = leadSearch.trim()
                        ? metricsFromMeetings(advisorMeetings)
                        : data?.advisorMetrics[advisorKey];
                      return (
                        <Fragment key={advisorKey}>
                          <tr
                            className="border-t border-surface-500 hover:bg-surface-700/50 cursor-pointer"
                            onClick={() => setExpandedAdvisorId(isExpanded ? null : advisorKey)}
                          >
                            <td className="px-1 py-2 text-gray-400">
                              <span className="inline-block transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}>˅</span>
                            </td>
                            <td className="px-2 py-2">
                              <span className="flex items-center gap-1.5 text-white font-medium">
                                <User className="w-3.5 h-3.5 text-accent-purple" />
                                {metrics?.advisorName ?? advisorMeetings[0]?.closer ?? advisorKey}
                                {metrics && metrics.agendadas > 0 && (
                                  <span className="text-[10px] font-normal text-gray-400 ml-1">
                                    (asistencia: {pct((metrics.asistencias / metrics.agendadas) * 100)})
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-accent-purple">{metrics?.agendadas ?? 0}</td>
                            <td className="px-2 py-2 text-accent-cyan">{metrics?.asistencias ?? 0}</td>
                            <td className="px-2 py-2 text-accent-green">{metrics?.cerradas ?? 0}</td>
                            <td className="px-2 py-2 text-accent-green">{metrics != null ? pct(metrics.pctCierre) : '—'}</td>
                            <td className="px-2 py-2 text-accent-green">{metrics ? fm(metrics.facturacion) : '—'}</td>
                            <td className="px-2 py-2 text-accent-green">{metrics ? fm(metrics.cashCollected) : '—'}</td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-surface-800/90">
                              <td colSpan={8} className="p-0">
                                <div className="px-3 py-2 border-t border-surface-500">
                                  <div className="text-[10px] text-gray-400 mb-1.5">Leads de {metrics?.advisorName ?? advisorMeetings[0]?.closer ?? advisorKey} (clic en la fila abre citas)</div>
                                  <div className="rounded-lg border border-surface-500 overflow-x-auto max-h-[400px] overflow-y-auto">
                                    <table className="w-full text-xs">
                                      <thead className="sticky top-0 bg-surface-700">
                                        <tr className="text-left text-gray-400">
                                          <th className="px-2 py-2 font-medium">Nombre</th>
                                          <th className="px-2 py-2 font-medium">Correo</th>
                                          <th className="px-2 py-2 font-medium" title="¿Lead calificado?">Calificado</th>
                                          <th className="px-2 py-2 font-medium">Citas agendadas</th>
                                          <th className="px-2 py-2 font-medium">Resultado</th>
                                          <th className="px-2 py-2 font-medium w-8" />
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(leadsByAdvisor[advisorKey] ?? []).map((lead) => {
                                          const last = lead.meetings[lead.meetings.length - 1];
                                          const outcomeLabel = last ? outcomeVideollamadaToSpanish(last.outcome) : '—';
                                          const reingestDate = last?.fathomReingestAt ? new Date(last.fathomReingestAt) : null;
                                          const showReingestBadge = reingestDate !== null && isAfter(reingestDate, subDaysDate(new Date(), 7));
                                          const anyExcluded = lead.meetings.some((m) => m.excludedFromDashboard);
                                          return (
                                            <tr
                                              key={lead.leadKey}
                                              className={`border-t border-surface-500 hover:bg-surface-600/50 cursor-pointer${anyExcluded ? ' opacity-50' : ''}`}
                                              onClick={() => openTranscripcionIA(lead.meetings.map(apiToVideoMeeting), lead.meetings)}
                                            >
                                              <td className="px-2 py-2 text-white">
                                                <div className="flex flex-col gap-0.5">
                                                  <span>{lead.name}</span>
                                                  {(lead.meetings[0]?.idcliente || lead.meetings[0]?.ghl_contact_id) && (
                                                    <span className="text-[10px] text-gray-500">
                                                      {lead.meetings[0]?.ghl_contact_id && <>GHL: {lead.meetings[0].ghl_contact_id}</>}
                                                      {lead.meetings[0]?.idcliente && lead.meetings[0]?.ghl_contact_id && ' · '}
                                                      {lead.meetings[0]?.idcliente && <>ID: {lead.meetings[0].idcliente}</>}
                                                    </span>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="px-2 py-2 text-gray-400">{lead.email ?? '—'}</td>
                                              <td className="px-2 py-2">
                                                {lead.meetings.some((m) => m.qualified) ? (
                                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                                                    <CheckCircle2 className="w-3 h-3" /> Sí
                                                  </span>
                                                ) : (
                                                  <span className="text-gray-600 text-[10px]">No</span>
                                                )}
                                              </td>
                                              <td className="px-2 py-2 text-accent-cyan">{lead.meetings.length}</td>
                                              <td className="px-2 py-2 text-gray-300">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span>{outcomeLabel}</span>
                                                  {showReingestBadge && reingestDate && (
                                                    <span className="relative group/reingest" onClick={(e) => e.stopPropagation()}>
                                                      <span className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-1.5 py-0.5 rounded-md cursor-help select-none">
                                                        <RefreshCw className="w-3 h-3" />
                                                        Actualizado
                                                      </span>
                                                      <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-lg p-3 hidden group-hover/reingest:block z-20 shadow-xl pointer-events-none">
                                                        <p className="font-medium text-white mb-1">
                                                          Fathom actualizó este registro{' '}
                                                          {formatDistanceToNow(reingestDate, { addSuffix: true, locale: es })}
                                                        </p>
                                                        {last.categoriaPrevia && (
                                                          <p className="text-gray-400 mb-0.5">
                                                            Categoría anterior: <span className="text-gray-200">{last.categoriaPrevia}</span>
                                                          </p>
                                                        )}
                                                        <p className="text-gray-400 mb-2">
                                                          Categoría actual: <span className="text-gray-200">{last.categoria}</span>
                                                        </p>
                                                        <p className="text-gray-500 leading-snug">
                                                          Fathom envió una corrección automática al confirmar la asistencia de este lead.
                                                        </p>
                                                      </div>
                                                    </span>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="px-1 py-2">
                                                <button
                                                  type="button"
                                                  title={anyExcluded ? 'Restaurar al dashboard' : 'Excluir del dashboard'}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    for (const m of lead.meetings) {
                                                      handleToggleExclude(m.id, !anyExcluded);
                                                    }
                                                  }}
                                                  className="p-1 rounded hover:bg-surface-500/80 text-gray-400 hover:text-white transition-colors"
                                                >
                                                  {anyExcluded ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {modalSelectorMeetings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalSelectorMeetings(null)} aria-hidden />
          <div className="relative w-full max-w-md rounded-xl bg-surface-800 border border-surface-500 shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white text-sm">Seleccione cuál quiere ver</h3>
              <button type="button" onClick={() => setModalSelectorMeetings(null)} className="p-1 rounded text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {modalSelectorMeetings.map((meeting) => (
                <li key={meeting.id}>
                  <button
                    type="button"
                    onClick={() => { setModalTranscripcionIA(meeting); setModalSelectorMeetings(null); }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-200 text-sm flex flex-col gap-0.5"
                  >
                    <span>{format(new Date(meeting.datetime), "dd/MM/yyyy 'a las' HH:mm")}</span>
                    <span className="text-[10px] text-gray-400">{outcomeVideollamadaToSpanish(meeting.outcome)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {modalTranscripcionIA && (
        <ModalTranscripcionIA
          meeting={modalTranscripcionIA}
          onClose={() => { setModalTranscripcionIA(null); setApiMeetingsForModal(null); }}
          onEdit={apiMeetingsForModal ? (meeting) => {
            const api = apiMeetingsForModal.find((r) => String(r.id) === meeting.id);
            if (api) {
              setModalTranscripcionIA(null);
              setApiMeetingsForModal(null);
              setEditingRecord({ id: api.id, nombre_lead: api.leadName, closer: api.closer, estado: api.categoria, facturacion: api.facturacion, cash_collected: api.cashCollected });
            }
          } : undefined}
        />
      )}
      {editingRecord && (
        <EditRecordSheet
          type="videollamada"
          record={editingRecord}
          advisors={data?.advisors?.map(a => ({ name: a.name, email: a.email })) ?? []}
          onClose={() => setEditingRecord(null)}
          onSaved={() => { setEditingRecord(null); refetch(); }}
        />
      )}
      <NuevoRegistroModal
        open={showNuevoModal}
        onClose={() => setShowNuevoModal(false)}
        onSuccess={() => refetch()}
        tipo="videollamada"
      />
      {metricaSheetOpen && systemConfigLoaded && (
        <MetricaEditSheet
          metricasConfig={metricasConfig}
          metricasManualData={metricasManualData}
          editingMetric={metricaEditingId ? metricasConfig.find((x) => x.id === metricaEditingId) ?? null : null}
          tipoInicial="manual"
          dashboardsPersonalizados={dashboardsPersonalizados}
          subdominio={typeof window !== "undefined" ? window.location.hostname.replace(`.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "leadmaster.com.co"}`, "").replace(".localhost", "") : undefined}
          onClose={() => { setMetricaSheetOpen(false); setMetricaEditingId(null); }}
          onSave={async (config, manualData) => {
            const prev = metricasConfig;
            const idx = prev.findIndex((x) => x.id === config.id);
            const next = [...prev];
            if (idx >= 0) {
              next[idx] = config;
            } else {
              const withRendimiento = {
                ...config,
                ubicacion: config.ubicacion === 'panel_ejecutivo' ? 'rendimiento' as const : config.ubicacion,
                paneles: config.paneles?.includes('rendimiento') ? config.paneles : [...(config.paneles ?? []), 'rendimiento' as UbicacionPanel],
              };
              next.push(withRendimiento);
            }
            const sorted = next.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));

            const res = await fetch('/api/data/system-config', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ metricas_config: sorted }),
            });

            if (!res.ok) return;

            setMetricasConfig(sorted);
            if (manualData !== undefined) {
              const nextManual = { ...metricasManualData, [config.id]: manualData };
              void fetch('/api/data/system-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ metricas_manual_data: nextManual }),
              });
              setMetricasManualData(nextManual);
            }
            setMetricaSheetOpen(false);
            setMetricaEditingId(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
