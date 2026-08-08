"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useT } from '@/contexts/LocaleContext';
import PageHeader from '@/components/dashboard/PageHeader';
import KPICard from '@/components/dashboard/KPICard';
import LeadsEnEspera from '@/components/dashboard/LeadsEnEspera';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import TagFilter from '@/components/dashboard/TagFilter';
import KpiTooltip from '@/components/dashboard/KpiTooltip';
import HelpTooltip from '@/components/dashboard/HelpTooltip';
import AdvisorDrillDown from '@/components/dashboard/AdvisorDrillDown';
import MapaTiempos from '@/components/dashboard/MapaTiempos';
import { useApiData } from '@/hooks/useApiData';
import type { DashboardResponse, DashboardAdvisorRow, LeadDetailItem, DashboardObjecionConDetalle, DashboardObjecionesPorCanal } from '@/types';
import Link from 'next/link';
import { Target, X, Trophy, GitBranch, Pencil, Eye, EyeOff, HelpCircle, Tag as TagIcon, Zap, SlidersHorizontal, Download, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { exportDashboardToExcel } from '@/lib/export-excel';
import { subDays, format } from 'date-fns';
import clsx from 'clsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency, formatBigNumber, formatPct, formatMinutes } from '@/lib/format';

const fm = formatCurrency;
const pctFmt = formatPct;
const minFmt = formatMinutes;

const defaultDateTo = new Date();
const defaultDateFrom = subDays(defaultDateTo, 7);

const OBJECTION_PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6'];
const LOSS_REASON_PIE_COLORS = ['#f43f5e', '#fb923c', '#a78bfa', '#38bdf8', '#34d399', '#fbbf24'];

const RANKING_COLS = [
  { key: 'leads', label: 'Leads' },
  { key: 'llamadas', label: 'Llamadas realizadas' },
  { key: 'speed_laboral', label: 'Speed to lead' },
  { key: 'contestadas', label: 'Llamadas contestadas' },
  { key: 'tasa_contestacion', label: 'Tasa contestación' },
  { key: 'agendadas', label: 'Citas agendadas' },
  { key: 'asistidas', label: 'Asistencia' },
  { key: 'tasa_asistencia', label: 'Tasa asistencia' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'tasa_cierre', label: 'Tasa cierre' },
  { key: 'dinero', label: 'Dinero entrante' },
] as const;

type RankingColKey = typeof RANKING_COLS[number]['key'];
const ALL_RANKING_COL_KEYS: RankingColKey[] = RANKING_COLS.map(c => c.key);

type RankingSortKey = 'score' | RankingColKey | (string & Record<never, never>);

function rankingSortValue(row: DashboardAdvisorRow, key: RankingSortKey): number {
  switch (key) {
    case 'score': return row.callsMade + row.meetingsBooked + row.meetingsAttended + (row.dineroEntrante ?? 0) / 1000;
    case 'leads': return row.totalLeads;
    case 'llamadas': return row.callsMade;
    case 'contestadas': return row.contestadas ?? 0;
    case 'agendadas': return row.meetingsBooked;
    case 'asistidas': return row.meetingsAttended;
    case 'ventas': return row.ventas ?? 0;
    case 'dinero': return row.dineroEntrante ?? 0;
    case 'speed_laboral': return row.speedToLeadLaboral ?? 0;
    case 'tasa_contestacion': return row.tasaContestacion ?? 0;
    case 'tasa_asistencia': return row.tasaAsistencia ?? 0;
    case 'tasa_cierre': return row.tasaCierre ?? 0;
    default: {
      if (key.startsWith('webhook:')) {
        const campo = key.slice(8);
        return Number(row.metricasWebhook?.[campo]) || 0;
      }
      return 0;
    }
  }
}

export default function DashboardPage() {
  const t = useT();
  const [dateFrom, setDateFrom] = useState(format(defaultDateFrom, 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(defaultDateTo, 'yyyy-MM-dd'));
  const [modalObjeciones, setModalObjeciones] = useState(false);
  const [selectedObjeccion, setSelectedObjeccion] = useState<string | null>(null);
  const [objecionCanalFilter, setObjecionCanalFilter] = useState<'todos' | 'videollamada' | 'chat' | 'llamada'>('todos');
  const [modalObjecionDetalle, setModalObjecionDetalle] = useState<{ name: string; details: DashboardObjecionConDetalle['details'] } | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showObjeciones, setShowObjeciones] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('dash_showObj') !== 'false' : true);
  const [showRazonesPerdida, setShowRazonesPerdida] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('dash_showRP') !== 'false' : true);
  const [drillDownAdvisor, setDrillDownAdvisor] = useState<{ name: string; email: string | null } | null>(null);
  const [modalLeads, setModalLeads] = useState<{ titulo: string; leads: LeadDetailItem[] } | null>(null);
  const [rankingColsOpen, setRankingColsOpen] = useState(false);
  const [rankingColsVisible, setRankingColsVisible] = useState<RankingColKey[]>(ALL_RANKING_COL_KEYS);
  const [rankingColsInitialized, setRankingColsInitialized] = useState(false);
  const rankingColsPopoverRef = useRef<HTMLDivElement>(null);
  const [rankingSortKey, setRankingSortKey] = useState<RankingSortKey>('score');
  const [rankingSortAsc, setRankingSortAsc] = useState(false);
  const [rankingSortInitialized, setRankingSortInitialized] = useState(false);
  const [leadFilter, setLeadFilter] = useState<'todos' | 'nuevos' | 'reactivados'>('todos');

  const toggleRankingSort = (key: RankingSortKey) => {
    if (rankingSortKey === key) {
      setRankingSortAsc(v => !v);
    } else {
      setRankingSortKey(key);
      setRankingSortAsc(false);
    }
  };

  const RankingSortIcon = ({ col }: { col: RankingSortKey }) =>
    rankingSortKey === col ? (
      rankingSortAsc ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />
    ) : null;

  const toggleObjeciones = () => setShowObjeciones((v) => { const next = !v; if (typeof window !== 'undefined') localStorage.setItem('dash_showObj', String(next)); return next; });
  const toggleRazonesPerdida = () => setShowRazonesPerdida((v) => { const next = !v; if (typeof window !== 'undefined') localStorage.setItem('dash_showRP', String(next)); return next; });

  const { data, loading, error, refetch } = useApiData<DashboardResponse>('/api/data/dashboard', { from: dateFrom, to: dateTo, tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined });

  const kpis = data?.kpis ?? {
    totalLeads: 0, callsMade: 0, contestadas: 0, answerRate: 0,
    meetingsBooked: 0, meetingsAttended: 0, meetingsCanceled: 0, meetingsClosed: 0,
    effectiveAppointments: 0, tasaCierre: 0, tasaAgendamiento: 0,
    revenue: 0, cashCollected: 0, avgTicket: 0, speedToLeadAvg: 0,
    avgAttempts: 0, attemptsToFirstContactAvg: 0, noShows: 0, pendientesAgendas: 0,
  };
  const objeciones = data?.objeciones ?? [];
  const objecionesPorCanal: DashboardObjecionesPorCanal[] = data?.objecionesPorCanal ?? [];
  const razonesPerdida = data?.razonesPerdida ?? [];
  const advisorRanking = data?.advisorRanking ?? [];

  const seccionesOcultas: string[] = Array.isArray(data?.configuracion_ui?.secciones_ocultas)
    ? (data.configuracion_ui.secciones_ocultas as string[])
    : [];

  // Objeciones filtradas por canal
  const objecionesVisibles: DashboardObjecionConDetalle[] = useMemo(() => {
    if (objecionCanalFilter === 'todos') return objeciones as DashboardObjecionConDetalle[];
    return objecionesPorCanal.find((c) => c.canal === objecionCanalFilter)?.objeciones ?? [];
  }, [objecionCanalFilter, objeciones, objecionesPorCanal]);

  // Extraer columnas webhook dinámicamente
  const webhookRankingCols = useMemo(() => {
    const fields = new Set<string>();
    for (const advisor of advisorRanking) {
      const webhook = advisor.metricasWebhook ?? {};
      for (const field of Object.keys(webhook)) {
        fields.add(field);
      }
    }
    return Array.from(fields)
      .sort()
      .map((field) => ({ key: field, label: field }));
  }, [advisorRanking]);

  const filteredAdvisorRanking = useMemo(() => {
    if (leadFilter === 'todos') return advisorRanking;
    const metricsKey = leadFilter === 'nuevos' ? 'metricsNuevos' : 'metricsReactivados';
    return advisorRanking
      .filter((a) => leadFilter === 'nuevos' ? a.leadsGenerados > 0 : a.leadsReactivados > 0)
      .map((a) => {
        const filtered = a[metricsKey];
        if (!filtered) return { ...a, totalLeads: leadFilter === 'nuevos' ? a.leadsGenerados : a.leadsReactivados };
        return { ...a, ...filtered };
      });
  }, [advisorRanking, leadFilter]);

  // Inicializar columnas de ranking desde la config del tenant (solo la primera vez que llegan datos)
  useEffect(() => {
    if (!rankingColsInitialized && data?.configuracion_ui?.ranking_columnas) {
      const saved = data.configuracion_ui.ranking_columnas as string[];
      const valid = saved.filter((k): k is RankingColKey => ALL_RANKING_COL_KEYS.includes(k as RankingColKey));
      if (valid.length > 0) setRankingColsVisible(valid);
      setRankingColsInitialized(true);
    } else if (!rankingColsInitialized && data) {
      setRankingColsInitialized(true);
    }
  }, [data, rankingColsInitialized]);

  useEffect(() => {
    if (!rankingSortInitialized && data?.configuracion_ui) {
      const base = data.configuracion_ui.ranking_metrica_base as string | undefined;
      if (base) setRankingSortKey(base);
      setRankingSortInitialized(true);
    } else if (!rankingSortInitialized && data) {
      setRankingSortInitialized(true);
    }
  }, [data, rankingSortInitialized]);

  // Cerrar popover al hacer click fuera
  useEffect(() => {
    if (!rankingColsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (rankingColsPopoverRef.current && !rankingColsPopoverRef.current.contains(e.target as Node)) {
        setRankingColsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [rankingColsOpen]);

  const saveRankingCols = async (cols: RankingColKey[]) => {
    try {
      await fetch('/api/data/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ranking_columnas: cols }),
      });
    } catch {
      // Fallo silencioso — la config se guarda en el siguiente load
    }
  };

  const toggleRankingCol = (key: RankingColKey) => {
    setRankingColsVisible(prev => {
      const next = prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key];
      void saveRankingCols(next);
      return next;
    });
  };

  if (loading) {
    return (
      <>
        <PageHeader title={t.dashboard.titulo} subtitle={t.dashboard.subtitulo} />
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="text-gray-400 text-sm animate-pulse">Cargando panel ejecutivo...</div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title={t.dashboard.titulo} subtitle={t.dashboard.subtitulo} />
        <div className="p-4 rounded-xl border border-red-500/50 bg-red-500/10 text-red-200 text-sm space-y-2">
          <p className="font-medium">Error al cargar el panel</p>
          <p className="text-gray-300 break-words">{error}</p>
          <button type="button" onClick={() => refetch()} className="px-3 py-1.5 rounded-lg bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/50 hover:bg-accent-cyan/30 text-sm font-medium">
            Reintentar
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.dashboard.titulo} subtitle={t.dashboard.subtitulo} />
      <div className="p-3 md:p-4 space-y-3 min-w-0 max-w-full overflow-x-hidden text-sm">
        <section className="flex flex-wrap items-center gap-2">
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onRange={(from, to) => { setDateFrom(from); setDateTo(to); }}
            defaultFrom={format(defaultDateFrom, 'yyyy-MM-dd')}
            defaultTo={format(defaultDateTo, 'yyyy-MM-dd')}
          />
          <TagFilter
            tags={data?.tagsDisponibles ?? []}
            selected={selectedTags}
            onChange={setSelectedTags}
          />
          {data && (
            <button
              type="button"
              onClick={() => exportDashboardToExcel(data, dateFrom, dateTo)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/20 text-accent-green border border-accent-green/50 hover:bg-accent-green/30 text-xs font-medium transition-colors ml-auto"
              title="Exportar KPIs a Excel"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Excel
            </button>
          )}
        </section>

        <LeadsEnEspera dateFrom={dateFrom} dateTo={dateTo} />

        <section className="rounded-xl border border-surface-500 bg-surface-800/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-accent-cyan" />
                Acciones rápidas
              </h2>
              <p className="text-[11px] text-gray-400 mt-1">
                Ejecuta tareas operativas sin salir del panel.
              </p>
            </div>
            <Link
              href="/dashboard/acciones-rapidas/video-recovery"
              className="inline-flex items-center px-3 py-1.5 rounded-lg bg-accent-cyan text-black text-xs font-semibold hover:bg-accent-cyan/90 transition-colors"
            >
              Recopilar citas
            </Link>
          </div>
        </section>

        {/* 📊 Ads Summary Widget — top of dashboard, before KPIs */}
        {data?.adsSummary?.hasAds && !seccionesOcultas.includes('panel_ads') && (
          <section className="rounded-lg p-3 section-futuristic">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                📊 Inversión publicitaria
                {data.adsSummary.plataformas.length > 0 && (
                  <span className="text-[10px] text-gray-500 normal-case font-normal">
                    · {data.adsSummary.plataformas.map(p => p === 'meta' ? '📘 Meta' : p === 'google' ? '🔍 Google' : p === 'tiktok' ? '🎵 TikTok' : p).join(' · ')}
                  </span>
                )}
              </h2>
              <Link href="/acquisition" className="text-[10px] text-accent-cyan hover:text-white transition-colors">
                Ver detalle →
              </Link>
            </div>
            {/* Note: CTR = unique clicks ÷ reach (Meta campaign level, not page-level) */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {([
                { label: 'Inversión', value: formatCurrency(data.adsSummary.gastoTotal), color: 'cyan', tooltip: 'Gasto total en Meta Ads en el período' },
                { label: 'Impresiones', value: formatBigNumber(data.adsSummary.impresiones), color: 'purple', tooltip: 'Veces que se mostró el anuncio' },
                { label: 'Clicks', value: String(data.adsSummary.clicks), color: 'blue', tooltip: 'Clicks totales en el anuncio' },
                { label: 'CTR', value: `${Number(data.adsSummary.ctr).toFixed(2)}%`, color: 'green', tooltip: 'Click-Through Rate a nivel de campaña en Meta. Puede diferir del CTR de la página web.' },
                { label: 'CPM', value: `$${Number(data.adsSummary.cpm).toFixed(2)}`, color: 'amber', tooltip: 'Costo por cada 1,000 impresiones' },
                { label: 'CPC', value: `$${Number(data.adsSummary.cpc).toFixed(2)}`, color: 'amber', tooltip: 'Costo promedio por click' },
                ...(data.adsSummary.camposExtra.frequency != null ? [{ label: 'Frecuencia', value: Number(data.adsSummary.camposExtra.frequency).toFixed(2), color: 'purple' as const, tooltip: 'Veces promedio que cada persona vio el anuncio' }] : []),
                ...(data.adsSummary.camposExtra.unique_ctr != null ? [{ label: 'Hook Rate', value: `${Number(data.adsSummary.camposExtra.unique_ctr).toFixed(2)}%`, color: 'green' as const, tooltip: 'CTR único: % de personas únicas que hicieron click (vs CTR que cuenta clicks múltiples del mismo usuario)' }] : []),
                ...(data.adsSummary.playRate != null && data.adsSummary.playRate > 0 ? [{ label: 'VSL Play Rate', value: `${Number(data.adsSummary.playRate).toFixed(1)}%`, color: 'purple' as const, tooltip: 'Promedio de días con actividad. Dato a nivel de player Vturb: % de visitantes únicos que presionaron play.' }] : []),
                ...(data.adsSummary.engagementRate != null && data.adsSummary.engagementRate > 0 ? [{ label: 'VSL Engagement', value: `${Number(data.adsSummary.engagementRate).toFixed(1)}%`, color: 'amber' as const, tooltip: 'Promedio de días con actividad. % de espectadores que pasaron el punto de pitch (engagement de Vturb).' }] : []),
              ] as { label: string; value: string; color: string; tooltip?: string }[]).map(({ label, value, color, tooltip }) => (
                <div key={label} title={tooltip} className={`rounded-lg p-2 border card-futuristic-${color} cursor-help`}>
                  <p className="text-[9px] font-medium text-gray-400 uppercase tracking-tight truncate">{label}</p>
                  <p className={`text-sm font-bold text-accent-${color} mt-0.5`}>{value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {!seccionesOcultas.includes('panel_kpis') && <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">KPIs operativos</h2>
            <Link
              href="/system?step=5"
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-accent-cyan transition-colors border border-surface-500 hover:border-accent-cyan/40 rounded-lg px-2 py-0.5"
              title="Agregar o editar métricas personalizadas"
            >
              <span className="text-base leading-none">+</span> Agregar métrica
            </Link>
          </div>
          {(() => {
            const metricasDelPanel = (data?.metricasComputadas ?? []).filter((m) => {
              if (Array.isArray(m.paneles)) return m.paneles.includes('panel_ejecutivo');
              return m.ubicacion === 'panel_ejecutivo' || m.ubicacion === 'ambos' || !m.ubicacion;
            });
            const metricasKPI = metricasDelPanel.filter((m) => m.visualizacion !== "barra");
            const metricasBarra = metricasDelPanel.filter((m) => m.visualizacion === "barra");
            return (
              <>
                <div className="grid grid-cols-2 min-[500px]:grid-cols-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-1.5 sm:gap-2 [grid-auto-rows:minmax(64px,auto)]">
                  {metricasKPI.map((m) => {
                    const color = m.color || 'green';
                    const raw = typeof m.valor === 'number' ? m.valor : parseFloat(String(m.valor)) || 0;
                    let display: string | number = m.valor;
                    switch (m.formato) {
                      case 'moneda': display = fm(raw); break;
                      case 'porcentaje': display = pctFmt(raw); break;
                      case 'tiempo': display = minFmt(raw); break;
                      case 'decimal': display = raw.toFixed(2); break;
                      case 'numero': display = typeof m.valor === 'number' ? m.valor : raw; break;
                    }
                    const formatSubVal = (v: number, fmt?: string) => {
                      if (fmt === 'porcentaje') return pctFmt(v);
                      if (fmt === 'moneda') return fm(v);
                      if (fmt === 'tiempo') return minFmt(v);
                      if (fmt === 'decimal') return v.toFixed(2);
                      return v;
                    };
                    const subs = m.subMetrics;
                    return (
                      <div key={m.id} className={`rounded-lg pl-3 overflow-hidden flex flex-col card-futuristic-${color} kpi-card-fixed relative group`}>
                        <p className="text-[9px] font-medium text-gray-400 uppercase tracking-tight mt-1 truncate">{m.nombre}</p>
                        <p className={`text-base font-bold mt-0.5 text-accent-${color} break-words`}>{display}</p>
                        {subs && subs.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {subs.map((s, i) => (
                              <React.Fragment key={s.label}>
                                {i > 0 && <span className="text-gray-600 text-[9px]">|</span>}
                                <span className="text-[9px] text-gray-400">
                                  {s.label}{' '}
                                  <span className={`font-semibold text-accent-${color}`}>
                                    {formatSubVal(s.value, s.formato || m.formato)}
                                  </span>
                                </span>
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                        {m.descripcion && !subs?.length && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{m.descripcion}</p>}
                        <div className="kpi-card-spacer" />
                        <Link
                          href={`/system?step=5&edit=${m.id}`}
                          className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-600/80 text-gray-400 hover:text-accent-cyan transition-all"
                          title="Editar métrica"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    );
                  })}
                </div>
                {metricasBarra.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {metricasBarra.map((m) => {
                      const color = m.color || 'green';
                      const series = m.seriesTiempo ?? [];
                      const raw = typeof m.valor === 'number' ? m.valor : parseFloat(String(m.valor)) || 0;
                      let displayTotal: string | number = m.valor;
                      switch (m.formato) {
                        case 'moneda': displayTotal = fm(raw); break;
                        case 'porcentaje': displayTotal = pctFmt(raw); break;
                        case 'tiempo': displayTotal = minFmt(raw); break;
                        case 'decimal': displayTotal = raw.toFixed(2); break;
                        case 'numero': displayTotal = typeof m.valor === 'number' ? m.valor : raw; break;
                      }
                      return (
                        <div key={m.id} className="rounded-lg p-3 section-futuristic relative group">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className={`text-xs font-semibold text-accent-${color} uppercase tracking-wider`}>{m.nombre}</span>
                              {m.descripcion && <span className="ml-2 text-[10px] text-gray-500">{m.descripcion}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold text-accent-${color}`}>{displayTotal}</span>
                              <Link
                                href={`/system?step=5&edit=${m.id}`}
                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-600/80 text-gray-400 hover:text-accent-cyan transition-all"
                                title="Editar métrica"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </div>
                          {series.length > 0 ? (
                            <div className="h-36">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
                                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" width={40} />
                                  <Tooltip contentStyle={{ background: '#22262e', border: '1px solid #2a2f3a', borderRadius: '8px', fontSize: '11px' }} />
                                  <Bar dataKey="valor" name={m.nombre} fill={`var(--color-accent-${color}, #4dabf7)`} radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <p className="text-[11px] text-gray-500 text-center py-4">Sin datos en el período seleccionado</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </section>}


        {/* 🎯 Progreso de Metas por Canal */}
        {(data?.alertasMetas?.length ?? 0) > 0 && !seccionesOcultas.includes('panel_metas') && (() => {
          const alertas = data!.alertasMetas!;
          const cumplidas = alertas.filter((a) => a.cumple).length;
          const canales: Array<{ key: "llamadas" | "videollamadas" | "chats" | "general"; label: string; emoji: string; borderColor: string; textColor: string }> = [
            { key: "llamadas",      label: "Llamadas",      emoji: "📞", borderColor: "border-blue-500/30",   textColor: "text-blue-400" },
            { key: "videollamadas", label: "Citas", emoji: "🎥", borderColor: "border-purple-500/30", textColor: "text-purple-400" },
            { key: "chats",         label: "Chats",         emoji: "💬", borderColor: "border-green-500/30",  textColor: "text-green-400" },
            { key: "general",       label: "General",       emoji: "📊", borderColor: "border-surface-500",   textColor: "text-gray-400" },
          ];
          return (
            <section className="rounded-xl border border-surface-500 bg-surface-800/80 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  🎯 {t.dashboard.progresoMetas}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-purple/20 text-accent-purple border border-accent-purple/40 font-semibold">
                  {cumplidas}/{alertas.length} cumplidas
                </span>
              </div>
              {canales.map(({ key, label, emoji, borderColor, textColor }) => {
                const grupo = alertas.filter((a) => a.canal === key);
                if (grupo.length === 0) return null;
                return (
                  <div key={key} className={`rounded-lg border ${borderColor} bg-surface-700/30 p-2.5 space-y-2`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wider ${textColor}`}>{emoji} {label}</p>
                    {grupo.map((alerta) => {
                      const isRevenue = alerta.unidad === "$";
                      const isPct = alerta.unidad === "%";
                      const isMin = alerta.unidad === "min";

                      const fmtVal = (v: number) => {
                        if (isRevenue) return fm(v);
                        if (isPct) return `${v.toFixed(1)}%`;
                        if (isMin) return `${v.toFixed(1)} min`;
                        return Math.round(v).toLocaleString("es-CO");
                      };

                      const metaLabel = isMin
                        ? `≤ ${fmtVal(alerta.meta)}`
                        : fmtVal(alerta.meta);

                      const unitLabel = alerta.unidad && !isPct && !isRevenue && !isMin
                        ? ` ${alerta.unidad}`
                        : "";

                      // Para invertidas: barra verde cuando actual < meta
                      const effectivePct = alerta.invertido
                        ? alerta.actual <= 0
                          ? 0
                          : Math.min(100, Math.round((alerta.meta / alerta.actual) * 100))
                        : Math.min(100, alerta.pct);

                      const colorClass = alerta.cumple
                        ? "bg-accent-green"
                        : effectivePct >= 70
                          ? "bg-accent-amber"
                          : "bg-accent-red";
                      const textColorPct = alerta.cumple
                        ? "text-accent-green"
                        : effectivePct >= 70
                          ? "text-accent-amber"
                          : "text-accent-red";

                      return (
                        <div key={alerta.label} className="rounded-md bg-surface-700/60 p-2 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-gray-300">{alerta.label}</span>
                            {alerta.sinDatos
                              ? <span className="text-[10px] text-gray-500 italic">Sin datos aún</span>
                              : <span className={`text-xs font-bold ${textColorPct}`}>{alerta.cumple ? "✓ " : ""}{effectivePct}%</span>
                            }
                          </div>
                          {!alerta.sinDatos && (
                            <div className="w-full h-1.5 rounded-full bg-surface-600 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${colorClass}`}
                                style={{ width: `${effectivePct}%` }}
                              />
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
                            <span>
                              {alerta.sinDatos ? "—" : <><span className="text-gray-300 font-medium">{fmtVal(alerta.actual)}</span>{unitLabel}</>}
                              {" de "}
                              <span className="text-gray-300 font-medium">{metaLabel}</span>{unitLabel && !isMin ? unitLabel : ""}
                            </span>
                            {alerta.invertido && <span className="text-[9px] text-gray-600">🔻 menor = mejor</span>}
                          </div>
                          {alerta.historialDiario && alerta.historialDiario.length > 1 && (
                            <div className="mt-1.5 space-y-0.5">
                              <p className="text-[9px] text-gray-600 uppercase tracking-wider mb-1">Cumplimiento diario</p>
                              <div className="flex flex-wrap gap-1">
                                {alerta.historialDiario.map((d) => (
                                  <div
                                    key={d.fecha}
                                    title={`${d.fecha}: ${d.actual} / ${d.meta} llamadas`}
                                    className={`w-5 h-5 rounded-sm flex items-center justify-center text-[8px] font-bold cursor-default ${
                                      d.actual === 0
                                        ? "bg-surface-600 text-gray-600"
                                        : d.cumple
                                          ? "bg-accent-green/25 text-accent-green"
                                          : "bg-accent-red/25 text-accent-red"
                                    }`}
                                  >
                                    {d.fecha.slice(8)} {/* día del mes */}
                                  </div>
                                ))}
                              </div>
                              <p className="text-[9px] text-gray-600">
                                {alerta.historialDiario.filter((d) => d.cumple).length} de {alerta.historialDiario.length} días cumplidos
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          );
        })()}


        {Object.keys(data?.tagCounts ?? {}).length > 0 && !seccionesOcultas.includes('panel_etiquetas') && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <TagIcon className="w-3.5 h-3.5 text-accent-amber" />
              Etiquetas
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(data?.tagCounts ?? {})
                .sort(([, a], [, b]) => b - a)
                .map(([tag, count]) => (
                  <span
                    key={tag}
                    onClick={() => setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
                    className={clsx(
                      'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium cursor-pointer transition-all border',
                      selectedTags.includes(tag)
                        ? 'bg-accent-amber/20 text-accent-amber border-accent-amber/50'
                        : 'bg-surface-700 text-gray-400 border-surface-500 hover:border-accent-amber/30 hover:text-gray-300',
                    )}
                  >
                    {tag} <span className="text-[10px] opacity-70">{count}</span>
                  </span>
                ))}
            </div>
          </section>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          {!seccionesOcultas.includes('panel_objeciones') && <section className="rounded-lg p-3 section-futuristic">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-accent-red" />
                Objeciones más comunes
                <HelpTooltip titulo="Objeciones más comunes" contenido="Objeciones detectadas por IA en citas (Fathom), chats (WhatsApp) y llamadas (Twilio / Call-AI). Incluye el contexto de la conversación y la respuesta literal del asesor a cada objeción, extraídos automáticamente de la transcripción." />
              </h2>
              <button type="button" onClick={toggleObjeciones} className="p-1 rounded hover:bg-surface-600 text-gray-500 hover:text-gray-300 transition-colors" title={showObjeciones ? 'Ocultar' : 'Mostrar'}>
                {showObjeciones ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {showObjeciones && (
              <div>
                {/* Canal filter tabs */}
                {objecionesPorCanal.length > 0 && (
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {(['todos', ...objecionesPorCanal.map((c) => c.canal)] as const).map((tab) => {
                      const label = tab === 'todos' ? 'Todos' : objecionesPorCanal.find((c) => c.canal === tab)?.label ?? tab;
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setObjecionCanalFilter(tab)}
                          className={clsx(
                            'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                            objecionCanalFilter === tab
                              ? 'bg-accent-red text-white'
                              : 'bg-surface-700 text-gray-400 hover:bg-surface-600 hover:text-white',
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-2 items-start">
                  <div className="h-36 sm:h-40 w-full min-h-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                        <Pie data={objecionesVisibles} dataKey="count" nameKey="name" cx="50%" cy="45%" innerRadius="58%" outerRadius="78%" paddingAngle={2}>
                          {objecionesVisibles.map((_, i) => (
                            <Cell key={i} fill={OBJECTION_PIE_COLORS[i % OBJECTION_PIE_COLORS.length]} stroke="transparent" />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a' }}
                          formatter={(_, name, props) => {
                            const p = props?.payload as { count?: number; percent?: number } | undefined;
                            return [`${p?.count ?? 0}x (${p?.percent ?? 0}%)`, String(name).charAt(0).toUpperCase() + String(name).slice(1)];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-1">
                    {objecionesVisibles.map((o, i) => (
                      <li key={o.name}>
                        <button
                          type="button"
                          onClick={() => setModalObjecionDetalle({ name: o.name, details: (o as DashboardObjecionConDetalle).details ?? [] })}
                          className="w-full flex items-center justify-between gap-2 rounded-md bg-surface-700 px-2.5 py-1.5 text-left hover:bg-surface-600"
                        >
                          <span className="flex items-center gap-2 font-medium text-white capitalize">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: OBJECTION_PIE_COLORS[i % OBJECTION_PIE_COLORS.length] }} />
                            {o.name}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-accent-red/20 text-accent-red text-sm font-medium">{o.count}x</span>
                        </button>
                      </li>
                    ))}
                    {objecionesVisibles.length === 0 && (
                      <li className="text-xs text-gray-500 py-2 text-center">Sin objeciones en este canal</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </section>}
        </div>

        {razonesPerdida.length > 0 && !seccionesOcultas.includes('panel_razones_perdida') && (
          <section className="rounded-lg p-3 section-futuristic">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-rose-400" />
                Razones de pérdida
              </h2>
              <button type="button" onClick={toggleRazonesPerdida} className="p-1 rounded hover:bg-surface-600 text-gray-500 hover:text-gray-300 transition-colors" title={showRazonesPerdida ? 'Ocultar' : 'Mostrar'}>
                {showRazonesPerdida ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {showRazonesPerdida && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-2 items-start">
                <div className="h-36 sm:h-40 w-full min-h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                      <Pie data={razonesPerdida} dataKey="count" nameKey="name" cx="50%" cy="45%" innerRadius="58%" outerRadius="78%" paddingAngle={2}>
                        {razonesPerdida.map((r, i) => (
                          <Cell key={r.id} fill={r.color ?? LOSS_REASON_PIE_COLORS[i % LOSS_REASON_PIE_COLORS.length]} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a' }}
                        formatter={(_, name, props) => {
                          const p = props?.payload as { count?: number; percent?: number } | undefined;
                          return [`${p?.count ?? 0}x (${p?.percent ?? 0}%)`, String(name)];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-1">
                  {razonesPerdida.map((r, i) => (
                    <li key={r.id}>
                      <div className="w-full flex items-center justify-between gap-2 rounded-md bg-surface-700 px-2.5 py-1.5">
                        <span className="flex items-center gap-2 font-medium text-white">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color ?? LOSS_REASON_PIE_COLORS[i % LOSS_REASON_PIE_COLORS.length] }} />
                          {r.name}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-sm font-medium">{r.count}x</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {!seccionesOcultas.includes('panel_ranking') && <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <Users className="w-4 h-4" />
                Ranking por asesor
                <HelpTooltip
                  titulo="Ranking por asesor"
                  contenido="Compara el desempeño de cada asesor. Puedes ORDENAR el ranking por cualquier métrica: haz click en el encabezado de la columna (Leads, Llamadas, Agendadas, Asistidas, Facturación, etc.). Un primer click ordena de mayor a menor y un segundo click invierte el orden; la flecha indica la columna y el sentido activos. Por defecto se ordena por Score. Nota: la suma de 'Citas agendadas' por asesor puede ser mayor al total AGENDADAS de la cabecera cuando un mismo lead se agenda con más de un closer — cada asesor recibe crédito de su propia cita, mientras que el total general cuenta al lead una sola vez."
                  comoProbar="Haz click en 'Llamadas' para ver quién hizo más llamadas; vuelve a hacer click para ver quién hizo menos. Repite con cualquier otra columna."
                />
              </h2>
              <div className="flex items-center rounded-lg border border-surface-500 overflow-hidden">
                {([
                  { value: 'todos', label: 'Todos' },
                  { value: 'nuevos', label: 'Nuevos' },
                  { value: 'reactivados', label: 'Reactivados' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLeadFilter(opt.value)}
                    className={clsx(
                      'px-2.5 py-1 text-[11px] font-medium transition-colors',
                      leadFilter === opt.value
                        ? 'bg-accent-cyan/20 text-accent-cyan'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-surface-700',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <HelpTooltip
                titulo="Filtro: Nuevos vs Reactivados"
                contenido="Filtra los leads del ranking según su origen. 'Nuevos' son leads que llegaron al CRM por primera vez en el período seleccionado (evento de contacto creado). 'Reactivados' son leads que ya existían antes del período pero tuvieron actividad (llamada o cita) durante el mismo — útil para medir campañas de reactivación. 'Todos' muestra ambos sin filtro."
                comoProbar="Selecciona 'Nuevos' para ver solo leads captados en este período. Selecciona 'Reactivados' para ver leads antiguos con actividad reciente."
              />
            </div>
            <div className="relative" ref={rankingColsPopoverRef}>
              <button
                type="button"
                onClick={() => setRankingColsOpen(v => !v)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-white hover:bg-surface-700 transition-colors"
                title="Configurar columnas"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Columnas
              </button>
              {rankingColsOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-lg border border-surface-500 bg-surface-800 shadow-xl p-2 flex flex-col gap-1">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider px-1 pb-1">Mostrar columnas</p>
                  {RANKING_COLS.map(col => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rankingColsVisible.includes(col.key)}
                        onChange={() => toggleRankingCol(col.key)}
                        className="accent-accent-cyan w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="text-xs text-gray-300">{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-surface-500 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-700 text-left text-gray-400">
                    <th className="px-2 py-2 font-medium">Asesor</th>
                    {rankingColsVisible.includes('leads') && <th className="px-2 py-2 font-medium cursor-pointer hover:text-white" onClick={() => toggleRankingSort('leads')}><span title="Leads únicos trabajados en el período, sin importar el canal: llamada, chat o cita.">{leadFilter === 'nuevos' ? 'Leads nuevos' : leadFilter === 'reactivados' ? 'Leads reactivados' : 'Leads'} ⓘ</span><RankingSortIcon col="leads" /></th>}
                    {rankingColsVisible.includes('llamadas') && <th className="px-2 py-2 font-medium cursor-pointer hover:text-white" onClick={() => toggleRankingSort('llamadas')}>Llamadas realizadas<RankingSortIcon col="llamadas" /></th>}
                    {rankingColsVisible.includes('speed_laboral') && <th className="px-2 py-2 font-medium cursor-pointer hover:text-white" onClick={() => toggleRankingSort('speed_laboral')}><span title="Minutos promedio EN HORARIO LABORAL desde que el lead se asignó al asesor hasta su primera llamada.">Speed to lead ⓘ</span><RankingSortIcon col="speed_laboral" /></th>}
                    {rankingColsVisible.includes('contestadas') && <th className="px-2 py-2 font-medium cursor-pointer hover:text-white" onClick={() => toggleRankingSort('contestadas')}>Llamadas contestadas<RankingSortIcon col="contestadas" /></th>}
                    {rankingColsVisible.includes('tasa_contestacion') && <th className="px-2 py-2 font-medium cursor-pointer hover:text-white" onClick={() => toggleRankingSort('tasa_contestacion')}><span title="Llamadas contestadas ÷ Llamadas realizadas del asesor.">Tasa contestación ⓘ</span><RankingSortIcon col="tasa_contestacion" /></th>}
                    {rankingColsVisible.includes('agendadas') && <th className="px-2 py-2 font-medium cursor-pointer hover:text-white" onClick={() => toggleRankingSort('agendadas')}><span title="Citas agendadas únicas en el período (leads únicos, sin contar múltiples estados del mismo lead).">Citas agendadas ⓘ</span><RankingSortIcon col="agendadas" /></th>}
                    {rankingColsVisible.includes('asistidas') && <th className="px-2 py-2 font-medium cursor-pointer hover:text-white" onClick={() => toggleRankingSort('asistidas')}><span title="Leads que se presentaron a su cita (asistieron).">Asistencia ⓘ</span><RankingSortIcon col="asistidas" /></th>}
                    {rankingColsVisible.includes('tasa_asistencia') && <th className="px-2 py-2 font-medium cursor-pointer hover:text-white" onClick={() => toggleRankingSort('tasa_asistencia')}><span title="Asistidas ÷ (Agendadas − Pendientes − Canceladas) del asesor.">Tasa asistencia ⓘ</span><RankingSortIcon col="tasa_asistencia" /></th>}
                    {rankingColsVisible.includes('ventas') && <th className="px-2 py-2 font-medium cursor-pointer hover:text-white" onClick={() => toggleRankingSort('ventas')}><span title="Número de ventas del período de los leads de este asesor (etiqueta de venta en GHL).">Ventas ⓘ</span><RankingSortIcon col="ventas" /></th>}
                    {rankingColsVisible.includes('tasa_cierre') && <th className="px-2 py-2 font-medium cursor-pointer hover:text-white" onClick={() => toggleRankingSort('tasa_cierre')}><span title="Ventas ÷ Citas asistidas del asesor.">Tasa cierre ⓘ</span><RankingSortIcon col="tasa_cierre" /></th>}
                    {rankingColsVisible.includes('dinero') && <th className="px-2 py-2 font-medium cursor-pointer hover:text-white" onClick={() => toggleRankingSort('dinero')}><span title="Monto apartado + monto vendido del período de los leads de este asesor.">Dinero entrante ⓘ</span><RankingSortIcon col="dinero" /></th>}
                    {webhookRankingCols.map((col) => (
                      <th key={col.key} className="px-2 py-2 font-medium">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...filteredAdvisorRanking]
                    .sort((a, b) => {
                      const diff = rankingSortValue(b, rankingSortKey) - rankingSortValue(a, rankingSortKey);
                      return rankingSortAsc ? -diff : diff;
                    })
                    .map((a, i) => (
                      <React.Fragment key={a.advisorEmail ?? a.advisorName}>
                        <tr onClick={() => setDrillDownAdvisor({ name: a.advisorName, email: a.advisorEmail })} className={clsx('border-t border-surface-500 hover:bg-surface-700/50 cursor-pointer', i === 0 && 'bg-accent-green/10')}>
                          <td className="px-2 py-2">
                            {i === 0 ? (
                              <span className="inline-flex items-center gap-1.5 font-medium text-accent-amber">
                                <Trophy className="w-4 h-4" /> {a.advisorName} <span className="text-[10px] uppercase">Mejor</span>
                              </span>
                            ) : (
                              <><span className="inline-block w-2 h-2 rounded-full bg-accent-green mr-2" />{a.advisorName}</>
                            )}
                          </td>
                          {rankingColsVisible.includes('leads') && (
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); if (a.leadsConActividadDetalle.length > 0) setModalLeads({ titulo: `Leads — ${a.advisorName}`, leads: a.leadsConActividadDetalle }); }}
                                className={clsx('tabular-nums', a.totalLeads > 0 ? 'text-white underline decoration-dashed underline-offset-2 cursor-pointer hover:text-accent-cyan' : 'text-gray-500')}
                              >
                                {a.totalLeads}
                              </button>
                            </td>
                          )}
                          {rankingColsVisible.includes('llamadas') && <td className="px-2 py-2 text-accent-cyan">{a.callsMade}</td>}
                          {rankingColsVisible.includes('speed_laboral') && <td className="px-2 py-2 text-gray-300">{a.speedToLeadLaboral != null ? minFmt(a.speedToLeadLaboral) : '—'}</td>}
                          {rankingColsVisible.includes('contestadas') && <td className="px-2 py-2 text-accent-green">{a.contestadas ?? 0}</td>}
                          {rankingColsVisible.includes('tasa_contestacion') && <td className="px-2 py-2">{pctFmt(a.tasaContestacion ?? 0)}</td>}
                          {rankingColsVisible.includes('agendadas') && <td className="px-2 py-2 text-accent-purple">{a.meetingsBooked}</td>}
                          {rankingColsVisible.includes('asistidas') && <td className="px-2 py-2 text-accent-cyan">{a.meetingsAttended}</td>}
                          {rankingColsVisible.includes('tasa_asistencia') && <td className="px-2 py-2">{pctFmt(a.tasaAsistencia ?? 0)}</td>}
                          {rankingColsVisible.includes('ventas') && <td className="px-2 py-2 text-accent-green">{a.ventas ?? 0}</td>}
                          {rankingColsVisible.includes('tasa_cierre') && <td className="px-2 py-2">{pctFmt(a.tasaCierre ?? 0)}</td>}
                          {rankingColsVisible.includes('dinero') && <td className="px-2 py-2 text-accent-green">{fm(a.dineroEntrante ?? 0)}</td>}
                          {webhookRankingCols.map((col) => (
                            <td key={col.key} className="px-2 py-2 text-gray-300">
                              {a.metricasWebhook?.[col.key] ?? '—'}
                            </td>
                          ))}
                        </tr>
                      </React.Fragment>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>}

        {!seccionesOcultas.includes('panel_mapa_tiempos') && <section>
          <MapaTiempos dateFrom={dateFrom} dateTo={dateTo} />
        </section>}
      </div>

      {modalObjecionDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModalObjecionDetalle(null)} aria-hidden />
          <div className="relative w-full max-w-lg max-h-[85vh] rounded-xl bg-surface-800 border border-surface-500 shadow-xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-surface-500 shrink-0">
              <h3 className="font-semibold text-white capitalize">Objeción: {modalObjecionDetalle.name}</h3>
              <button type="button" onClick={() => setModalObjecionDetalle(null)} className="p-2 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-4">
              {modalObjecionDetalle.details.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Sin detalle disponible</p>
              ) : (
                <ul className="space-y-3">
                  {modalObjecionDetalle.details.map((d, i) => (
                    <li key={i} className="rounded-lg bg-surface-700 p-3 space-y-1">
                      <p className="text-sm text-white italic">&ldquo;{d.quote}&rdquo;</p>
                      {d.contexto && (
                        <p className="text-xs text-gray-400 pl-3 border-l-2 border-amber-500/30">
                          <span className="text-gray-500">Contexto:</span> {d.contexto}
                        </p>
                      )}
                      {d.respuestaVendedor && (
                        <p className="text-xs text-gray-400 pl-3 border-l-2 border-accent-cyan/30">
                          <span className="text-gray-500">Asesor:</span> &ldquo;{d.respuestaVendedor}&rdquo;
                        </p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
                        {d.leadName && <span><span className="text-gray-500">Lead:</span> {d.leadName}</span>}
                        {d.advisorName && <span><span className="text-gray-500">Asesor:</span> {d.advisorName}</span>}
                        {d.datetime && <span><span className="text-gray-500">Fecha:</span> {new Date(d.datetime).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {modalLeads && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModalLeads(null)} aria-hidden />
          <div className="relative w-full max-w-lg max-h-[85vh] rounded-xl bg-surface-800 border border-surface-500 shadow-xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-surface-500 shrink-0">
              <h3 className="font-semibold text-white text-sm">{modalLeads.titulo}</h3>
              <button type="button" onClick={() => setModalLeads(null)} className="p-2 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-4">
              {modalLeads.leads.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">Sin datos</p>
              ) : (
                <ul className="space-y-2">
                  {modalLeads.leads.map((lead, idx) => (
                    <li key={lead.email ?? lead.telefono ?? idx} className="rounded-lg bg-surface-700 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-white truncate">{lead.nombre ?? '—'}</span>
                        {lead.ultimaActividad && <span className="text-gray-500 shrink-0">{lead.ultimaActividad}</span>}
                      </div>
                      {(lead.email || lead.telefono) && (
                        <div className="flex gap-3 mt-0.5 text-gray-400">
                          {lead.email && <span>{lead.email}</span>}
                          {lead.telefono && <span>{lead.telefono}</span>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {drillDownAdvisor && (
        <AdvisorDrillDown
          advisorName={drillDownAdvisor.name}
          advisorEmail={drillDownAdvisor.email}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onClose={() => setDrillDownAdvisor(null)}
        />
      )}
    </>
  );
}
