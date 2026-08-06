"use client";

import React, { useState, useMemo, Fragment, useEffect } from 'react';
import { useT } from '@/contexts/LocaleContext';
import KpiTooltip from '@/components/dashboard/KpiTooltip';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import { useApiData } from '@/hooks/useApiData';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { ChatsResponse, ApiChatLead } from '@/types';
import type { MetricaConfig } from '@/lib/db/schema';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Pencil, User, X, Plus, Sparkles, AlertTriangle, Settings, CheckCircle2, Phone, ExternalLink } from 'lucide-react';
import NuevoRegistroModal from '@/components/dashboard/NuevoRegistroModal';
import EditRecordSheet from '@/components/dashboard/EditRecordSheet';
import InsightsChat from '@/components/dashboard/InsightsChat';
import { useUserFilter } from '@/contexts/UserFilterContext';
import { usePerformanceFilter } from '@/contexts/PerformanceFilterContext';
import { exportChats } from '@/lib/export-performance';
import { Download } from 'lucide-react';

interface CriteriosData {
  categorias: string[] | null;
  categoriasDisponibles: string[];
}

const minFmt = (s: number | null) => {
  if (s == null || s === 0) return '—';
  return s < 60 ? `${Math.round(s)}s` : `${(s / 60).toFixed(1)} min`;
};

/** Formatea minutos de espera con colores: verde <15, amarillo <60, rojo ≥60 */
function waitBadge(minutes: number | null): React.ReactNode {
  if (minutes == null) return <span className="text-gray-500">—</span>;
  if (minutes < 15) return <span className="text-green-400 font-medium">{minutes}m</span>;
  if (minutes < 60) return <span className="text-accent-amber font-medium">{minutes}m ⚠️</span>;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const label = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${minutes}m`;
  return <span className="text-red-400 font-bold">{label} 🔴</span>;
}

const chatKpiTooltips = {
  asignados: { significado: 'Cantidad de conversaciones de chat en el rango.', calculo: 'Conteo de registros en chats_logs.' },
  activos: { significado: 'Chats donde el agente respondió al menos una vez.', calculo: 'Chats con al menos un mensaje de role "agent".' },
  contactados: { significado: 'Chats donde un asesor respondió al menos una vez.', calculo: 'Conteo de chats con agentMessages > 0 en el período.' },
  seguimientos: { significado: 'Total de mensajes en todas las conversaciones.', calculo: 'Suma de todos los mensajes del JSONB.' },
  speedToLead: { significado: 'Tiempo promedio desde primer mensaje del lead hasta primera respuesta del agente.', calculo: 'Promedio de (timestamp primer msg agente − timestamp primer msg lead).' },
  sinRespuesta: { significado: 'Chats donde el lead esperó respuesta y aún no hubo una del agente.', calculo: 'Chats con minutesSinceLastLeadMsg != null (el agente no respondió después del último mensaje del lead).' },
  sinContactar: { significado: '% de chats donde ningún humano respondió al lead.', calculo: 'Chats sin humanTookOver / total × 100.' },
  msgsPromedio: { significado: 'Promedio de mensajes por chat (lead + agente).', calculo: 'Total de mensajes / número de chats asignados en el período.' },
};

type Canal = 'todos' | 'WhatsApp' | 'FB' | 'IG' | 'SMS' | 'Custom';

const CANAL_EMOJI: Record<string, string> = {
  WhatsApp: '📱',
  FB: '👤',
  IG: '📸',
  SMS: '💬',
  Custom: '⚙️',
};

const CANAL_LABELS: Canal[] = ['todos', 'WhatsApp', 'FB', 'IG', 'SMS', 'Custom'];

function detectCanal(chat: ApiChatLead): string {
  if (!chat.messages || chat.messages.length === 0) return 'Custom';
  const firstMsg = chat.messages[0];
  const t = (firstMsg?.type ?? '').toLowerCase();
  if (t.includes('whatsapp') || t === 'wa') return 'WhatsApp';
  if (t.includes('fb') || t.includes('facebook') || t.includes('messenger')) return 'FB';
  if (t.includes('ig') || t.includes('instagram')) return 'IG';
  if (t.includes('sms')) return 'SMS';
  return 'Custom';
}

/** Convierte una categoría IA cruda a label capitalizada legible */
function categoriaLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
}

/** Formatea el valor de una métrica custom según su formato */
function fmtMetricaValue(value: number | null, formato: MetricaConfig["formato"]): string {
  if (value === null || value === undefined) return '—';
  switch (formato) {
    case 'moneda': return `$${value.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
    case 'porcentaje': return `${value.toFixed(1)}%`;
    case 'tiempo': return value < 60 ? `${Math.round(value)}s` : `${(value / 60).toFixed(1)} min`;
    case 'decimal': return value.toFixed(2);
    default: return value.toLocaleString('es-MX', { maximumFractionDigits: 1 });
  }
}

const OBJECION_CATEGORIA_EMOJI: Record<string, string> = {
  precio: '💰',
  tiempo: '⏰',
  confianza: '🤝',
  competencia: '⚔️',
  necesidad: '🤔',
  autoridad: '👔',
  otra: '💬',
};

export default function PerformanceChatsPage() {
  const t = useT();
  const pathname = usePathname();
  // Ruta base del panel asesor — permite navegar directo al detalle de un agente
  const asesorBasePath = pathname.replace('/performance/chats', '/asesor');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 14), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expandedAdvisorId, setExpandedAdvisorId] = useState<string | null>(null);
  const [modalConversacion, setModalConversacion] = useState<ApiChatLead | null>(null);
  const [editingRecord, setEditingRecord] = useState<{id: number; nombre_lead: string | null; closer: string | null; estado: string | null} | null>(null);
  const [canalActivo, setCanalActivo] = useState<Canal>('todos');
  const [soloSinContactar, setSoloSinContactar] = useState(false);
  const [soloCalificados, setSoloCalificados] = useState(false);
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [showInsightsChat, setShowInsightsChat] = useState(false);

  // Criterios de calificación — configurados por la cuenta
  const [criteriosData, setCriteriosData] = useState<CriteriosData | null>(null);

  const { asesores: asesoresCtx } = useUserFilter();
  const { isAdvisorVisible, setAdvisorOptions, selectedAdvisors } = usePerformanceFilter();
  const { data, loading, refetch } = useApiData<ChatsResponse>('/api/data/chats', { from: dateFrom, to: dateTo });

  useEffect(() => {
    if (!data?.advisorMetrics) return;
    const options = Object.entries(data.advisorMetrics).map(([key, m]) => ({
      key,
      name: m.advisorName || key,
    }));
    setAdvisorOptions(options);
  }, [data?.advisorMetrics, setAdvisorOptions]);

  // Cargar criterios de calificación
  useEffect(() => {
    fetch('/api/data/criterios-calificacion')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCriteriosData(d as CriteriosData); })
      .catch(() => undefined);
  }, []);

  // Mapa nombre → email usando asesores del contexto (tienen email real)
  const nameToEmail = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of asesoresCtx) {
      const email = a.email ?? a.id;
      if (a.name) map[a.name.toLowerCase()] = email;
      if (email) map[email.toLowerCase()] = email;
    }
    return map;
  }, [asesoresCtx]);

  const aggRaw = data?.agg ?? { assigned: 0, activos: 0, seguimientosTotal: 0, speedAvg: 0 };

  const visibleChats = useMemo(() => {
    if (!data?.chats) return [];
    const INVALID = new Set(['', 'agente', 'agent', 'bot', 'por asignar', 'workflow', 'api/bot', 'campaña', 'campaign']);
    return data.chats.filter((c) => {
      const raw = (c.asesorAsignado?.trim() || c.agentName?.trim() || '').toLowerCase();
      const key = (!raw || INVALID.has(raw)) ? 'Sin asignar' : (c.asesorAsignado?.trim() || c.agentName?.trim())!;
      return isAdvisorVisible(key);
    });
  }, [data?.chats, isAdvisorVisible]);

  const agg = useMemo(() => {
    if (!data?.chats || visibleChats.length === data.chats.length) return aggRaw;
    const activos = visibleChats.filter((c) => ((c as { agentMessages?: number }).agentMessages ?? 0) > 0).length;
    const seguimientosTotal = visibleChats.reduce((s, c) => s + ((c as { totalMessages?: number }).totalMessages ?? 0), 0);
    const speeds = visibleChats.map((c) => (c as { speedToLeadSec?: number | null }).speedToLeadSec).filter((v): v is number => v != null && v > 0);
    const speedAvg = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    return { assigned: visibleChats.length, activos, seguimientosTotal, speedAvg };
  }, [aggRaw, data?.chats, visibleChats]);

  const extraKpis = useMemo(() => {
    if (!data) return { sinRespuesta: 0, pctSinContactar: 0, calificados: 0 };
    const chats = visibleChats;
    const sinRespuesta = chats.filter((c) => c.minutesSinceLastLeadMsg != null).length;
    const isPerdido = (e: string | null) => { const l = (e ?? '').trim().toLowerCase(); return l === 'perdido' || l === 'perdida'; };
    const sinContactar = chats.filter((c) => !c.humanTookOver && !isPerdido(c.estado)).length;
    const pctSinContactar = chats.length > 0 ? Math.round((sinContactar / chats.length) * 100) : 0;
    const criterios = criteriosData?.categorias;
    const calificados = chats.filter((c) =>
      criterios == null ? false : c.iaCategoria != null && criterios.includes(c.iaCategoria),
    ).length;
    return { sinRespuesta, pctSinContactar, calificados };
  }, [data, visibleChats, criteriosData]);

  /**
   * Determina si un chat califica según los criterios configurados.
   * criterios=null → no configurado (no se puede determinar).
   * criterios=[] → ninguno califica.
   */
  const chatEsCalificado = (chat: ApiChatLead): boolean | null => {
    if (!criteriosData) return null;
    const criterios = criteriosData.categorias;
    if (criterios === null) return null; // sin criterios → indeterminado
    if (!chat.iaCategoria) return false;
    return criterios.includes(chat.iaCategoria);
  };

  const categoriasDistrib = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of visibleChats) {
      if (c.iaCategoria) {
        counts[c.iaCategoria] = (counts[c.iaCategoria] ?? 0) + 1;
      }
    }
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([cat, count]) => ({ cat, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }));
  }, [visibleChats]);

  const objecionesDistrib = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of visibleChats) {
      if (c.iaObjeciones) {
        for (const obj of c.iaObjeciones) {
          const key = obj.categoria ?? 'otra';
          counts[key] = (counts[key] ?? 0) + 1;
        }
      }
    }
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([cat, count]) => ({ cat, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }));
  }, [visibleChats]);

  const totalObjeciones = useMemo(() => {
    return visibleChats.reduce((s, c) => s + (c.iaObjeciones?.length ?? 0), 0);
  }, [visibleChats]);

  // Compute canal counts for badges
  const canalCounts = useMemo(() => {
    const counts: Record<string, number> = { todos: 0 };
    if (!data) return counts;
    counts['todos'] = data.chats.length;
    for (const c of data.chats) {
      const canal = detectCanal(c);
      counts[canal] = (counts[canal] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  // Filter chats by canal + sin contactar + solo calificados
  const filteredChats = useMemo(() => {
    if (!data) return [];
    let chats = canalActivo === 'todos' ? data.chats : data.chats.filter((c) => detectCanal(c) === canalActivo);
    if (soloSinContactar) chats = chats.filter((c) => !c.humanTookOver && !((c.estado ?? '').trim().toLowerCase() === 'perdido' || (c.estado ?? '').trim().toLowerCase() === 'perdida'));
    if (soloCalificados && criteriosData?.categorias != null) {
      chats = chats.filter((c) => c.iaCategoria != null && criteriosData.categorias!.includes(c.iaCategoria));
    }
    return chats;
  }, [data, canalActivo, soloSinContactar, soloCalificados, criteriosData]);

  const chatsByAgent = useMemo(() => {
    const map: Record<string, ApiChatLead[]> = {};
    const INVALID = new Set(['', 'agente', 'agent', 'bot', 'por asignar', 'workflow', 'api/bot', 'campaña', 'campaign']);
    for (const c of filteredChats) {
      const raw = (c.asesorAsignado?.trim() || c.agentName?.trim() || '').toLowerCase();
      const key = (!raw || INVALID.has(raw))
        ? 'Sin asignar'
        : (c.asesorAsignado?.trim() || c.agentName?.trim())!;
      if (selectedAdvisors.length > 0 && !isAdvisorVisible(key)) continue;
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [filteredChats, selectedAdvisors, isAdvisorVisible]);

  const defaultTo = new Date();
  const defaultFrom = subDays(defaultTo, 14);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <div className="text-gray-400 text-sm animate-pulse">Cargando datos de chats...</div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-4 space-y-3 text-sm min-w-0 max-w-full overflow-x-hidden">

      {data?.ghl_app_desconectada && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div className="space-y-1">
            <p className="font-semibold text-red-200">Integración con GHL desconectada</p>
            <p className="text-xs leading-relaxed">
              La app de LeadMaster fue desinstalada de tu cuenta de GHL. No estamos recibiendo nuevos chats.
              Escribe a <span className="font-semibold text-white">Sergio</span> para que te ayude a reinstalar la app.
              El aviso desaparece automáticamente cuando la integración sea restaurada.
            </p>
          </div>
        </div>
      )}

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
          onClick={() => setShowInsightsChat(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-purple/20 text-accent-purple border border-accent-purple/40 text-xs font-semibold hover:bg-accent-purple/30 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" /> Habla con tus datos
        </button>

        <button
          type="button"
          onClick={() => {
            const allChats = Object.values(chatsByAgent).flat();
            const advisorName = selectedAdvisors.length === 1 ? selectedAdvisors[0] : undefined;
            exportChats(allChats, dateFrom, dateTo, advisorName);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/20 text-accent-green border border-accent-green/30 text-xs font-semibold hover:bg-accent-green/30 transition-colors"
          title={selectedAdvisors.length > 0 ? `Exportar datos filtrados (${selectedAdvisors.length} asesor${selectedAdvisors.length > 1 ? 'es' : ''})` : 'Exportar todos los datos'}
        >
          <Download className="w-3.5 h-3.5" />
          Exportar {selectedAdvisors.length > 0 ? `(${Object.values(chatsByAgent).flat().length} chats)` : 'todo'}
        </button>

        <span className="text-xs text-gray-400">Rango de fechas:</span>
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRange={(from, to) => { setDateFrom(from); setDateTo(to); }}
          defaultFrom={format(defaultFrom, 'yyyy-MM-dd')}
          defaultTo={format(defaultTo, 'yyyy-MM-dd')}
        />
      </div>

      {/* ── KPIs principales ── */}
      <div className="grid grid-cols-2 min-[500px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-1.5 sm:gap-2 [grid-auto-rows:minmax(64px,auto)]">
        {[
          { label: t.performance.chats.kpis.asignados, value: agg.assigned, color: 'cyan', tip: chatKpiTooltips.asignados },
          { label: t.performance.chats.kpis.activos, value: agg.activos, color: 'cyan', tip: chatKpiTooltips.activos },
          { label: t.performance.chats.kpis.contactados, value: agg.activos, color: 'cyan', tip: chatKpiTooltips.contactados },
          { label: t.performance.chats.kpis.mensajes, value: agg.seguimientosTotal, color: 'purple', tip: chatKpiTooltips.seguimientos },
          { label: t.performance.chats.kpis.msgsPromedio, value: agg.assigned > 0 ? (agg.seguimientosTotal / agg.assigned).toFixed(1) : '—', color: 'pink', tip: chatKpiTooltips.msgsPromedio },
          { label: t.performance.chats.kpis.speedToLead, value: minFmt(agg.speedAvg), color: 'purple', tip: chatKpiTooltips.speedToLead },
          { label: 'Sin respuesta', value: extraKpis.sinRespuesta, color: 'amber', tip: chatKpiTooltips.sinRespuesta },
          { label: '% Sin contactar', value: `${extraKpis.pctSinContactar}%`, color: 'amber', tip: chatKpiTooltips.sinContactar },
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

      {/* ── KPI Calificados (solo si hay criterios configurados) ── */}
      {criteriosData?.categorias != null && criteriosData.categorias.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-medium text-gray-300">Leads calificados:</span>
            <span className="text-base font-bold text-emerald-400">{extraKpis.calificados}</span>
            <span className="text-[10px] text-gray-500">
              de {agg.assigned} · categorías: {criteriosData.categorias.join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* ── Onboarding: criterios no configurados ── */}
      {criteriosData && criteriosData.categorias === null && (
        <div className="flex items-start gap-3 rounded-xl border border-accent-purple/30 bg-accent-purple/5 p-3">
          <Settings className="mt-0.5 w-4 h-4 text-accent-purple shrink-0" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-accent-purple">
              Define qué intereses califican como leads para tu negocio
            </p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Configura los criterios de calificación en{' '}
              <Link href="../configuracion" className="text-accent-cyan underline hover:text-accent-cyan/80">
                Configuración
              </Link>{' '}
              para identificar automáticamente cuáles chats detectados por la IA son leads calificados.
            </p>
          </div>
        </div>
      )}

      {/* ── KPIs custom tipo "chat" ── */}
      {data?.metricasChatConfig && data.metricasChatConfig.length > 0 && data.metricasCustom && (
        <section>
          <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Métricas custom de chats</h3>
          <div className="grid grid-cols-2 min-[500px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 sm:gap-2">
            {data.metricasChatConfig.map((m) => {
              const valor = data.metricasCustom?.[m.id] ?? null;
              const colorClass = m.color ?? 'purple';
              return (
                <div key={m.id} className={`rounded-lg pl-3 overflow-hidden flex flex-col card-futuristic-${colorClass} kpi-card-fixed`} title={m.descripcion ?? m.nombre}>
                  <p className="text-[9px] font-medium text-gray-400 uppercase tracking-tight mt-1 truncate pr-2">{m.nombre}</p>
                  <p className={`text-base font-bold mt-0.5 text-accent-${colorClass}`}>
                    {fmtMetricaValue(valor, m.formato as MetricaConfig["formato"])}
                  </p>
                  <div className="kpi-card-spacer" />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Panel de intereses IA (ia_categoria) ── */}
      {categoriasDistrib.length > 0 && (
        <section className="rounded-lg border border-surface-500 p-3 bg-surface-800/50">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-accent-purple" />
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Top intereses detectados por IA</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {categoriasDistrib.map(({ cat, count, pct }) => (
              <div key={cat} className="flex items-center gap-1.5 bg-surface-700 rounded-lg px-2.5 py-1.5">
                <span className="text-xs font-semibold text-white">{categoriaLabel(cat)}</span>
                <span className="text-[10px] text-accent-purple font-bold">{count}</span>
                <span className="text-[10px] text-gray-500">({pct}%)</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-2">Basado en análisis nocturno de la IA sobre conversaciones del período seleccionado.</p>
        </section>
      )}

      {/* ── Panel de objeciones IA ── */}
      {objecionesDistrib.length > 0 && (
        <section className="rounded-lg border border-surface-500 p-3 bg-surface-800/50">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-accent-amber" />
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Objeciones detectadas por IA
            </h3>
            <span className="ml-auto text-[10px] text-accent-amber font-bold">{totalObjeciones} total</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {objecionesDistrib.map(({ cat, count, pct }) => (
              <div key={cat} className="flex items-center gap-1.5 bg-surface-700 rounded-lg px-2.5 py-1.5">
                <span className="text-base leading-none">{OBJECION_CATEGORIA_EMOJI[cat] ?? '💬'}</span>
                <span className="text-xs font-semibold text-white">{categoriaLabel(cat)}</span>
                <span className="text-[10px] text-accent-amber font-bold">{count}</span>
                <span className="text-[10px] text-gray-500">({pct}%)</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-2">
            Objeciones agrupadas por categoría. Basadas en análisis nocturno de la IA sobre las conversaciones del período.
          </p>
        </section>
      )}

      {/* ── Filtro por canal ── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 font-medium">{t.performance.chats.canal}:</span>
          <div className="flex flex-wrap gap-1.5">
            {CANAL_LABELS.map((canal) => {
              const count = canalCounts[canal] ?? 0;
              const isActive = canalActivo === canal;
              return (
                <button
                  key={canal}
                  type="button"
                  onClick={() => setCanalActivo(canal)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                    isActive
                      ? 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/50'
                      : 'bg-surface-700 text-gray-400 border-surface-500 hover:border-accent-cyan/30 hover:text-gray-300'
                  }`}
                >
                  {canal !== 'todos' && <span>{CANAL_EMOJI[canal]}</span>}
                  {canal === 'todos' ? t.performance.chats.todos : canal}
                  {count > 0 && (
                    <span className={`rounded-full px-1 text-[10px] ${isActive ? 'bg-accent-cyan/30' : 'bg-surface-600'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSoloSinContactar(!soloSinContactar)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
            soloSinContactar
              ? 'bg-accent-amber/20 text-accent-amber border-accent-amber/50'
              : 'bg-surface-700 text-gray-400 border-surface-500 hover:border-accent-amber/30 hover:text-gray-300'
          }`}
        >
          ⚡ Sin contactar
          {data && (
            <span className={`rounded-full px-1 text-[10px] ${soloSinContactar ? 'bg-accent-amber/30' : 'bg-surface-600'}`}>
              {data.chats.filter((c) => !c.humanTookOver && !((c.estado ?? '').trim().toLowerCase() === 'perdido' || (c.estado ?? '').trim().toLowerCase() === 'perdida')).length}
            </span>
          )}
        </button>
        {criteriosData?.categorias != null && criteriosData.categorias.length > 0 && (
          <button
            type="button"
            onClick={() => setSoloCalificados(!soloCalificados)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
              soloCalificados
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                : 'bg-surface-700 text-gray-400 border-surface-500 hover:border-emerald-500/30 hover:text-gray-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Solo calificados
            <span className={`rounded-full px-1 text-[10px] ${soloCalificados ? 'bg-emerald-500/30' : 'bg-surface-600'}`}>
              {extraKpis.calificados}
            </span>
          </button>
        )}
        {(canalActivo !== 'todos' || soloSinContactar) && (
          <p className="text-[11px] text-gray-500">
            Mostrando {filteredChats.length} chat{filteredChats.length !== 1 ? 's' : ''}
            {canalActivo !== 'todos' ? ` del canal ${CANAL_EMOJI[canalActivo]} ${canalActivo}` : ''}
            {soloSinContactar ? ' · sin contactar' : ''}
          </p>
        )}
      </div>

      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t.performance.chats.titulo}</h3>
        <div className="rounded-lg border border-surface-500 overflow-hidden">
          {Object.keys(chatsByAgent).length === 0 ? (
            <div className="px-3 py-4 text-center text-gray-500 text-xs">{t.performance.chats.noData}{canalActivo !== 'todos' ? ` (${canalActivo})` : ''}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-700 text-left text-gray-400">
                    <th className="px-2 py-2 font-medium w-6" title="Expandir chats del agente" />
                    <th className="px-2 py-2 font-medium">Agente</th>
                    <th className="px-2 py-2 font-medium">Asignados</th>
                    <th className="px-2 py-2 font-medium">Activos</th>
                    <th className="px-2 py-2 font-medium">Mensajes</th>
                    <th className="px-2 py-2 font-medium">Speed to lead</th>
                    <th className="px-2 py-2 font-medium w-24" title="Ver detalle completo del asesor" />
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(chatsByAgent)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([agentKey, agentChats]) => {
                      const isExpanded = expandedAdvisorId === agentKey;
                      const agentActivos = agentChats.filter((c) => c.humanTookOver).length;
                      const agentSpeeds = agentChats.filter((c) => c.speedToLeadSeconds != null).map((c) => c.speedToLeadSeconds!);
                      const agentSpeedAvg = agentSpeeds.length > 0 ? agentSpeeds.reduce((s, v) => s + v, 0) / agentSpeeds.length : null;
                      // Resolver email del agente: primero buscar en asesores del contexto (tienen email real),
                      // luego en data.advisors como fallback
                      const advisorEmail = agentKey !== 'Sin asignar'
                        ? (nameToEmail[agentKey.toLowerCase()]
                          ?? data?.advisors?.find((a) => a.name === agentKey || a.email === agentKey)?.email
                          ?? null)
                        : null;
                      const asesorLink = advisorEmail
                        ? `${asesorBasePath}?advisor=${encodeURIComponent(advisorEmail)}`
                        : null;

                      return (
                        <Fragment key={agentKey}>
                          <tr className="border-t border-surface-500 hover:bg-surface-700/50 cursor-pointer" onClick={() => setExpandedAdvisorId(isExpanded ? null : agentKey)}>
                            <td className="px-1 py-2 text-gray-400">
                              <span
                                className="inline-block transition-transform text-gray-500"
                                style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                                title={isExpanded ? 'Colapsar chats' : 'Expandir chats de este agente'}
                              >˅</span>
                            </td>
                            <td className="px-2 py-2">
                              <span className="flex items-center gap-1.5 text-white font-medium">
                                <User className="w-3.5 h-3.5 text-accent-cyan" />
                                {agentKey}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-accent-cyan">{agentChats.length}</td>
                            <td className="px-2 py-2 text-accent-cyan">{agentActivos}</td>
                            <td className="px-2 py-2 text-accent-purple">{agentChats.reduce((s, c) => s + c.totalMessages, 0)}</td>
                            <td className="px-2 py-2 text-gray-300">{minFmt(agentSpeedAvg)}</td>
                            <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                              {asesorLink ? (
                                <Link
                                  href={asesorLink}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/10 transition-colors whitespace-nowrap"
                                  title={`Ver panel completo de ${agentKey}: leads, pipeline, metas`}
                                >
                                  <User className="w-3 h-3" />
                                  Ver asesor →
                                </Link>
                              ) : (
                                <span className="text-[10px] text-gray-600">—</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-surface-800/90">
                              <td colSpan={8} className="p-0">
                                <div className="px-3 py-2 border-t border-surface-500">
                                  <div className="text-[10px] text-gray-400 mb-1.5">Chats de {agentKey}</div>
                                  <div className="rounded-lg border border-surface-500 overflow-x-auto max-h-[360px] overflow-y-auto">
                                    <table className="w-full text-xs">
                                      <thead className="sticky top-0 bg-surface-700">
                                        <tr className="text-left text-gray-400">
                                          <th className="px-2 py-2 font-medium w-8">Canal</th>
                                          <th className="px-2 py-2 font-medium">Lead</th>
                                          <th className="px-2 py-2 font-medium">Asignado</th>
                                          <th className="px-2 py-2 font-medium">Fecha</th>
                                          <th className="px-2 py-2 font-medium">Msgs</th>
                                          <th className="px-2 py-2 font-medium">Speed</th>
                                          <th className="px-2 py-2 font-medium" title="Minutos desde último mensaje del lead sin respuesta del agente">⏳ Espera</th>
                                          <th className="px-2 py-2 font-medium">Estado</th>
                                          <th className="px-2 py-2 font-medium">Interés IA</th>
                                          {criteriosData?.categorias != null && (
                                            <th className="px-2 py-2 font-medium" title="¿Cumple los criterios de calificación configurados?">Calificado</th>
                                          )}
                                          <th className="px-2 py-2 font-medium" title="Objeciones detectadas por IA">Objeciones</th>
                                          <th className="px-2 py-2 font-medium w-32" />
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {agentChats.map((chat) => {
                                          const canal = detectCanal(chat);
                                          return (
                                            <tr key={chat.id} className="border-t border-surface-500 hover:bg-surface-600/50">
                                              <td className="px-2 py-2 text-center" title={canal}>
                                                <span className="text-base">{CANAL_EMOJI[canal] ?? '⚙️'}</span>
                                              </td>
                                              <td className="px-2 py-2">
                                                <div className="text-white">{chat.leadName ?? '—'}</div>
                                                {chat.leadPhone && (
                                                  <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                                                    <Phone className="h-2.5 w-2.5" />{chat.leadPhone}
                                                  </span>
                                                )}
                                                {!chat.leadPhone && chat.leadEmail && (
                                                  <span className="text-[10px] text-gray-400 truncate block max-w-[120px]">{chat.leadEmail}</span>
                                                )}
                                              </td>
                                              <td className="px-2 py-2">
                                                {chat.asesorAsignado ? (
                                                  <span className="text-accent-cyan font-medium">{chat.asesorAsignado}</span>
                                                ) : chat.agentName ? (
                                                  <span className="text-gray-300">{chat.agentName}</span>
                                                ) : (
                                                  <span className="text-gray-500 italic">Sin asignar</span>
                                                )}
                                              </td>
                                              <td className="px-2 py-2 text-gray-400">{chat.datetime ? format(new Date(chat.datetime), 'dd/MM/yy HH:mm', { locale: es }) : '—'}</td>
                                              <td className="px-2 py-2 text-accent-purple">{chat.totalMessages}</td>
                                              <td className="px-2 py-2 text-gray-400">{minFmt(chat.speedToLeadSeconds)}</td>
                                              <td className="px-2 py-2">{waitBadge(chat.minutesSinceLastLeadMsg)}</td>
                                              <td className="px-2 py-2 text-gray-300">{chat.estado ?? '—'}</td>
                                              <td className="px-2 py-2">
                                                {chat.iaCategoria ? (
                                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent-purple/10 text-accent-purple border border-accent-purple/20 font-medium">
                                                    {categoriaLabel(chat.iaCategoria)}
                                                  </span>
                                                ) : (
                                                  <span className="text-gray-600 text-[10px]">—</span>
                                                )}
                                              </td>
                                              {criteriosData?.categorias != null && (() => {
                                                const calificado = chatEsCalificado(chat);
                                                return (
                                                  <td className="px-2 py-2">
                                                    {calificado === true ? (
                                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                                                        <CheckCircle2 className="w-3 h-3" /> Sí
                                                      </span>
                                                    ) : calificado === false ? (
                                                      <span className="text-gray-600 text-[10px]">No</span>
                                                    ) : (
                                                      <span className="text-gray-600 text-[10px]">—</span>
                                                    )}
                                                  </td>
                                                );
                                              })()}
                                              <td className="px-2 py-2">
                                                {chat.iaObjeciones && chat.iaObjeciones.length > 0 ? (
                                                  <div className="flex flex-wrap gap-0.5">
                                                    {chat.iaObjeciones.slice(0, 2).map((obj, i) => (
                                                      <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-accent-amber/10 text-accent-amber border border-accent-amber/20 font-medium" title={obj.objecion}>
                                                        {OBJECION_CATEGORIA_EMOJI[obj.categoria] ?? '💬'} {categoriaLabel(obj.categoria)}
                                                      </span>
                                                    ))}
                                                    {chat.iaObjeciones.length > 2 && (
                                                      <span className="text-[10px] text-gray-500">+{chat.iaObjeciones.length - 2}</span>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <span className="text-gray-600 text-[10px]">—</span>
                                                )}
                                              </td>
                                              <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <button type="button" onClick={() => setEditingRecord({ id: chat.id, nombre_lead: chat.leadName, closer: chat.asesorAsignado ?? chat.agentName, estado: chat.estado })} className="text-accent-amber text-[10px] inline-flex items-center gap-0.5"><Pencil className="w-3 h-3" /> Editar</button>
                                                  <button type="button" onClick={() => setModalConversacion(chat)} className="text-accent-cyan text-[10px] font-medium hover:underline">
                                                    Ver conversación
                                                  </button>
                                                  {(() => {
                                                    const chatAdvisorEmail = chat.asesorAsignado
                                                      ? (nameToEmail[chat.asesorAsignado.toLowerCase()] ?? null)
                                                      : null;
                                                    return chatAdvisorEmail ? (
                                                      <Link
                                                        href={`${asesorBasePath}?advisor=${encodeURIComponent(chatAdvisorEmail)}`}
                                                        className="text-emerald-400 text-[10px] inline-flex items-center gap-0.5 hover:underline"
                                                        title={`Ver pipeline de ${chat.asesorAsignado}`}
                                                      >
                                                        <ExternalLink className="w-3 h-3" /> Ver lead
                                                      </Link>
                                                    ) : null;
                                                  })()}
                                                </div>
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

      {editingRecord && (
        <EditRecordSheet
          type="chat"
          record={editingRecord}
          advisors={data?.advisors?.map(a => ({ name: a.name, email: a.email })) ?? []}
          onClose={() => setEditingRecord(null)}
          onSaved={() => { setEditingRecord(null); refetch(); }}
        />
      )}
      {modalConversacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalConversacion(null)} aria-hidden />
          <div className="relative w-full max-w-2xl max-h-[85vh] rounded-xl bg-surface-800 border border-surface-500 shadow-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-surface-500 shrink-0">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <span>{CANAL_EMOJI[detectCanal(modalConversacion)] ?? '💬'}</span>
                Conversación · {modalConversacion.leadName ?? 'Lead'}
              </h3>
              <button type="button" onClick={() => setModalConversacion(null)} className="p-2 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {modalConversacion.messages.length === 0 ? (
                <p className="text-gray-400 text-sm">No hay mensajes en esta conversación.</p>
              ) : (
                modalConversacion.messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'lead' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${msg.role === 'lead' ? 'bg-surface-700 text-gray-200' : 'bg-accent-cyan/20 text-white'}`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-gray-400">{msg.name}</span>
                        {msg.timestamp && <span className="text-[9px] text-gray-500">{format(new Date(msg.timestamp), 'HH:mm')}</span>}
                      </div>
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <NuevoRegistroModal
        open={showNuevoModal}
        onClose={() => setShowNuevoModal(false)}
        onSuccess={() => refetch()}
        tipo="chat"
      />
      {showInsightsChat && <InsightsChat onClose={() => setShowInsightsChat(false)} />}
    </div>
  );
}
