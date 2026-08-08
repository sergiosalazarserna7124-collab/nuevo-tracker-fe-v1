"use client";

import { toast } from 'sonner';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useT } from '@/contexts/LocaleContext';
import type { Locale } from '@/lib/i18n';
import PageHeader from '@/components/dashboard/PageHeader';
import { ChevronRight, ChevronLeft, Phone, Video, Tag, BarChart3, Building2, Save, Target, Loader2, Key, GitBranch, MessageSquare, Database, Plus, Trash2, GripVertical, ArrowRight, Pencil, HelpCircle, AlertTriangle, Sparkles, ShieldCheck, Info, CheckCircle2, Search, ListFilter, Users } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getMetricasQueDependenDe, DEFAULT_METRICAS_CONFIG, DEFAULT_EMBUDO_CONFIG } from '@/lib/metricas-engine';
import { HORARIO_LABORAL_DEFAULT, type HorarioLaboral } from '@/lib/business-hours';
import MetricaEditSheet from '@/components/dashboard/MetricaEditSheet';
import DashboardsManager from '@/components/dashboard/DashboardsManager';
import type { MetricaConfig, MetricaManualEntry, CategoriaLlamada, CategoriaCita, ExclusionesCoach, ReglaExclusionCoach } from '@/lib/db/schema';
import ChatRecoverySection from '@/features/quick-triggers/chat-recovery/ChatRecoverySection';
import HelpTooltip from '@/components/dashboard/HelpTooltip';
import PremiumGate from '@/components/dashboard/PremiumGate';

interface DynamicValueRangeLocal {
  min: number;
  label: string;
}
interface DynamicValueConfigLocal {
  fuente: "custom_field" | "formula";
  fieldId?: string;
  formula?: string;
  tipo?: "numero" | "si_no" | "texto" | "fecha";
  ranges?: DynamicValueRangeLocal[];
  labelSi?: string;
  labelNo?: string;
  mode?: "exacto" | "aproximado";
}
// Oculta el bloque "Valor dinámico / rangos" de la UI (pivote AUT-1241, modelo simple).
// El schema `dynamicValue` se conserva; poner en true si se decide reactivar la función.
const MOSTRAR_VALOR_DINAMICO = false;

interface AccionReglaLocal {
  tipo: "cambiar_estado" | "asignar_etiqueta" | "etapa_cambiada" | "incrementar_metrica" | "asignar_categoria" | "escribir_campo_ghl" | "escribir_campo_ghl_ia";
  valor?: string;
  funnelStage?: string;
  metrica_id?: string;
  metrica_incremento?: number;
  categoria_id?: string;
  fieldId?: string;
  prompt?: string;
}
interface TagRule {
  id: string;
  condicion: string;
  acciones: AccionReglaLocal[];
  fuentes: string[];
  excluye?: string[];
  dynamicValue?: DynamicValueConfigLocal;
  // legacy read-only
  condition?: string;
  tag?: string;
  source?: string;
  funnelStage?: string;
  accion?: string;
  valor?: string;
  fuente?: string;
  metrica_id?: string;
  metrica_incremento?: number;
  nombre?: string;
}
interface MetricRule {
  id: string; name: string; description: string; condition: string;
  increment: number; whenMeasured: string; isRecurring: 'recurrente' | 'unica';
  section: string; panel: string; ubicacion?: 'panel_ejecutivo' | 'rendimiento' | 'ambos';
}
interface ReglaAutomatica {
  evento: 'no_show' | 'cancelada' | 'sin_actividad_dias';
  valor?: number;
}
interface EmbudoEtapa {
  id: string;
  nombre: string;
  name?: string;
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
interface ChatConfig {
  tiene_chatbot: boolean;
  emoji_toma_atencion: string;
}
interface RolConfigLocal {
  id: string;
  nombre: string;
}

interface MetaPorRolLocal {
  rol_id: string;
  rol_nombre: string;
  meta_llamadas_diarias: number | null;
  meta_chats_diarios: number | null;
  meta_cierres_semanales: number | null;
  meta_contestacion: number | null;
}

interface AdsPlataformaMeta {
  activo: boolean;
  ad_account_id: string;
  access_token: string;
  cron_hora: number;
  campos_extra?: string[];
  pixel_id?: string;
}
interface AdsPlataformaGoogle {
  activo: boolean;
  customer_id: string;
  developer_token: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  cron_hora: number;
}
interface AdsPlataformaTikTok {
  activo: boolean;
  advertiser_id: string;
  access_token: string;
  cron_hora: number;
}
interface AdsPlataformaVturb {
  activo: boolean;
  api_token: string;
  auth_header?: string;
  nombre_player: string;
  cron_hora: number;
}

interface ConfiguracionAdsLocal {
  meta?: AdsPlataformaMeta;
  google?: AdsPlataformaGoogle;
  tiktok?: AdsPlataformaTikTok;
  vturb?: AdsPlataformaVturb;
}
interface SystemConfig {
  prompt_ventas: string; prompt_videollamadas: string; prompt_llamadas: string;
  reglas_etiquetas: (TagRule & Record<string, unknown>)[]; metricas_personalizadas: MetricRule[];
  metricas_config: MetricaConfig[]; metricas_manual_data: Record<string, MetricaManualEntry[]>;
  dashboards_personalizados?: import('@/lib/db/schema').DashboardPersonalizado[];
  embudo_personalizado: EmbudoEtapa[];
  has_openai_key: boolean; has_gemini_key: boolean; gemini_premium_status: 'active' | 'paused_invalid_key' | 'paused_quota_exceeded' | null; fuente_datos_financieros: 'nativa' | 'api_externa';
  seccion_chats_dashboard?: boolean;
  chat_config?: ChatConfig;
  horario_laboral?: HorarioLaboral;
  chat_analisis_hora?: number;
  roles_config?: RolConfigLocal[];
  idioma?: 'es' | 'en';
  configuracion_ads?: ConfiguracionAdsLocal;
  ghl_notas?: { ia?: boolean; transcripcion?: boolean };
  ghl_notas_llamadas?: { ia?: boolean; transcripcion?: boolean };
  ghl_campos?: { ia?: string; transcripcion?: string };
  ghl_campos_llamadas?: { ia?: string; transcripcion?: string };
  categorias_llamadas?: CategoriaLlamada[];
  categorias_citas?: CategoriaCita[];
  secciones_ocultas?: string[];
  ranking_metrica_base?: string | null;
}
interface MetasData {
  // ── Campos originales ─────────────────────────────────────────
  meta_llamadas_diarias: number; leads_nuevos_dia_1: number;
  leads_nuevos_dia_2: number; leads_nuevos_dia_3: number;
  meta_citas_semanales: number | null; meta_cierres_semanales: number | null;
  meta_revenue_mensual: number | null; meta_cash_collected_mensual: number | null;
  meta_tasa_cierre: number | null; meta_tasa_contestacion: number | null;
  meta_speed_to_lead_min: number | null;
  // ── Canal: Llamadas ───────────────────────────────────────────
  meta_llamadas_semanales: number | null;
  meta_contestacion_llamadas: number | null;
  meta_speed_llamadas_min: number | null;
  // ── Canal: Videollamadas ──────────────────────────────────────
  meta_citas_semanales_video: number | null;
  meta_cierre_video: number | null;
  meta_revenue_video: number | null;
  // ── Canal: Chats ──────────────────────────────────────────────
  meta_chats_diarios: number | null;
  meta_chats_contestacion: number | null;
  meta_speed_chat_min: number | null;
  // ── Metas por rol ─────────────────────────────────────────────
  metas_por_rol?: MetaPorRolLocal[];
}

const EMBUDO_COLORS = ['#06b6d4', '#8b5cf6', '#22c55e', '#f97316', '#ef4444', '#eab308', '#ec4899', '#14b8a6'];

const sections = ['Performance', 'Panel asesor', 'Resumen adquisición', 'Panel ejecutivo', 'Otro'];
const panelsBySection: Record<string, string[]> = {
  Performance: ['Llamadas', 'Citas', 'Chats'],
  'Panel asesor': ['KPIs período'],
  'Resumen adquisición': ['Tabla por canal'],
  'Panel ejecutivo': ['KPIs globales', 'Ranking asesores'],
  Otro: [],
};

function SortableMetricaCard({
  m,
  onEdit,
  onDelete,
}: {
  m: MetricaConfig;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: m.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const tipoLabel = m.tipo === 'manual' ? 'Manual' : m.tipo === 'automatica' ? 'Automática' : m.tipo === 'webhook' ? 'Webhook' : 'Fija';
  const ubicLabel = m.ubicacion === 'panel_ejecutivo' ? 'Panel' : m.ubicacion === 'rendimiento' ? 'Rendimiento' : 'Ambos';
  const formatoLabel = m.formato === 'moneda' ? '$' : m.formato === 'porcentaje' ? '%' : m.formato === 'tiempo' ? 'min' : m.formato === 'decimal' ? '.0' : '#';
  const colorMap: Record<string, string> = { blue: 'bg-blue-500', cyan: 'bg-cyan-500', green: 'bg-green-500', purple: 'bg-purple-500', amber: 'bg-amber-500', red: 'bg-red-500' };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-xl p-4 border-l-4 border-accent-green/60 bg-gradient-to-b from-surface-700/90 to-surface-800/90 border border-surface-500 flex items-center gap-3 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-gray-500 hover:text-gray-300">
        <GripVertical className="w-4 h-4" />
      </div>
      {m.color && <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorMap[m.color] ?? 'bg-gray-500'}`} />}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate">{m.nombre}</p>
        <p className="text-[10px] text-gray-500">
          {tipoLabel} · {ubicLabel} · Formato: {formatoLabel}
        </p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="p-1.5 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-accent-cyan"
        title="Editar"
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400"
        title="Eliminar"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  );
}

export default function SystemPage() {
  const t = useT();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get('step');
  // Pasos visibles tras la limpieza de 2026-08: fuera Contexto de empresa (1),
  // Embudo IA (7), Chat Triggers (8, el emoji de delegación vive en Eval. citas),
  // Fuente financiera (10) e Integraciones de Ads (11). Los IDs se conservan
  // para no romper deep-links como /system?step=5.
  const VISIBLE_STEPS = [1, 4, 5, 6, 9, 12, 13];
  const parsedStep = Number(stepParam) || 1;
  const initialStep = VISIBLE_STEPS.includes(parsedStep) ? parsedStep : 1;
  const [currentStep, setCurrentStep] = useState(initialStep);
  const goStep = (delta: number) =>
    setCurrentStep((s) => {
      const idx = VISIBLE_STEPS.indexOf(s);
      return VISIBLE_STEPS[Math.min(VISIBLE_STEPS.length - 1, Math.max(0, idx + delta))] ?? 1;
    });
  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [currentIdioma, setCurrentIdioma] = useState<Locale>('es');

  const [promptEmpresa, setPromptEmpresa] = useState('');
  const [promptEvaluacion, setPromptEvaluacion] = useState('');
  const [promptLlamadas, setPromptLlamadas] = useState('');
  const [tagRules, setTagRules] = useState<TagRule[]>([]);
  const [metricRules, setMetricRules] = useState<MetricRule[]>([]);
  const [metas, setMetas] = useState<MetasData>({ meta_llamadas_diarias: 50, leads_nuevos_dia_1: 3, leads_nuevos_dia_2: 4, leads_nuevos_dia_3: 5, meta_citas_semanales: null, meta_cierres_semanales: null, meta_revenue_mensual: null, meta_cash_collected_mensual: null, meta_tasa_cierre: null, meta_tasa_contestacion: null, meta_speed_to_lead_min: null, meta_llamadas_semanales: null, meta_contestacion_llamadas: null, meta_speed_llamadas_min: null, meta_citas_semanales_video: null, meta_cierre_video: null, meta_revenue_video: null, meta_chats_diarios: null, meta_chats_contestacion: null, meta_speed_chat_min: null });

  const [geminiKey, setGeminiKey] = useState('');
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [geminiPremiumStatus, setGeminiPremiumStatus] = useState<'active' | 'paused_invalid_key' | 'paused_quota_exceeded' | null>(null);
  const [embudoEtapas, setEmbudoEtapas] = useState<EmbudoEtapa[]>([]);
  const [chatConfig, setChatConfig] = useState<ChatConfig>({
    tiene_chatbot: false,
    emoji_toma_atencion: '',
  });
  const [chatAnalisisHora, setChatAnalisisHora] = useState<number>(2);
  const [horarioLaboral, setHorarioLaboral] = useState<HorarioLaboral>(HORARIO_LABORAL_DEFAULT);
  const [ghlNotasIa, setGhlNotasIa] = useState<boolean>(true);
  const [ghlNotasTranscripcion, setGhlNotasTranscripcion] = useState<boolean>(false);
  // Notas GHL para LLAMADAS telefónicas (independiente de videollamadas)
  const [ghlNotasLlamadasIa, setGhlNotasLlamadasIa] = useState<boolean>(true);
  const [ghlNotasLlamadasTranscripcion, setGhlNotasLlamadasTranscripcion] = useState<boolean>(true);
  // Campos personalizados de GHL (key/id) donde escribir el contenido auto-generado
  const [ghlCampoIa, setGhlCampoIa] = useState<string>('');
  const [ghlCampoTranscripcion, setGhlCampoTranscripcion] = useState<string>('');
  const [ghlCampoLlamadasIa, setGhlCampoLlamadasIa] = useState<string>('');
  const [ghlCampoLlamadasTranscripcion, setGhlCampoLlamadasTranscripcion] = useState<string>('');
  const [analizandoChats, setAnalizandoChats] = useState(false);
  const [analisisResult, setAnalisisResult] = useState<{ processed: number; updated: number; errors: number; costEstimate: string } | null>(null);
  const [reglasAbiertasMap, setReglasAbiertasMap] = useState<Record<string, boolean>>({});
  const [fuenteFinanciera, setFuenteFinanciera] = useState<'nativa' | 'api_externa'>('nativa');
  const [seccionChatsDashboard, setSeccionChatsDashboard] = useState(true);
  const [fuenteLlamadas, setFuenteLlamadas] = useState<'twilio' | 'ghl'>('twilio');
  const [ghlLocationId, setGhlLocationId] = useState<string>('');
  const [dashboardsPersonalizados, setDashboardsPersonalizados] = useState<import('@/lib/db/schema').DashboardPersonalizado[]>([]);
  const [metricasConfig, setMetricasConfig] = useState<MetricaConfig[]>([]);
  const [metricasManualData, setMetricasManualData] = useState<Record<string, MetricaManualEntry[]>>({});
  const [metricasSheetOpen, setMetricasSheetOpen] = useState(false);
  const [metricasSheetTipo, setMetricasSheetTipo] = useState<'manual' | 'automatica' | 'fija' | 'webhook' | 'chat'>('manual');
  const [cerradasCuentanComoCal, setCerradasCuentanComoCal] = useState(true);
  const [metricasEditingId, setMetricasEditingId] = useState<string | null>(null);
  const [metricasDeleteConfirm, setMetricasDeleteConfirm] = useState<{ id: string; dependientes: MetricaConfig[] } | null>(null);
  const [metricasBusqueda, setMetricasBusqueda] = useState('');
  const [metricasFiltroPanel, setMetricasFiltroPanel] = useState<string>('todos');
  const [rolesConfig, setRolesConfig] = useState<RolConfigLocal[]>([]);
  const [metasPorRol, setMetasPorRol] = useState<MetaPorRolLocal[]>([]);
  const [seccionesOcultas, setSeccionesOcultas] = useState<string[]>([]);
  const [rankingMetricaBase, setRankingMetricaBase] = useState<string | null>(null);
  const [categoriasLlamadas, setCategoriasLlamadas] = useState<CategoriaLlamada[]>([]);
  const [catEditId, setCatEditId] = useState<string | null>(null);
  const [catNombre, setCatNombre] = useState('');
  const [catTemas, setCatTemas] = useState<string[]>([]);
  const [catPrompt, setCatPrompt] = useState('');
  const [catDefinicion, setCatDefinicion] = useState('');
  const [catTemaInput, setCatTemaInput] = useState('');
  const [catEtiqueta, setCatEtiqueta] = useState('');
  // Categorías de citas (videollamadas) ancladas a etiqueta GHL
  const [categoriasCitas, setCategoriasCitas] = useState<CategoriaCita[]>([]);
  const [ccNombre, setCcNombre] = useState('');
  const [ccEtiqueta, setCcEtiqueta] = useState('');
  const [ccPrompt, setCcPrompt] = useState('');
  const [ccEditId, setCcEditId] = useState<string | null>(null);
  // Paso 1 "Prompts de evaluación": sección activa
  const [evalSeccion, setEvalSeccion] = useState<'chats' | 'llamadas' | 'citas'>('chats');
  // Categorías de chats (criterios custom del análisis nocturno)
  const [chatCats, setChatCats] = useState<{ slug: string; label: string; descripcion: string }[]>([]);
  const [chatCatsBase, setChatCatsBase] = useState<Record<string, unknown> | null>(null);
  const [chatCatsLoaded, setChatCatsLoaded] = useState(false);
  const [chatCatsSaving, setChatCatsSaving] = useState(false);
  const [chatCatLabel, setChatCatLabel] = useState('');
  const [chatCatDesc, setChatCatDesc] = useState('');

  // Coach de ventas state
  interface SeccionGuion {
    id: string;
    nombre: string;
    criterio: string;
    tipo: 'must_have' | 'deseable';
  }
  type CanalCoach = 'llamada' | 'chat' | 'videollamada';
  interface GuionCoach {
    id: string;
    id_cuenta: number;
    categoria_llamada_id: string;
    canal: CanalCoach;
    version: number;
    secciones: SeccionGuion[];
    umbral: number;
    activo: boolean;
    nota_cumplido: string | null;
    nota_no_cumplido: string | null;
    tags_cumplido: string[] | null;
    tags_no_cumplido: string[] | null;
    created_at: string | null;
    updated_at: string | null;
  }
  const [coachHabilitado, setCoachHabilitado] = useState<boolean | null>(null);
  const [guionesCoach, setGuionesCoach] = useState<GuionCoach[]>([]);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachEditCatId, setCoachEditCatId] = useState<string | null>(null);
  const [coachSecciones, setCoachSecciones] = useState<SeccionGuion[]>([]);
  const [coachUmbral, setCoachUmbral] = useState(70);
  const [coachSaving, setCoachSaving] = useState(false);
  const [coachCanalActivo, setCoachCanalActivo] = useState<CanalCoach>('llamada');
  const [coachNotaCumplido, setCoachNotaCumplido] = useState('');
  const [coachNotaNoCumplido, setCoachNotaNoCumplido] = useState('');
  const [coachTagsCumplido, setCoachTagsCumplido] = useState<string[]>([]);
  const [coachTagsNoCumplido, setCoachTagsNoCumplido] = useState<string[]>([]);
  const [coachTagInput, setCoachTagInput] = useState('');
  const [coachTagNoCumplInput, setCoachTagNoCumplInput] = useState('');
  const [exclusionesCoach, setExclusionesCoach] = useState<ReglaExclusionCoach[]>([]);
  const [exclusionesCoachSaving, setExclusionesCoachSaving] = useState(false);

  const DEFAULT_SECCIONES: SeccionGuion[] = [
    { id: 'apertura', nombre: 'Apertura', criterio: '', tipo: 'must_have' },
    { id: 'descubrimiento', nombre: 'Descubrimiento', criterio: '', tipo: 'must_have' },
    { id: 'objeciones', nombre: 'Manejo de objeciones', criterio: '', tipo: 'deseable' },
    { id: 'cierre', nombre: 'Cierre / CTA', criterio: '', tipo: 'must_have' },
  ];

  // Ads config state
  const [metaAdsActivo, setMetaAdsActivo] = useState(false);
  const [metaAdAccountId, setMetaAdAccountId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaCronHora, setMetaCronHora] = useState(6);
  const [metaVerificando, setMetaVerificando] = useState(false);
  const [metaVerificado, setMetaVerificado] = useState<null | boolean>(null);
  const [metaCamposExtra, setMetaCamposExtra] = useState<string[]>([]);
  const [metaPixelId, setMetaPixelId] = useState('');

  const [googleAdsActivo, setGoogleAdsActivo] = useState(false);
  const [googleCustomerId, setGoogleCustomerId] = useState('');
  const [googleDeveloperToken, setGoogleDeveloperToken] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [googleRefreshToken, setGoogleRefreshToken] = useState('');
  const [googleCronHora, setGoogleCronHora] = useState(6);

  const [tiktokAdsActivo, setTiktokAdsActivo] = useState(false);
  const [tiktokAdvertiserId, setTiktokAdvertiserId] = useState('');
  const [tiktokAccessToken, setTiktokAccessToken] = useState('');
  const [tiktokCronHora, setTiktokCronHora] = useState(6);
  const [vturbActivo, setVturbActivo] = useState(false);
  const [vturbApiToken, setVturbApiToken] = useState('');
  const [vturbNombrePlayer, setVturbNombrePlayer] = useState('');
  const [vturbCronHora, setVturbCronHora] = useState(6);
  const [vturbVerificando, setVturbVerificando] = useState(false);
  const [vturbVerificado, setVturbVerificado] = useState<null | boolean>(null);
  const [vturbAuthHeader, setVturbAuthHeader] = useState('x-api-token');

  const loadData = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const [cfgRes, metasRes] = await Promise.all([
        fetch('/api/data/system-config'),
        fetch('/api/data/metas'),
      ]);
      if (cfgRes.ok) {
        const cfg: SystemConfig = await cfgRes.json();
        setPromptEmpresa(cfg.prompt_ventas);
        setPromptEvaluacion(cfg.prompt_videollamadas);
        setPromptLlamadas(cfg.prompt_llamadas);
        setTagRules(cfg.reglas_etiquetas.length > 0 ? cfg.reglas_etiquetas.map((r: TagRule & Record<string, unknown>) => {
          const acciones: AccionReglaLocal[] = (r.acciones && (r.acciones as AccionReglaLocal[]).length > 0)
            ? r.acciones as AccionReglaLocal[]
            : [{ tipo: (r.accion as AccionReglaLocal['tipo']) ?? 'asignar_etiqueta', valor: (r.valor as string) ?? (r.tag as string), funnelStage: r.funnelStage as string | undefined, metrica_id: r.metrica_id as string | undefined, metrica_incremento: r.metrica_incremento as number | undefined, categoria_id: (r as Record<string, unknown>).categoria_id as string | undefined }];
          const fuentes: string[] = (r.fuentes && (r.fuentes as string[]).length > 0)
            ? r.fuentes as string[]
            : (r.fuente ?? r.source) === 'call'
              ? ['llamadas']
              : (r.fuente ?? r.source) === 'meeting'
                ? ['videollamadas']
                : ((r.fuente ?? r.source) && (r.fuente ?? r.source) !== 'todas')
                  ? [r.fuente ?? r.source] as string[]
                  : ['llamadas', 'videollamadas', 'chats'];
          const excluye = Array.isArray(r.excluye) ? r.excluye as string[] : [];
          return { ...r, condicion: (r.condicion ?? r.condition ?? '') as string, acciones, fuentes, nombre: (r.nombre ?? '') as string, excluye };
        }) : []);
        setMetricRules(cfg.metricas_personalizadas.length > 0 ? cfg.metricas_personalizadas : []);
        const loadedEmbudo = Array.isArray(cfg.embudo_personalizado)
          ? cfg.embudo_personalizado.map((e: EmbudoEtapa) => ({ ...e, nombre: e.nombre ?? e.name ?? e.id }))
          : [];
        setEmbudoEtapas(loadedEmbudo.length > 0 ? loadedEmbudo : DEFAULT_EMBUDO_CONFIG);
        setHasGeminiKey(cfg.has_gemini_key ?? false);
        setGeminiPremiumStatus(cfg.gemini_premium_status ?? null);
        setFuenteFinanciera(cfg.fuente_datos_financieros ?? 'nativa');
        setSeccionChatsDashboard(cfg.seccion_chats_dashboard !== false);
        if (cfg.idioma === 'en' || cfg.idioma === 'es') setCurrentIdioma(cfg.idioma);
        setFuenteLlamadas((cfg as unknown as { fuente_llamadas?: string }).fuente_llamadas === 'ghl' ? 'ghl' : 'twilio');
        setCategoriasLlamadas(Array.isArray(cfg.categorias_llamadas) ? cfg.categorias_llamadas : []);
        setCategoriasCitas(Array.isArray(cfg.categorias_citas) ? cfg.categorias_citas : []);
        setGhlLocationId((cfg as unknown as { ghl_location_id?: string }).ghl_location_id ?? '');
        if (cfg.horario_laboral && Array.isArray(cfg.horario_laboral.dias)) {
          setHorarioLaboral(cfg.horario_laboral);
        }
        if (cfg.chat_config) {
          setChatConfig({
            tiene_chatbot: cfg.chat_config.tiene_chatbot ?? false,
            emoji_toma_atencion: cfg.chat_config.emoji_toma_atencion ?? '',
          });
        }
        if (typeof cfg.chat_analisis_hora === 'number') {
          setChatAnalisisHora(cfg.chat_analisis_hora);
        }
        if (cfg.ghl_notas_llamadas) {
          setGhlNotasLlamadasIa(cfg.ghl_notas_llamadas.ia !== false); // default true
          setGhlNotasLlamadasTranscripcion(cfg.ghl_notas_llamadas.transcripcion !== false); // default true
        }
        if (cfg.ghl_notas) {
          setGhlNotasIa(cfg.ghl_notas.ia !== false); // default true
          setGhlNotasTranscripcion(cfg.ghl_notas.transcripcion === true); // default false
        }
        if (cfg.ghl_campos) {
          setGhlCampoIa(cfg.ghl_campos.ia ?? '');
          setGhlCampoTranscripcion(cfg.ghl_campos.transcripcion ?? '');
        }
        if (cfg.ghl_campos_llamadas) {
          setGhlCampoLlamadasIa(cfg.ghl_campos_llamadas.ia ?? '');
          setGhlCampoLlamadasTranscripcion(cfg.ghl_campos_llamadas.transcripcion ?? '');
        }
        if ((cfg as any).cerradas_cuentan_como_calificadas !== undefined) {
          setCerradasCuentanComoCal((cfg as any).cerradas_cuentan_como_calificadas);
        }
        if (Array.isArray(cfg.secciones_ocultas)) {
          setSeccionesOcultas(cfg.secciones_ocultas);
        }
        if (cfg.ranking_metrica_base !== undefined) {
          setRankingMetricaBase(cfg.ranking_metrica_base);
        }
        if (Array.isArray(cfg.roles_config)) {
          setRolesConfig(cfg.roles_config);
        }
        // Load ads config
        if (cfg.configuracion_ads) {
          const adsConf = cfg.configuracion_ads;
          if (adsConf.meta) {
            setMetaAdsActivo(adsConf.meta.activo ?? false);
            setMetaAdAccountId(adsConf.meta.ad_account_id ?? '');
            setMetaAccessToken(adsConf.meta.access_token ?? '');
            setMetaCronHora(adsConf.meta.cron_hora ?? 6);
            setMetaCamposExtra(adsConf.meta.campos_extra ?? []);
            setMetaPixelId(adsConf.meta.pixel_id ?? '');
          }
          if (adsConf.google) {
            setGoogleAdsActivo(adsConf.google.activo ?? false);
            setGoogleCustomerId(adsConf.google.customer_id ?? '');
            setGoogleDeveloperToken(adsConf.google.developer_token ?? '');
            setGoogleClientId(adsConf.google.client_id ?? '');
            setGoogleClientSecret(adsConf.google.client_secret ?? '');
            setGoogleRefreshToken(adsConf.google.refresh_token ?? '');
            setGoogleCronHora(adsConf.google.cron_hora ?? 6);
          }
          if (adsConf.tiktok) {
            setTiktokAdsActivo(adsConf.tiktok.activo ?? false);
            setTiktokAdvertiserId(adsConf.tiktok.advertiser_id ?? '');
            setTiktokAccessToken(adsConf.tiktok.access_token ?? '');
            setTiktokCronHora(adsConf.tiktok.cron_hora ?? 6);
          }
          if (adsConf.vturb) {
            setVturbActivo(adsConf.vturb.activo ?? false);
            setVturbApiToken(adsConf.vturb.api_token ?? '');
            setVturbNombrePlayer(adsConf.vturb.nombre_player ?? '');
            setVturbAuthHeader(adsConf.vturb.auth_header ?? 'Authorization');
            setVturbCronHora(adsConf.vturb.cron_hora ?? 6);
          }
        }
        const loadedConfig = Array.isArray(cfg.metricas_config) ? cfg.metricas_config : [];
        setMetricasConfig(loadedConfig.length > 0 ? loadedConfig : DEFAULT_METRICAS_CONFIG);
        setMetricasManualData(
          cfg.metricas_manual_data && typeof cfg.metricas_manual_data === 'object'
            ? cfg.metricas_manual_data
            : {},
        );
        setDashboardsPersonalizados(Array.isArray(cfg.dashboards_personalizados) ? cfg.dashboards_personalizados : []);
      }
      if (metasRes.ok) {
        const m = await metasRes.json();
        setMetas({ meta_llamadas_diarias: m.meta_llamadas_diarias, leads_nuevos_dia_1: m.leads_nuevos_dia_1, leads_nuevos_dia_2: m.leads_nuevos_dia_2, leads_nuevos_dia_3: m.leads_nuevos_dia_3, meta_citas_semanales: m.meta_citas_semanales ?? null, meta_cierres_semanales: m.meta_cierres_semanales ?? null, meta_revenue_mensual: m.meta_revenue_mensual ?? null, meta_cash_collected_mensual: m.meta_cash_collected_mensual ?? null, meta_tasa_cierre: m.meta_tasa_cierre ?? null, meta_tasa_contestacion: m.meta_tasa_contestacion ?? null, meta_speed_to_lead_min: m.meta_speed_to_lead_min ?? null, meta_llamadas_semanales: m.meta_llamadas_semanales ?? null, meta_contestacion_llamadas: m.meta_contestacion_llamadas ?? null, meta_speed_llamadas_min: m.meta_speed_llamadas_min ?? null, meta_citas_semanales_video: m.meta_citas_semanales_video ?? null, meta_cierre_video: m.meta_cierre_video ?? null, meta_revenue_video: m.meta_revenue_video ?? null, meta_chats_diarios: m.meta_chats_diarios ?? null, meta_chats_contestacion: m.meta_chats_contestacion ?? null, meta_speed_chat_min: m.meta_speed_chat_min ?? null, metas_por_rol: Array.isArray(m.metas_por_rol) ? m.metas_por_rol : [] });
        if (Array.isArray(m.metas_por_rol)) {
          setMetasPorRol(m.metas_por_rol);
        }
      }
    } catch { /* silently use defaults */ }
    setLoadingConfig(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadCoachData = useCallback(async () => {
    setCoachLoading(true);
    try {
      const [res, cfgRes] = await Promise.all([
        fetch('/api/data/coach-guiones'),
        fetch('/api/data/system-config'),
      ]);
      if (res.status === 403) {
        const body = await res.json().catch(() => null);
        if (body?.coachDisabled) {
          setCoachHabilitado(false);
          setCoachLoading(false);
          return;
        }
      }
      if (res.ok) {
        const data = await res.json();
        setCoachHabilitado(true);
        setGuionesCoach(Array.isArray(data.guiones) ? data.guiones : []);
      } else {
        setCoachHabilitado(null);
      }
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        if (cfg.exclusiones_coach?.reglas) {
          setExclusionesCoach(cfg.exclusiones_coach.reglas);
        }
      }
    } catch {
      setCoachHabilitado(null);
    }
    setCoachLoading(false);
  }, []);

  useEffect(() => {
    if (currentStep === 12 && coachHabilitado === null && !coachLoading) {
      loadCoachData();
    }
  }, [currentStep, coachHabilitado, coachLoading, loadCoachData]);

  // Prompts de evaluación → Chats: cargar categorías (criterios custom) una vez
  useEffect(() => {
    if (currentStep === 1 && evalSeccion === 'chats' && !chatCatsLoaded) {
      (async () => {
        try {
          const res = await fetch('/api/data/criterios-calificacion');
          if (res.ok) {
            const d = await res.json();
            setChatCats(Array.isArray(d.categoriasCustom) ? d.categoriasCustom : []);
            setChatCatsBase(d);
          }
        } catch { /* noop */ }
        setChatCatsLoaded(true);
      })();
    }
  }, [currentStep, evalSeccion, chatCatsLoaded]);

  const saveChatCats = async (next: { slug: string; label: string; descripcion: string }[]) => {
    setChatCats(next);
    setChatCatsSaving(true);
    try {
      const base = (chatCatsBase ?? {}) as Record<string, unknown>;
      const res = await fetch('/api/data/criterios-calificacion', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categorias: base.categorias ?? null,
          canales: base.canales,
          califica: base.califica,
          promptCalificacionChats: base.promptCalificacionChats ?? null,
          categoriasCustom: next,
        }),
      });
      if (!res.ok) toast.error('No se pudieron guardar las categorías de chats');
      else toast.success('Categorías de chats guardadas');
    } catch {
      toast.error('Error de red guardando categorías de chats');
    }
    setChatCatsSaving(false);
  };


  const editParam = searchParams.get('edit');
  useEffect(() => {
    if (editParam && !loadingConfig && currentStep === 5) {
      const m = metricasConfig.find((x) => x.id === editParam);
      if (m) {
        setMetricasEditingId(m.id);
        setMetricasSheetTipo(m.tipo as 'manual' | 'automatica' | 'fija' | 'webhook' | 'chat');
        setMetricasSheetOpen(true);
      }
    }
  }, [editParam, loadingConfig, currentStep, metricasConfig]);

  const saveConfig = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        prompt_ventas: promptEmpresa,
        prompt_videollamadas: promptEvaluacion,
        prompt_llamadas: promptLlamadas,
        reglas_etiquetas: tagRules.map((r) => ({
          id: r.id,
          nombre: r.nombre ?? '',
          condicion: r.condicion,
          acciones: r.acciones,
          fuentes: r.fuentes,
          ...(r.excluye && r.excluye.length > 0 ? { excluye: r.excluye } : {}),
        })),
        metricas_personalizadas: metricRules,
        metricas_config: metricasConfig,
        metricas_manual_data: metricasManualData,
        embudo_personalizado: embudoEtapas,
        fuente_datos_financieros: fuenteFinanciera,
        seccion_chats_dashboard: seccionChatsDashboard,
        chat_config: chatConfig,
        chat_analisis_hora: chatAnalisisHora,
        ghl_notas: { ia: ghlNotasIa, transcripcion: ghlNotasTranscripcion },
        ghl_notas_llamadas: { ia: ghlNotasLlamadasIa, transcripcion: ghlNotasLlamadasTranscripcion },
        ghl_campos: { ia: ghlCampoIa.trim(), transcripcion: ghlCampoTranscripcion.trim() },
        ghl_campos_llamadas: { ia: ghlCampoLlamadasIa.trim(), transcripcion: ghlCampoLlamadasTranscripcion.trim() },
        fuente_llamadas: fuenteLlamadas,
        ghl_location_id: ghlLocationId.trim() || null,
        cerradas_cuentan_como_calificadas: cerradasCuentanComoCal,
        categorias_llamadas: categoriasLlamadas,
        categorias_citas: categoriasCitas,
        secciones_ocultas: seccionesOcultas,
        ranking_metrica_base: rankingMetricaBase,
        horario_laboral: horarioLaboral,
      };
      if (geminiKey) payload.gemini_api_key = geminiKey;
      const res = await fetch('/api/data/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null) as { refsColgantes?: Array<{ metricaNombre: string; fuenteFaltante: string }> } | null;
        if (err?.refsColgantes?.length) {
          const detalles = err.refsColgantes.map((r) => `"${r.metricaNombre}" usa fuente inexistente "${r.fuenteFaltante}"`).join('; ');
          toast.error(`No se pudo guardar: ${detalles}`);
          setSaving(false);
          return false;
        }
        throw new Error('Error al guardar');
      }
      if (geminiKey) {
        setHasGeminiKey(true);
        setGeminiPremiumStatus('active');
        setGeminiKey('');
      }
      toast.success('Configuración guardada');
      setSaving(false);
      return true;
    } catch {
      toast.error('Error al guardar la configuración');
      setSaving(false);
      return false;
    }
  };

  const saveMetas = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch('/api/data/metas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...metas, metas_por_rol: metasPorRol }),
      });
      if (!res.ok) throw new Error('Error al guardar metas');
      toast.success('Metas guardadas');
      setSaving(false);
      return true;
    } catch {
      toast.error('Error al guardar las metas');
      setSaving(false);
      return false;
    }
  };

  const handleSave = async () => {
    if (currentStep === 6) await saveMetas();
    else await saveConfig();
  };

  const saveIdioma = async (lang: Locale) => {
    try {
      const res = await fetch('/api/data/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idioma: lang }),
      });
      if (!res.ok) throw new Error('Error al guardar idioma');
      setCurrentIdioma(lang);
      toast.success(lang === 'es' ? 'Idioma: Español' : 'Language: English');
    } catch {
      toast.error('Error al guardar el idioma');
    }
  };

  const dndSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const addTagRule = () => setTagRules((r) => [...r, { id: Date.now().toString(), condicion: '', acciones: [{ tipo: 'asignar_etiqueta', valor: '' }], fuentes: ['llamadas', 'videollamadas', 'chats'] }]);
  const addMetricRule = () => setMetricRules((r) => [...r, { id: Date.now().toString(), name: '', description: '', condition: '', increment: 1, whenMeasured: '', isRecurring: 'recurrente', section: '', panel: '', ubicacion: 'ambos' }]);
  const addEmbudoEtapa = () => setEmbudoEtapas((e) => [...e, { id: Date.now().toString(), nombre: '', color: EMBUDO_COLORS[e.length % EMBUDO_COLORS.length], orden: e.length + 1, es_unica: true }]);
  const removeEmbudoEtapa = (id: string) => setEmbudoEtapas((e) => e.filter((x) => x.id !== id).map((x, i) => ({ ...x, orden: i + 1 })));
  const handleAnalizarChats = async () => {
    setAnalizandoChats(true);
    setAnalisisResult(null);
    try {
      const res = await fetch('/api/data/analizar-chats', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAnalisisResult(data);
        toast.success(`Análisis completado: ${data.updated ?? 0} chats clasificados`);
      } else {
        toast.error('Error al analizar chats');
      }
    } catch {
      toast.error('Error de conexión al analizar chats');
    } finally {
      setAnalizandoChats(false);
    }
  };

  const saveCoachGuion = async (categoriaId: string, canal: CanalCoach) => {
    setCoachSaving(true);
    try {
      const res = await fetch('/api/data/coach-guiones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria_llamada_id: categoriaId,
          canal,
          secciones: coachSecciones.filter((s) => s.criterio.trim()),
          umbral: coachUmbral,
          nota_cumplido: coachNotaCumplido.trim() || null,
          nota_no_cumplido: coachNotaNoCumplido.trim() || null,
          tags_cumplido: coachTagsCumplido.length > 0 ? coachTagsCumplido : null,
          tags_no_cumplido: coachTagsNoCumplido.length > 0 ? coachTagsNoCumplido : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? 'Error al guardar guion');
        setCoachSaving(false);
        return;
      }
      const saved = await res.json();
      setGuionesCoach((prev) => {
        const filtered = prev.filter((g) => !(g.categoria_llamada_id === categoriaId && (g.canal ?? 'llamada') === canal));
        return [...filtered, saved];
      });
      toast.success('Guion guardado');
      setCoachEditCatId(null);
    } catch {
      toast.error('Error al guardar guion');
    }
    setCoachSaving(false);
  };

  const saveExclusionesCoach = async () => {
    setExclusionesCoachSaving(true);
    try {
      const res = await fetch('/api/data/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exclusiones_coach: { reglas: exclusionesCoach.filter((r) => r.valor.trim()) },
        }),
      });
      if (res.ok) {
        toast.success('Exclusiones guardadas');
      } else {
        toast.error('Error al guardar exclusiones');
      }
    } catch {
      toast.error('Error al guardar exclusiones');
    }
    setExclusionesCoachSaving(false);
  };

  const deleteCoachGuion = async (categoriaId: string, canal: CanalCoach) => {
    setCoachSaving(true);
    try {
      const res = await fetch(`/api/data/coach-guiones?categoriaId=${encodeURIComponent(categoriaId)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        setGuionesCoach((prev) => prev.filter((g) => !(g.categoria_llamada_id === categoriaId && (g.canal ?? 'llamada') === canal)));
        toast.success('Guion eliminado');
      } else {
        toast.error('Error al eliminar guion');
      }
    } catch {
      toast.error('Error al eliminar guion');
    }
    setCoachSaving(false);
  };

  if (loadingConfig) {
    return (
      <>
        <PageHeader title="Control del sistema" subtitle="Prompts / Etiquetas / Métricas" />
        <div className="flex items-center justify-center min-h-[300px]"><div className="text-gray-400 text-sm animate-pulse">Cargando configuración...</div></div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Control del sistema" subtitle="Prompts / Etiquetas / Métricas / Marca Blanca" />
      <div className="p-3 md:p-4 max-w-3xl mx-auto space-y-4 text-sm min-w-0 max-w-full overflow-x-hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
          {[
            { id: 1, title: 'Prompts de evaluación', icon: Sparkles, color: 'purple' },
            { id: 4, title: 'Reglas de etiquetas', icon: Tag, color: 'amber' },
            { id: 5, title: 'Métricas custom', icon: BarChart3, color: 'green' },
            { id: 6, title: 'Metas', icon: Target, color: 'cyan' },
            { id: 9, title: 'Motor IA', icon: Key, color: 'purple' },
            { id: 12, title: 'Coach de ventas', icon: ShieldCheck, color: 'green' },
            { id: 13, title: 'Gemini Key', icon: Sparkles, color: 'purple' },
          ].map((s) => {
            const Icon = s.icon;
            const active = currentStep === s.id;
            const colorClasses: Record<string, string> = {
              blue: active ? 'bg-accent-blue text-white border-accent-blue shadow-[0_0_16px_-4px_rgba(77,171,247,0.5)]' : 'bg-surface-700/80 text-gray-400 border-surface-500 hover:text-accent-blue hover:border-accent-blue/50',
              purple: active ? 'bg-accent-purple text-white border-accent-purple shadow-[0_0_16px_-4px_rgba(178,75,243,0.5)]' : 'bg-surface-700/80 text-gray-400 border-surface-500 hover:text-accent-purple hover:border-accent-purple/50',
              cyan: active ? 'bg-accent-cyan text-black border-accent-cyan shadow-[0_0_16px_-4px_rgba(0,240,255,0.5)]' : 'bg-surface-700/80 text-gray-400 border-surface-500 hover:text-accent-cyan hover:border-accent-cyan/50',
              amber: active ? 'bg-accent-amber text-black border-accent-amber shadow-[0_0_16px_-4px_rgba(255,176,32,0.5)]' : 'bg-surface-700/80 text-gray-400 border-surface-500 hover:text-accent-amber hover:border-accent-amber/50',
              green: active ? 'bg-accent-green text-black border-accent-green shadow-[0_0_16px_-4px_rgba(0,230,118,0.5)]' : 'bg-surface-700/80 text-gray-400 border-surface-500 hover:text-accent-green hover:border-accent-green/50',
            };
            const isBetaStep = s.id === 12 || s.id === 13;
            return (
              <button key={s.id} type="button" onClick={() => setCurrentStep(s.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${colorClasses[s.color]}`}>
                <Icon className="w-3.5 h-3.5" />
                {s.id}. {s.title}
                {isBetaStep && <span className="text-[9px] px-1 py-0.5 rounded bg-accent-amber/20 text-accent-amber border border-accent-amber/40 font-medium uppercase">Beta</span>}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl p-4 min-h-[280px] section-futuristic border border-surface-500/80 shadow-[0_0_28px_-8px_rgba(0,240,255,0.06)]">
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-accent-purple/30">
                <div className="rounded-lg p-2 bg-accent-purple/20 border border-accent-purple/40"><Sparkles className="w-5 h-5 text-accent-purple" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Prompts de evaluación</h3>
                  <p className="text-sm text-gray-400">Cómo evalúa la IA cada canal: chats, llamadas telefónicas y citas.</p>
                </div>
              </div>
              <div className="flex gap-2">
                {([['chats', 'Chats', MessageSquare], ['llamadas', 'Llamadas', Phone], ['citas', 'Citas', Video]] as const).map(([id, label, IconTab]) => (
                  <button key={id} type="button" onClick={() => setEvalSeccion(id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${evalSeccion === id ? 'bg-accent-purple/20 text-accent-purple border-accent-purple/50' : 'bg-surface-700/60 text-gray-400 border-surface-500 hover:text-white'}`}>
                    <IconTab className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentStep === 1 && evalSeccion === 'chats' && (
            <div className="space-y-4">
              {/* ── Transferir a un humano ── */}
              <div className="rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 p-4 space-y-4">
                <h4 className="text-sm font-semibold text-accent-cyan">⚡ Transferir a un humano</h4>
                <p className="text-sm text-gray-400">
                  Se usa para medir el <span className="text-white font-medium">speed to lead en chat</span>: saber si
                  contactan o no a cada lead, y cuánto tardan. Si el primero que responde es un bot, el tiempo real se
                  mide cuando el asesor humano toma la conversación con el emoji.
                </p>
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-1">
                    <span className="text-sm text-white font-medium">¿Tu equipo usa un chatbot antes de que atienda el asesor?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChatConfig((c) => ({ ...c, tiene_chatbot: !c.tiene_chatbot }))}
                    className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${chatConfig.tiene_chatbot ? 'bg-accent-cyan' : 'bg-surface-500'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${chatConfig.tiene_chatbot ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {chatConfig.tiene_chatbot && (
                  <div className="rounded-lg bg-surface-700/60 border border-surface-500 p-3 space-y-1.5">
                    <label className="text-xs font-medium text-gray-300 block">Emoji que usa el asesor para tomar el chat</label>
                    <p className="text-[11px] text-gray-500">El asesor envía este emoji para tomar la conversación del chatbot. Ej: ⚡ o 👋</p>
                    <input
                      type="text"
                      value={chatConfig.emoji_toma_atencion}
                      onChange={(e) => setChatConfig((c) => ({ ...c, emoji_toma_atencion: e.target.value }))}
                      placeholder="ej: ⚡ o 👋"
                      className="w-32 rounded-lg bg-surface-600 border border-surface-500 px-3 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-cyan/40"
                      maxLength={8}
                    />
                    {chatConfig.emoji_toma_atencion && (
                      <p className="text-[11px] text-gray-500">Emoji activo: <span className="text-2xl">{chatConfig.emoji_toma_atencion}</span></p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Categorías de chats ── */}
              <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 p-4 space-y-3">
                <h4 className="text-sm font-semibold text-accent-green">💬 Categorías de chats</h4>
                <p className="text-sm text-gray-400">
                  Define tus propias categorías y la IA clasificará cada conversación en una de ellas,
                  <span className="text-white font-medium"> una vez al día</span> (análisis nocturno automático).
                </p>
                {!chatCatsLoaded ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>
                ) : (
                  <>
                    {chatCats.length > 0 && (
                      <ul className="space-y-2">
                        {chatCats.map((cc) => (
                          <li key={cc.slug} className="flex items-start justify-between gap-3 rounded-lg bg-surface-700/70 border border-surface-500 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-sm text-white font-medium">{cc.label}</p>
                              <p className="text-[11px] text-gray-500">{cc.descripcion}</p>
                            </div>
                            <button type="button" disabled={chatCatsSaving} onClick={() => saveChatCats(chatCats.filter((c) => c.slug !== cc.slug))}
                              className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 shrink-0" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="rounded-lg bg-surface-700/50 border border-surface-500 p-3 space-y-2">
                      <input type="text" value={chatCatLabel} onChange={(e) => setChatCatLabel(e.target.value)} placeholder="Nombre de la categoría (ej: Interesado en compra)"
                        className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-green/40" />
                      <textarea value={chatCatDesc} onChange={(e) => setChatCatDesc(e.target.value)} placeholder="Descripción: cuándo un chat pertenece a esta categoría..."
                        className="w-full rounded-lg bg-surface-600 border border-surface-500 p-2 text-sm text-white min-h-[60px] focus:ring-2 focus:ring-accent-green/40" />
                      <button type="button" disabled={chatCatsSaving} onClick={() => {
                        if (!chatCatLabel.trim()) { toast.error('El nombre es obligatorio'); return; }
                        const slug = chatCatLabel.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                        if (chatCats.some((c) => c.slug === slug)) { toast.error('Ya existe una categoría con ese nombre'); return; }
                        saveChatCats([...chatCats, { slug, label: chatCatLabel.trim(), descripcion: chatCatDesc.trim() }]);
                        setChatCatLabel(''); setChatCatDesc('');
                      }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/20 text-accent-green border border-accent-green/40 text-xs font-semibold hover:bg-accent-green/30 disabled:opacity-50">
                        <Plus className="w-3.5 h-3.5" /> Añadir categoría de chat
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {currentStep === 1 && evalSeccion === 'citas' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-accent-purple/30">
                <div className="rounded-lg p-2 bg-accent-purple/20 border border-accent-purple/40"><Video className="w-5 h-5 text-accent-purple" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Evaluación de citas</h3>
                  <p className="text-sm text-gray-400">Prompt / rúbrica para evaluar citas (criterios, puntajes).</p>
                </div>
              </div>
              <textarea value={promptEvaluacion} onChange={(e) => setPromptEvaluacion(e.target.value)}
                className="w-full rounded-lg bg-surface-700/80 border border-surface-500 p-3 text-sm text-white placeholder-gray-500 min-h-[180px] focus:ring-2 focus:ring-accent-purple/50 focus:border-accent-purple/50 transition-colors"
                placeholder="Evalúa la cita según..." />
              <p className="text-[11px] text-gray-500 mt-1">Se recomienda ser lo más completo posible para que la IA entienda tu negocio de la mejor manera.</p>

              {/* ── Sección: Notas en GHL después de cita ── */}
              <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 p-4 space-y-4">
                <h4 className="text-sm font-semibold text-accent-amber flex items-center gap-2">
                  📝 Notas en GHL después de cita
                </h4>
                <p className="text-sm text-gray-400">
                  Cuando Fathom envía una grabación, el sistema puede guardar notas automáticamente en el contacto de GHL.
                  Elige qué quieres guardar — cada nota consume recursos del servidor y puede fallar si la transcripción es muy larga.
                </p>

                {/* Toggle: Nota IA */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-1">
                    <span className="text-sm text-white font-medium">Nota de análisis IA</span>
                    <p className="text-[11px] text-gray-500">
                      Guarda en GHL: categoría del lead, etiquetas detectadas y resumen del análisis. Breve y siempre dentro del límite.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGhlNotasIa((v) => !v)}
                    className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${ghlNotasIa ? 'bg-accent-green' : 'bg-surface-500'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ghlNotasIa ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Toggle: Transcripción completa */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-1">
                    <span className="text-sm text-white font-medium">Nota con transcripción completa</span>
                    <p className="text-[11px] text-gray-500">
                      Guarda el texto completo de la cita en GHL. <span className="text-accent-amber">⚠️</span> Las transcripciones largas (&gt;65k caracteres) pueden fallar por límite de GHL. Recomendado solo si realmente lo necesitas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGhlNotasTranscripcion((v) => !v)}
                    className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${ghlNotasTranscripcion ? 'bg-accent-green' : 'bg-surface-500'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ghlNotasTranscripcion ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* ── Completar campo personalizado de GHL ── */}
                <div className="pt-3 mt-1 border-t border-accent-amber/20 space-y-3">
                  <div className="space-y-1">
                    <span className="text-sm text-white font-medium">Completar campo personalizado de GHL</span>
                    <p className="text-[11px] text-gray-500">
                      Además de la nota, el sistema puede escribir el contenido en un campo personalizado (custom field) de GHL.
                      Pega la <span className="text-accent-amber">key/id</span> del campo (ej. <code className="text-gray-300">contact.transcripcion</code>). Déjalo vacío para no escribir.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-400">Campo para el resumen / análisis IA</label>
                    <input
                      type="text"
                      value={ghlCampoIa}
                      onChange={(e) => setGhlCampoIa(e.target.value)}
                      placeholder="ej. contact.resumen_videollamada"
                      className="w-full rounded-lg bg-surface-700/80 border border-surface-500 px-3 py-2 text-sm text-white placeholder-gray-600 focus:ring-2 focus:ring-accent-amber/40 focus:border-accent-amber/40 transition-colors font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-400">Campo para la transcripción completa</label>
                    <input
                      type="text"
                      value={ghlCampoTranscripcion}
                      onChange={(e) => setGhlCampoTranscripcion(e.target.value)}
                      placeholder="ej. contact.transcripcion"
                      className="w-full rounded-lg bg-surface-700/80 border border-surface-500 px-3 py-2 text-sm text-white placeholder-gray-600 focus:ring-2 focus:ring-accent-amber/40 focus:border-accent-amber/40 transition-colors font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* ── Categorías de citas ancladas a etiqueta GHL ── */}
              <div className="rounded-xl border border-accent-purple/30 bg-accent-purple/5 p-4 space-y-3">
                <h4 className="text-sm font-semibold text-accent-purple">🏷️ Categorías de citas (por etiqueta del contacto)</h4>
                <p className="text-sm text-gray-400">
                  No todas las citas se evalúan igual: crea una categoría por tipo de contacto y ánclala a una
                  etiqueta de GHL (ej. <span className="font-mono text-gray-300">lead nuevo</span>, <span className="font-mono text-gray-300">lead agendado</span>).
                  Si el contacto tiene esa etiqueta, su cita se evalúa con el prompt de la categoría en vez del prompt general de arriba.
                </p>
                {categoriasCitas.length > 0 && (
                  <ul className="space-y-2">
                    {categoriasCitas.map((cc) => (
                      <li key={cc.id} className="flex items-start justify-between gap-3 rounded-lg bg-surface-700/70 border border-surface-500 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm text-white font-medium">{cc.nombre} <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-accent-purple/20 text-accent-purple border border-accent-purple/30 font-mono">{cc.etiqueta}</span></p>
                          <p className="text-[11px] text-gray-500 truncate max-w-xl">{cc.prompt}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => { setCcEditId(cc.id); setCcNombre(cc.nombre); setCcEtiqueta(cc.etiqueta); setCcPrompt(cc.prompt); }} className="p-1.5 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-accent-cyan" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                          <button type="button" onClick={() => setCategoriasCitas((prev) => prev.filter((c) => c.id !== cc.id))} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="rounded-lg bg-surface-700/50 border border-surface-500 p-3 space-y-2">
                  <div className="grid md:grid-cols-2 gap-2">
                    <input type="text" value={ccNombre} onChange={(e) => setCcNombre(e.target.value)} placeholder="Nombre (ej: Lead nuevo)"
                      className="rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-purple/40" />
                    <input type="text" value={ccEtiqueta} onChange={(e) => setCcEtiqueta(e.target.value)} placeholder="Etiqueta GHL (ej: lead nuevo)"
                      className="rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-purple/40 font-mono" />
                  </div>
                  <textarea value={ccPrompt} onChange={(e) => setCcPrompt(e.target.value)} placeholder="Prompt: cómo evaluar las citas de este tipo de contacto..."
                    className="w-full rounded-lg bg-surface-600 border border-surface-500 p-2 text-sm text-white min-h-[70px] focus:ring-2 focus:ring-accent-purple/40" />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => {
                      if (!ccNombre.trim() || !ccEtiqueta.trim() || !ccPrompt.trim()) { toast.error('Nombre, etiqueta y prompt son obligatorios'); return; }
                      if (ccEditId) {
                        setCategoriasCitas((prev) => prev.map((c) => c.id === ccEditId ? { ...c, nombre: ccNombre.trim(), etiqueta: ccEtiqueta.trim(), prompt: ccPrompt.trim() } : c));
                      } else {
                        setCategoriasCitas((prev) => [...prev, { id: `cita-${Date.now()}`, nombre: ccNombre.trim(), etiqueta: ccEtiqueta.trim(), prompt: ccPrompt.trim() }]);
                      }
                      setCcEditId(null); setCcNombre(''); setCcEtiqueta(''); setCcPrompt('');
                    }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-purple/20 text-accent-purple border border-accent-purple/40 text-xs font-semibold hover:bg-accent-purple/30">
                      <Plus className="w-3.5 h-3.5" /> {ccEditId ? 'Guardar cambios' : 'Añadir categoría'}
                    </button>
                    {ccEditId && (
                      <button type="button" onClick={() => { setCcEditId(null); setCcNombre(''); setCcEtiqueta(''); setCcPrompt(''); }} className="text-xs text-gray-500 hover:text-gray-300">Cancelar</button>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500">Recuerda dar “Guardar” abajo para aplicar los cambios.</p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 1 && evalSeccion === 'llamadas' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-accent-cyan/30">
                <div className="rounded-lg p-2 bg-accent-cyan/20 border border-accent-cyan/40"><Phone className="w-5 h-5 text-accent-cyan" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Llamadas telefónicas</h3>
                  <p className="text-sm text-gray-400">Configura el origen de llamadas y el prompt de evaluación IA.</p>
                </div>
              </div>

              {/* ── Info IA llamadas ─────────────────────────────────── */}
              <div className="rounded-xl p-4 bg-accent-cyan/5 border border-accent-cyan/20 flex items-start gap-3">
                <div className="text-accent-cyan text-lg mt-0.5">✅</div>
                <div>
                  <p className="text-sm font-medium text-white">IA activa en todas las llamadas</p>
                  <p className="text-[11px] text-gray-400 mt-1">Cada llamada se transcribe y analiza automáticamente. El sistema clasifica el resultado (interesado, programado, seguimiento, etc.) y lo muestra en el panel de rendimiento.</p>
                </div>
              </div>

              {/* ── Prompt de evaluación ────────────────── */}
              <textarea value={promptLlamadas} onChange={(e) => setPromptLlamadas(e.target.value)}
                className="w-full rounded-lg bg-surface-700/80 border border-surface-500 p-3 text-sm text-white placeholder-gray-500 min-h-[180px] focus:ring-2 focus:ring-accent-cyan/50 focus:border-accent-cyan/50 transition-colors"
                placeholder="Evalúa la llamada telefónica según..." />
              <p className="text-[11px] text-gray-500 mt-1">Se recomienda ser lo más completo posible para que la IA entienda tu negocio de la mejor manera.</p>

              {/* ── Sección: Notas en GHL después de la llamada ── */}
              <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 p-4 space-y-4 mt-4">
                <h4 className="text-sm font-semibold text-accent-amber flex items-center gap-2">
                  📝 Notas en GHL después de la llamada
                </h4>
                <p className="text-sm text-gray-400">
                  Cuando llega una llamada, el sistema puede guardar notas automáticamente en el contacto de GHL. Apaga lo que el cliente no quiera.
                </p>
                {/* Toggle: Análisis IA */}
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-white font-medium">Nota con análisis IA</span>
                  <button
                    type="button"
                    onClick={() => setGhlNotasLlamadasIa((v) => !v)}
                    className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${ghlNotasLlamadasIa ? 'bg-accent-green' : 'bg-surface-500'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ghlNotasLlamadasIa ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {/* Toggle: Transcripción completa */}
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-white font-medium">Nota con transcripción completa</span>
                  <button
                    type="button"
                    onClick={() => setGhlNotasLlamadasTranscripcion((v) => !v)}
                    className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${ghlNotasLlamadasTranscripcion ? 'bg-accent-green' : 'bg-surface-500'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ghlNotasLlamadasTranscripcion ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* ── Completar campo personalizado de GHL ── */}
                <div className="pt-3 mt-1 border-t border-accent-amber/20 space-y-3">
                  <div className="space-y-1">
                    <span className="text-sm text-white font-medium">Completar campo personalizado de GHL</span>
                    <p className="text-[11px] text-gray-500">
                      Además de la nota, el sistema puede escribir el contenido en un campo personalizado (custom field) de GHL.
                      Pega la <span className="text-accent-amber">key/id</span> del campo (ej. <code className="text-gray-300">contact.transcripcion</code>). Déjalo vacío para no escribir.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-400">Campo para el análisis IA</label>
                    <input
                      type="text"
                      value={ghlCampoLlamadasIa}
                      onChange={(e) => setGhlCampoLlamadasIa(e.target.value)}
                      placeholder="ej. contact.resumen_llamada"
                      className="w-full rounded-lg bg-surface-700/80 border border-surface-500 px-3 py-2 text-sm text-white placeholder-gray-600 focus:ring-2 focus:ring-accent-amber/40 focus:border-accent-amber/40 transition-colors font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-400">Campo para la transcripción completa</label>
                    <input
                      type="text"
                      value={ghlCampoLlamadasTranscripcion}
                      onChange={(e) => setGhlCampoLlamadasTranscripcion(e.target.value)}
                      placeholder="ej. contact.transcripcion"
                      className="w-full rounded-lg bg-surface-700/80 border border-surface-500 px-3 py-2 text-sm text-white placeholder-gray-600 focus:ring-2 focus:ring-accent-amber/40 focus:border-accent-amber/40 transition-colors font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* ── Categorías de llamada ── */}
              <div className="mt-6 pt-5 border-t border-surface-500">
                <div className="flex items-center gap-2 pb-3">
                  <div className="rounded-lg p-1.5 bg-accent-purple/20 border border-accent-purple/40"><Tag className="w-4 h-4 text-accent-purple" /></div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-base font-semibold text-white">Categorías de llamada</h4>
                      <HelpTooltip
                        titulo="¿Qué son las categorías de llamada?"
                        contenido={`No todas las llamadas se evalúan igual: una llamada de descubrimiento no es lo mismo que una de perfilamiento, seguimiento o cierre.\n\nAquí creas cada categoría con su PROPIO prompt de evaluación y sus temas. Luego, en el Paso 4 (Reglas de etiquetas), usas la acción "Asignar categoría" para que cada llamada se enrute a la categoría correcta y se analice con el prompt adecuado.`}
                        comoProbar="Crea una categoría (ej. 'Perfilamiento'), escribe su prompt y sus temas, y guarda. Ve al Paso 4, crea una regla con la condición que identifique ese tipo de llamada y elige la acción 'Asignar categoría'. Cuando entre una llamada que cumpla la condición, se evaluará con el prompt de esa categoría."
                      />
                    </div>
                    <p className="text-xs text-gray-400">Crea categorías con un prompt de evaluación propio y temas específicos. Para que una categoría se use, crea una regla en el Paso 4 con la acción &quot;Asignar categoría&quot;.</p>
                  </div>
                </div>

                {categoriasLlamadas.length === 0 && catEditId === null && (
                  <div className="rounded-xl p-5 border border-dashed border-surface-500 bg-surface-800/50 text-center space-y-3">
                    <div className="flex justify-center"><Tag className="w-8 h-8 text-gray-600" /></div>
                    <p className="text-sm text-gray-400">Aún no hay categorías de llamada.</p>
                    <p className="text-xs text-gray-500">Las categorías permiten evaluar cada tipo de llamada con su propio prompt. Puedes crear las tuyas o cargar plantillas de ejemplo.</p>
                    <div className="flex gap-2 justify-center flex-wrap">
                      <button type="button" onClick={() => {
                        setCatEditId(crypto.randomUUID());
                        setCatNombre(''); setCatDefinicion(''); setCatTemas([]); setCatPrompt(''); setCatTemaInput(''); setCatEtiqueta('');
                      }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent-purple/20 text-accent-purple border border-accent-purple/40 hover:bg-accent-purple/30 transition-all">
                        <Plus className="w-4 h-4" /> Crear categoría
                      </button>
                      <button type="button" onClick={() => {
                        setCategoriasLlamadas([
                          {
                            id: crypto.randomUUID(),
                            nombre: 'Perfilamiento',
                            definicion: 'Primera llamada para conocer al prospecto: necesidad, presupuesto, zona de interés y plazo de compra.',
                            temas: ['presupuesto', 'ubicación', 'plazo', 'necesidad', 'primera llamada'],
                            prompt: '¿El asesor preguntó presupuesto? ¿Identificó la necesidad principal? ¿Preguntó zona de interés y plazo? ¿Agendó siguiente paso?',
                          },
                          {
                            id: crypto.randomUUID(),
                            nombre: 'Seguimiento',
                            definicion: 'Llamada de seguimiento a un prospecto ya perfilado. Se busca avanzar al cierre o resolver objeciones.',
                            temas: ['seguimiento', 'objeciones', 'avance', 'propuesta', 'cotización'],
                            prompt: '¿El asesor retomó la conversación anterior? ¿Abordó objeciones? ¿Presentó opciones concretas? ¿Definió siguiente acción?',
                          },
                          {
                            id: crypto.randomUUID(),
                            nombre: 'Agendamiento / Cierre',
                            definicion: 'Llamada donde se busca agendar visita o cerrar la venta. El prospecto ya está calificado.',
                            temas: ['agendar', 'visita', 'cierre', 'contrato', 'apartado', 'firma'],
                            prompt: '¿Se agendó visita o cita de cierre? ¿Se habló de proceso de compra/contrato? ¿Hubo compromiso concreto del prospecto?',
                          },
                        ]);
                        toast.success('3 categorías de ejemplo cargadas — edítalas a tu medida');
                      }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-surface-700 text-gray-300 border border-surface-500 hover:bg-surface-600 transition-all">
                        <Sparkles className="w-4 h-4" /> Cargar categorías de ejemplo
                      </button>
                    </div>
                  </div>
                )}

                {categoriasLlamadas.length > 0 && (
                  <ul className="space-y-2 mb-3">
                    {categoriasLlamadas.map((cat) => {
                      const tieneRegla = tagRules.some((r) =>
                        r.acciones.some((a) => a.tipo === 'asignar_categoria' && a.categoria_id === cat.id)
                      );
                      return (
                      <li key={cat.id} className="rounded-xl p-3 border-l-4 border-accent-purple/60 bg-gradient-to-b from-surface-700/90 to-surface-800/90 border border-surface-500 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{cat.nombre}</p>
                          {cat.definicion && <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{cat.definicion}</p>}
                          {cat.temas.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {cat.temas.map((t, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-accent-purple/15 text-accent-purple text-[10px] border border-accent-purple/30">{t}</span>
                              ))}
                            </div>
                          )}
                          {cat.prompt && <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{cat.prompt}</p>}
                          {!tieneRegla && (
                            <button type="button" onClick={() => setCurrentStep(4)}
                              className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-amber-400/90 hover:text-amber-300 transition-colors">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Ninguna regla la enruta todavía — ir al Paso 4</span>
                            </button>
                          )}
                        </div>
                        <button type="button" onClick={() => {
                          setCatEditId(cat.id);
                          setCatNombre(cat.nombre);
                          setCatDefinicion(cat.definicion ?? '');
                          setCatTemas([...cat.temas]);
                          setCatPrompt(cat.prompt);
                          setCatTemaInput('');
                          setCatEtiqueta(cat.etiqueta ?? '');
                        }} className="p-1.5 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-accent-cyan" title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => setCategoriasLlamadas((prev) => prev.filter((c) => c.id !== cat.id))}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400" title="Eliminar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                      );
                    })}
                  </ul>
                )}

                {catEditId !== null ? (
                  <div className="rounded-xl p-4 border border-accent-purple/30 bg-surface-700/50 space-y-3">
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="block text-[11px] font-medium text-accent-purple">Nombre de la categoría</label>
                        <HelpTooltip titulo="Nombre" contenido="Nombre corto de la categoría (ej. Perfilamiento)." />
                      </div>
                      <input type="text" value={catNombre} onChange={(e) => setCatNombre(e.target.value)}
                        placeholder="Ej: Perfilamiento, Seguimiento, Cierre"
                        className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-purple/40" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="block text-[11px] font-medium text-accent-purple">Etiqueta de GHL (ancla de la categoría)</label>
                        <HelpTooltip titulo="Etiqueta" contenido="Si el CONTACTO tiene esta etiqueta en GHL (ej. lead nuevo, lead perfilado, lead agendado), sus llamadas se evalúan con el prompt de esta categoría. Tiene prioridad sobre cualquier otra selección." />
                      </div>
                      <input type="text" value={catEtiqueta} onChange={(e) => setCatEtiqueta(e.target.value)}
                        placeholder="Ej: lead nuevo"
                        className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-purple/40 font-mono" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="block text-[11px] font-medium text-accent-purple">Definición / ¿Cuándo aplica esta categoría?</label>
                        <HelpTooltip titulo="Definición" contenido="Explica en tus palabras cuándo una llamada es de este tipo y cómo reconocerla. La IA lo usa para clasificar. Ej: 'Primera llamada para conocer necesidad y presupuesto.'" />
                      </div>
                      <textarea value={catDefinicion} onChange={(e) => setCatDefinicion(e.target.value)}
                        placeholder="Ej: Primera llamada para conocer necesidad y presupuesto del prospecto."
                        className="w-full rounded-lg bg-surface-600 border border-surface-500 p-2 text-sm text-white min-h-[60px] focus:ring-2 focus:ring-accent-purple/40" />
                      <p className="text-[10px] text-gray-500 mt-0.5 italic">Definición = cuándo aplica / cómo reconocerla.</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="block text-[11px] font-medium text-accent-purple">Temas</label>
                        <HelpTooltip titulo="Temas" contenido="Palabras/temas señal que suelen aparecer en este tipo de llamada (ej. presupuesto, ubicación, plazo). La IA los usa como pistas." />
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {catTemas.map((t, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-purple/15 text-accent-purple text-xs border border-accent-purple/30">
                            {t}
                            <button type="button" onClick={() => setCatTemas((prev) => prev.filter((_, j) => j !== i))} className="hover:text-red-400">×</button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <input type="text" value={catTemaInput} onChange={(e) => setCatTemaInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && catTemaInput.trim()) {
                              e.preventDefault();
                              setCatTemas((prev) => [...prev, catTemaInput.trim()]);
                              setCatTemaInput('');
                            }
                          }}
                          placeholder="Escribe un tema y presiona Enter"
                          className="flex-1 rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-purple/40" />
                        <button type="button" onClick={() => {
                          if (catTemaInput.trim()) {
                            setCatTemas((prev) => [...prev, catTemaInput.trim()]);
                            setCatTemaInput('');
                          }
                        }} className="px-2 py-1 rounded-lg bg-accent-purple/20 text-accent-purple border border-accent-purple/40 text-xs hover:bg-accent-purple/30">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="border-t border-surface-500 pt-3">
                      <div className="flex items-center gap-1 mb-1">
                        <label className="block text-[11px] font-medium text-accent-purple">Prompt de evaluación</label>
                        <HelpTooltip titulo="Prompt de evaluación" contenido="Criterios de evaluación DENTRO de esta categoría: qué debe revisar la IA (ej. '¿preguntó presupuesto? ¿agendó siguiente paso?')." />
                      </div>
                      <textarea value={catPrompt} onChange={(e) => setCatPrompt(e.target.value)}
                        placeholder="Evalúa esta llamada de perfilamiento según..."
                        className="w-full rounded-lg bg-surface-600 border border-surface-500 p-2 text-sm text-white min-h-[100px] focus:ring-2 focus:ring-accent-purple/40" />
                      <p className="text-[10px] text-gray-500 mt-0.5 italic">Prompt = qué evaluar dentro de la llamada.</p>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => { setCatEditId(null); setCatNombre(''); setCatDefinicion(''); setCatTemas([]); setCatPrompt(''); setCatTemaInput(''); setCatEtiqueta(''); }}
                        className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white border border-surface-500 hover:border-surface-400">
                        Cancelar
                      </button>
                      <button type="button" onClick={() => {
                        if (!catNombre.trim()) { toast.error('El nombre es obligatorio'); return; }
                        const existing = categoriasLlamadas.find((c) => c.id === catEditId);
                        if (existing) {
                          setCategoriasLlamadas((prev) => prev.map((c) => c.id === catEditId ? { ...c, nombre: catNombre.trim(), definicion: catDefinicion.trim() || undefined, temas: catTemas, prompt: catPrompt.trim(), etiqueta: catEtiqueta.trim() || undefined } : c));
                        } else {
                          setCategoriasLlamadas((prev) => [...prev, { id: catEditId, nombre: catNombre.trim(), definicion: catDefinicion.trim() || undefined, temas: catTemas, prompt: catPrompt.trim(), etiqueta: catEtiqueta.trim() || undefined }]);
                        }
                        setCatEditId(null); setCatNombre(''); setCatDefinicion(''); setCatTemas([]); setCatPrompt(''); setCatTemaInput(''); setCatEtiqueta('');
                      }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-purple/20 text-accent-purple border border-accent-purple/40 hover:bg-accent-purple/30">
                        {categoriasLlamadas.some((c) => c.id === catEditId) ? 'Actualizar' : 'Agregar'}
                      </button>
                    </div>
                  </div>
                ) : categoriasLlamadas.length > 0 ? (
                  <button type="button" onClick={() => {
                    setCatEditId(crypto.randomUUID());
                    setCatNombre(''); setCatDefinicion(''); setCatTemas([]); setCatPrompt(''); setCatTemaInput(''); setCatEtiqueta('');
                  }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent-purple/20 text-accent-purple border border-accent-purple/40 hover:bg-accent-purple/30 transition-all">
                    <Plus className="w-4 h-4" /> Añadir categoría
                  </button>
                ) : null}
              </div>

              {/* Horario laboral — base del "Speed to lead asesor" */}
              <div className="pt-4 mt-2 border-t border-surface-500 space-y-3">
                <div>
                  <h3 className="text-base font-semibold text-white">Horario laboral</h3>
                  <p className="text-xs text-gray-400">Se usa para el <strong>Speed to lead asesor</strong>: cuenta solo los minutos dentro de este horario desde que se asigna el lead hasta la primera llamada (en la zona horaria de la cuenta).</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[{ n: 1, l: 'Lun' }, { n: 2, l: 'Mar' }, { n: 3, l: 'Mié' }, { n: 4, l: 'Jue' }, { n: 5, l: 'Vie' }, { n: 6, l: 'Sáb' }, { n: 7, l: 'Dom' }].map((d) => {
                    const active = horarioLaboral.dias.includes(d.n);
                    return (
                      <button key={d.n} type="button"
                        onClick={() => setHorarioLaboral((h) => ({ ...h, dias: active ? h.dias.filter((x) => x !== d.n) : [...h.dias, d.n].sort((a, b) => a - b) }))}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${active ? 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/50' : 'bg-surface-700 text-gray-400 border-surface-500 hover:border-surface-400'}`}>
                        {d.l}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4">
                  <label className="text-sm text-gray-300 flex items-center gap-2">Desde
                    <input type="time" value={horarioLaboral.hora_inicio}
                      onChange={(e) => setHorarioLaboral((h) => ({ ...h, hora_inicio: e.target.value }))}
                      className="rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white" />
                  </label>
                  <label className="text-sm text-gray-300 flex items-center gap-2">Hasta
                    <input type="time" value={horarioLaboral.hora_fin}
                      onChange={(e) => setHorarioLaboral((h) => ({ ...h, hora_fin: e.target.value }))}
                      className="rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-accent-amber/30">
                <div className="rounded-lg p-2 bg-accent-amber/20 border border-accent-amber/40"><Tag className="w-5 h-5 text-accent-amber" /></div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-lg font-semibold text-white">Reglas de etiquetas</h3>
                    <HelpTooltip
                      titulo="¿Qué son las reglas de etiquetas?"
                      contenido={`Cada regla es una condición escrita en tus palabras. Después de cada llamada, cita o chat, el sistema revisa si esa condición se cumple:\n\n• Si se cumple → ejecuta la acción (pone la etiqueta, escribe en un campo de GHL, o la IA genera texto y lo guarda en un campo).\n• Si no se cumple → no hace nada.\n\nEjemplo: condición "el lead menciona un presupuesto mayor a 5000" → acción "Poner etiqueta" → Presupuesto_mayor_5000.`}
                      comoProbar="Crea una regla con la condición en tus palabras (ej. 'menciona presupuesto mayor a 5000'), elige la acción y guarda. Espera a que entre una llamada o chat que cumpla la condición: la etiqueta (o el valor del campo) aparecerá en el perfil del lead."
                    />
                  </div>
                  <p className="text-sm text-gray-400">Define condiciones para asignar etiquetas, cambiar estado o incrementar métricas automáticamente. Cada regla puede tener múltiples acciones.</p>
                </div>
              </div>
              <ul className="space-y-3">
                {tagRules.map((r) => {
                  const KNOWN_CONDITIONS = ['mencion_precio', 'enojo', 'interes_alto', 'solicitud_propuesta', 'objecion_precio', 'objecion_tiempo', 'duracion_mayor', 'intentos_mayor', 'speed_mayor'];
                  const allChannels = ['llamadas', 'videollamadas', 'chats'];
                  const isAllSources = r.fuentes.length === 3 && allChannels.every((c) => r.fuentes.includes(c));
                  const updateRule = (patch: Partial<TagRule>) => setTagRules((prev) => prev.map((x) => x.id === r.id ? { ...x, ...patch } : x));
                  const updateAccion = (idx: number, patch: Partial<AccionReglaLocal>) => {
                    const next = r.acciones.map((a, i) => i === idx ? { ...a, ...patch } : a);
                    updateRule({ acciones: next });
                  };
                  const addAccion = () => updateRule({ acciones: [...r.acciones, { tipo: 'asignar_etiqueta', valor: '' }] });
                  const removeAccion = (idx: number) => updateRule({ acciones: r.acciones.filter((_, i) => i !== idx) });
                  const toggleFuente = (canal: string) => {
                    const has = r.fuentes.includes(canal);
                    const next = has ? r.fuentes.filter((f) => f !== canal) : [...r.fuentes, canal];
                    if (next.length === 0) return;
                    updateRule({ fuentes: next });
                  };
                  const toggleTodas = () => {
                    updateRule({ fuentes: isAllSources ? [] : [...allChannels] });
                  };
                  return (
                    <li key={r.id} className="rounded-xl p-4 space-y-3 border-l-4 border-accent-amber/60 bg-gradient-to-b from-surface-700/90 to-surface-800/90 border border-surface-500">
                      <div className="flex flex-wrap gap-3">
                        <div className="flex-1 min-w-[180px]">
                          <label className="block text-[11px] font-medium text-accent-amber mb-1">Condición</label>
                          <select
                            value={KNOWN_CONDITIONS.includes(r.condicion) ? r.condicion : '_custom'}
                            onChange={(e) => { const val = e.target.value; if (val !== '_custom') updateRule({ condicion: val }); }}
                            className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-sm text-white"
                          >
                            <optgroup label="Condición IA">
                              <option value="mencion_precio">Mención de precio</option>
                              <option value="enojo">Enojo del lead</option>
                              <option value="interes_alto">Interés alto</option>
                              <option value="solicitud_propuesta">Solicitud de propuesta</option>
                              <option value="objecion_precio">Objeción por precio</option>
                              <option value="objecion_tiempo">Objeción por tiempo</option>
                            </optgroup>
                            <optgroup label="Condición Fija">
                              <option value="duracion_mayor">Duración mayor a X min</option>
                              <option value="intentos_mayor">Intentos mayor a Y</option>
                              <option value="speed_mayor">Speed to lead mayor a Z min</option>
                            </optgroup>
                            <optgroup label="Personalizada">
                              <option value="_custom">Texto libre...</option>
                            </optgroup>
                          </select>
                          {!KNOWN_CONDITIONS.includes(r.condicion) && (
                            <input type="text" value={r.condicion} onChange={(e) => updateRule({ condicion: e.target.value })}
                              placeholder="Condición personalizada"
                              className="w-full mt-1.5 rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-amber/40" />
                          )}
                        </div>
                        <div className="w-48">
                          <label className="block text-[11px] font-medium text-gray-400 mb-1">Fuentes</label>
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={toggleTodas}
                              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${isAllSources ? 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/40' : 'bg-surface-600 text-gray-400 border-surface-500 hover:border-gray-400'}`}>
                              Todas
                            </button>
                            {allChannels.map((canal) => (
                              <button key={canal} type="button" onClick={() => toggleFuente(canal)}
                                className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${r.fuentes.includes(canal) && !isAllSources ? 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/40' : !isAllSources ? 'bg-surface-600 text-gray-400 border-surface-500 hover:border-gray-400' : 'bg-surface-600 text-gray-500 border-surface-500 opacity-50'}`}
                                disabled={isAllSources}>
                                {canal === 'llamadas' ? 'Llamadas' : canal === 'videollamadas' ? 'Citas' : 'Chats'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-[11px] font-medium text-gray-400">Acciones ({r.acciones.length})</label>
                        {r.acciones.map((a, ai) => (
                          <div key={ai} className="rounded-lg p-3 bg-surface-600/50 border border-surface-500 space-y-2">
                            <div className="flex flex-wrap gap-2 items-end">
                              <div className="w-44">
                                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Tipo</label>
                                <select value={a.tipo} onChange={(e) => updateAccion(ai, { tipo: e.target.value as AccionReglaLocal['tipo'], valor: '', funnelStage: undefined, metrica_id: undefined, metrica_incremento: undefined, categoria_id: undefined, fieldId: undefined, prompt: undefined })}
                                  className="w-full rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white">
                                  <option value="asignar_etiqueta">Poner etiqueta</option>
                                  <option value="escribir_campo_ghl">Escribir en un campo de GHL</option>
                                  <option value="escribir_campo_ghl_ia">Llenar campo de GHL con IA</option>
                                  <option value="cambiar_estado">Cambiar estado</option>
                                  <option value="etapa_cambiada">Etapa cambiada</option>
                                  <option value="incrementar_metrica">Incrementar métrica</option>
                                  {categoriasLlamadas.length > 0 && <option value="asignar_categoria">Asignar categoría</option>}
                                </select>
                              </div>
                              {a.tipo === 'asignar_etiqueta' && (
                                <div className="flex-1 min-w-[120px]">
                                  <label className="block text-[10px] font-medium text-accent-cyan mb-0.5">Etiqueta</label>
                                  <input type="text" value={a.valor ?? ''} onChange={(e) => { const v = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''); updateAccion(ai, { valor: v }); }}
                                    placeholder="nombre_etiqueta" className="w-full rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-cyan/40" />
                                </div>
                              )}
                              {a.tipo === 'escribir_campo_ghl' && (
                                <>
                                  <div className="flex-1 min-w-[140px]">
                                    <label className="flex items-center gap-1 text-[10px] font-medium text-accent-green mb-0.5">
                                      Campo de GHL
                                      <HelpTooltip
                                        titulo="Campo de GHL"
                                        contenido={'El id o key de un custom field que YA existe en tu GHL. Cuando la condición se cumple, el sistema escribe ahí el texto que pongas al lado. Si el campo no existe, no hace nada (no rompe).'}
                                        comoProbar={'En GHL: Settings → Custom Fields. Copia el "Field Key" (ej. presupuesto_estado) o su id.'}
                                      />
                                    </label>
                                    <input type="text" value={a.fieldId ?? ''} onChange={(e) => updateAccion(ai, { fieldId: e.target.value || undefined })}
                                      placeholder="ej: presupuesto_estado" className="w-full rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-green/40" />
                                  </div>
                                  <div className="flex-1 min-w-[140px]">
                                    <label className="flex items-center gap-1 text-[10px] font-medium text-accent-green mb-0.5">
                                      Texto a escribir
                                      <HelpTooltip
                                        titulo="Texto a escribir"
                                        contenido={'El texto exacto que se guardará en ese campo del contacto cuando la condición se cumpla.'}
                                        comoProbar={'Ej: Presupuesto_mayor_5000. Después de una llamada que cumpla la condición, revisa el contacto en GHL y verás ese texto en el campo.'}
                                      />
                                    </label>
                                    <input type="text" value={a.valor ?? ''} onChange={(e) => updateAccion(ai, { valor: e.target.value })}
                                      placeholder="ej: Presupuesto_mayor_5000" className="w-full rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-green/40" />
                                  </div>
                                </>
                              )}
                              {a.tipo === 'escribir_campo_ghl_ia' && (
                                <>
                                  <div className="flex-1 min-w-[140px]">
                                    <label className="flex items-center gap-1 text-[10px] font-medium text-accent-purple mb-0.5">
                                      ID del campo de GHL
                                      <HelpTooltip
                                        titulo="Campo de GHL (IA)"
                                        contenido={'El id o key de un custom field que YA existe en tu GHL. La IA escribirá ahí lo que le pidas en el mini-prompt. Si el campo no existe, no hace nada (no rompe).'}
                                        comoProbar={'En GHL: Settings → Custom Fields. Copia el "Field Key" (ej. resumen_interes) o su id.'}
                                      />
                                    </label>
                                    <input type="text" value={a.fieldId ?? ''} onChange={(e) => updateAccion(ai, { fieldId: e.target.value || undefined })}
                                      placeholder="ej: resumen_interes" className="w-full rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-purple/40" />
                                  </div>
                                  <div className="w-full">
                                    <label className="flex items-center gap-1 text-[10px] font-medium text-accent-purple mb-0.5">
                                      Mini-prompt
                                      <HelpTooltip
                                        titulo="Llenar campo de GHL con IA"
                                        contenido={'Si se cumple la condición en la llamada/cita, la IA escribe en ese campo de GHL lo que le pidas en el mini-prompt. Ej: condición "el lead menciona un inmueble" → campo "inmueble_interes" → prompt "escribe el inmueble que mencionó".'}
                                        comoProbar={'Crea la regla, espera una llamada/cita que cumpla la condición, y revisa el campo del contacto en GHL — verás el texto generado por la IA.'}
                                      />
                                    </label>
                                    <textarea value={a.prompt ?? ''} onChange={(e) => updateAccion(ai, { prompt: e.target.value })}
                                      placeholder="ej: Resume en 1 frase por qué el lead está interesado"
                                      className="w-full rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white min-h-[60px] focus:ring-2 focus:ring-accent-purple/40" />
                                  </div>
                                </>
                              )}
                              {a.tipo === 'cambiar_estado' && (
                                <div className="flex-1 min-w-[120px]">
                                  <label className="block text-[10px] font-medium text-accent-cyan mb-0.5">Estado</label>
                                  <input type="text" value={a.valor ?? ''} onChange={(e) => updateAccion(ai, { valor: e.target.value })}
                                    placeholder="nuevo_estado" className="w-full rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-cyan/40" />
                                </div>
                              )}
                              {a.tipo === 'etapa_cambiada' && (
                                <div className="flex-1 min-w-[140px]">
                                  <label className="block text-[10px] font-medium text-accent-purple mb-0.5">Etapa del embudo</label>
                                  <select value={a.funnelStage ?? ''} onChange={(e) => updateAccion(ai, { funnelStage: e.target.value || undefined, valor: e.target.value || undefined })}
                                    className="w-full rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white">
                                    <option value="">— Seleccionar —</option>
                                    {embudoEtapas.map((e) => (<option key={e.id} value={e.nombre}>{e.nombre}</option>))}
                                  </select>
                                </div>
                              )}
                              {a.tipo === 'incrementar_metrica' && (
                                <>
                                  <div className="flex-1 min-w-[140px]">
                                    <label className="block text-[10px] font-medium text-accent-cyan mb-0.5">Métrica</label>
                                    <select value={a.metrica_id ?? ''} onChange={(e) => updateAccion(ai, { metrica_id: e.target.value || undefined })}
                                      className="w-full rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white">
                                      <option value="">— Seleccionar —</option>
                                      {metricasConfig
                                        .filter((m) => m.tipo === 'manual' || m.tipo === 'fija' || m.tipo === 'webhook')
                                        .sort((a, b) => { const order: Record<string, number> = { manual: 0, fija: 1, webhook: 2 }; return (order[a.tipo] ?? 9) - (order[b.tipo] ?? 9); })
                                        .map((m) => (<option key={m.id} value={m.id}>{m.nombre}{m.tipo === 'webhook' ? ' (webhook)' : ''}</option>))}
                                    </select>
                                  </div>
                                  <div className="w-20">
                                    <label className="block text-[10px] font-medium text-accent-cyan mb-0.5">+</label>
                                    <input type="number" min="1" value={a.metrica_incremento ?? 1} onChange={(e) => updateAccion(ai, { metrica_incremento: parseInt(e.target.value) || 1 })}
                                      className="w-full rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white" />
                                  </div>
                                </>
                              )}
                              {a.tipo === 'asignar_categoria' && categoriasLlamadas.length > 0 && (
                                <div className="flex-1 min-w-[140px]">
                                  <label className="block text-[10px] font-medium text-accent-purple mb-0.5">Categoría</label>
                                  <select value={a.categoria_id ?? ''} onChange={(e) => updateAccion(ai, { categoria_id: e.target.value || undefined })}
                                    className="w-full rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white">
                                    <option value="">— Seleccionar categoría —</option>
                                    {categoriasLlamadas.map((cat) => (<option key={cat.id} value={cat.id}>{cat.nombre}</option>))}
                                  </select>
                                </div>
                              )}
                              {r.acciones.length > 1 && (
                                <button type="button" onClick={() => removeAccion(ai)} className="text-gray-500 hover:text-red-400 transition-colors p-1">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={addAccion}
                          className="text-[11px] text-accent-amber hover:text-accent-amber/80 transition-colors flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Agregar acción
                        </button>
                      </div>

                      {/* ── Bloquear etiquetas si esta regla aplica ── */}
                      <div className="rounded-lg p-3 bg-surface-600/30 border border-surface-500 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] font-medium text-gray-400">Bloquear etiquetas si esta regla aplica</label>
                          <HelpTooltip
                            titulo="¿Qué hace esto?"
                            contenido="Cuando esta regla se cumple, las etiquetas seleccionadas aquí NO se aplicarán al lead, aunque otra regla las active. Útil para que etiquetas superiores (ej. INTERESADO) bloqueen etiquetas inferiores contradictorias (ej. no_califica)."
                          />
                        </div>
                        {(() => {
                          const allTags = tagRules
                            .flatMap((tr) => tr.acciones.filter((a) => a.tipo === 'asignar_etiqueta' && a.valor).map((a) => a.valor as string))
                            .filter((v, i, arr) => arr.indexOf(v) === i)
                            .filter((v) => !r.acciones.some((a) => a.tipo === 'asignar_etiqueta' && a.valor === v));
                          const currentExcluye = r.excluye ?? [];
                          if (allTags.length === 0) {
                            return <p className="text-[10px] text-gray-500 italic">No hay otras etiquetas configuradas en las reglas.</p>;
                          }
                          return (
                            <div className="flex flex-wrap gap-1.5">
                              {allTags.map((tag) => {
                                const selected = currentExcluye.includes(tag);
                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => {
                                      const next = selected
                                        ? currentExcluye.filter((t) => t !== tag)
                                        : [...currentExcluye, tag];
                                      updateRule({ excluye: next });
                                    }}
                                    className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                                      selected
                                        ? 'bg-red-500/20 text-red-400 border-red-500/40'
                                        : 'bg-surface-600 text-gray-400 border-surface-500 hover:border-gray-400'
                                    }`}
                                  >
                                    {selected ? '✕ ' : ''}{tag}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex justify-end">
                        <button type="button" onClick={() => setTagRules((prev) => prev.filter((x) => x.id !== r.id))}
                          className="text-[10px] text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> Eliminar regla
                        </button>
                      </div>
                    {/* Bloque "Valor dinámico" oculto de la UI tras el pivote de AUT-1241 (modelo simple condición→acción).
                        Se conserva el código y el schema `dynamicValue` para retro-compatibilidad con reglas existentes. */}
                    {MOSTRAR_VALOR_DINAMICO && r.acciones.some(a => a.tipo === 'asignar_etiqueta') && (
                      <div className="rounded-lg border border-surface-500 bg-surface-800/50 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!r.dynamicValue}
                              onChange={(e) => {
                                setTagRules((prev) => prev.map((x) => x.id === r.id ? {
                                  ...x,
                                  dynamicValue: e.target.checked ? { fuente: 'custom_field' as const, tipo: 'texto' as const } : undefined,
                                } : x));
                              }}
                              className="rounded border-surface-500 bg-surface-600 text-accent-cyan focus:ring-accent-cyan/40"
                            />
                            <span className="text-[11px] font-medium text-accent-cyan">Valor dinámico</span>
                          </label>
                          <span className="text-[10px] text-gray-500">Resuelve el valor desde un campo del contacto</span>
                        </div>
                        {r.dynamicValue && (
                          <div className="space-y-2 pl-4 border-l-2 border-accent-cyan/30">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="flex items-center gap-1 mb-1">
                                  <label className="text-[10px] font-medium text-gray-400">Fuente</label>
                                  <HelpTooltip
                                    titulo="¿De dónde sale el valor?"
                                    contenido={`Elige de dónde se lee el valor dinámico:\n\n• Campo personalizado (GHL) → lee un custom field del contacto en GoHighLevel.\n• Fórmula → calcula un valor a partir de otros campos (avanzado).`}
                                  />
                                </div>
                                <select
                                  value={r.dynamicValue.fuente}
                                  onChange={(e) => setTagRules((prev) => prev.map((x) => x.id === r.id ? {
                                    ...x, dynamicValue: { ...x.dynamicValue!, fuente: e.target.value as 'custom_field' | 'formula' },
                                  } : x))}
                                  className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1 text-xs text-white"
                                >
                                  <option value="custom_field">Campo personalizado (GHL)</option>
                                  <option value="formula">Fórmula</option>
                                </select>
                              </div>
                              <div>
                                <div className="flex items-center gap-1 mb-1">
                                  <label className="text-[10px] font-medium text-gray-400">Tipo de dato</label>
                                  <HelpTooltip
                                    titulo="¿Qué es el tipo de dato?"
                                    contenido={`Indica qué tipo de valor tiene el campo del contacto:\n\n• Texto → se usa tal cual como etiqueta (ej. "Premium")\n• Número → puedes definir rangos para convertirlo en etiqueta (ej. 75000 → "Medio")\n• Sí / No → asigna una etiqueta distinta según si el valor es verdadero o falso\n• Fecha → se usa la fecha tal cual`}
                                  />
                                </div>
                                <select
                                  value={r.dynamicValue.tipo ?? 'texto'}
                                  onChange={(e) => setTagRules((prev) => prev.map((x) => x.id === r.id ? {
                                    ...x, dynamicValue: { ...x.dynamicValue!, tipo: e.target.value as 'numero' | 'si_no' | 'texto' | 'fecha' },
                                  } : x))}
                                  className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1 text-xs text-white"
                                >
                                  <option value="texto">Texto (valor tal cual)</option>
                                  <option value="numero">Número (con rangos opcionales)</option>
                                  <option value="si_no">Sí / No</option>
                                  <option value="fecha">Fecha</option>
                                </select>
                              </div>
                            </div>
                            {r.dynamicValue.fuente === 'custom_field' && (
                              <div>
                                <div className="flex items-center gap-1 mb-1">
                                  <label className="text-[10px] font-medium text-gray-400">ID del campo en GHL</label>
                                  <HelpTooltip
                                    titulo="¿Qué poner aquí?"
                                    contenido={`Escribe el ID o key de un campo personalizado (custom field) que ya exista en tu cuenta de GoHighLevel.\n\nEjemplos:\n• presupuesto_mensual\n• numero_empleados\n• ingreso_anual\n\nEl sistema lee el valor de ese campo desde el contacto. Si el campo no existe o está vacío, simplemente no se asigna la etiqueta (no causa error).`}
                                    comoProbar="Ve a GHL → Contactos → Custom Fields. Copia el ID del campo que quieras usar y pégalo aquí."
                                  />
                                </div>
                                <input
                                  type="text"
                                  value={r.dynamicValue.fieldId ?? ''}
                                  onChange={(e) => setTagRules((prev) => prev.map((x) => x.id === r.id ? {
                                    ...x, dynamicValue: { ...x.dynamicValue!, fieldId: e.target.value || undefined },
                                  } : x))}
                                  placeholder="ej: presupuesto_mensual"
                                  className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1 text-xs text-white focus:ring-2 focus:ring-accent-cyan/40"
                                />
                              </div>
                            )}
                            {r.dynamicValue.fuente === 'formula' && (
                              <div>
                                <label className="block text-[10px] font-medium text-gray-400 mb-1">Fórmula</label>
                                <input
                                  type="text"
                                  value={r.dynamicValue.formula ?? ''}
                                  onChange={(e) => setTagRules((prev) => prev.map((x) => x.id === r.id ? {
                                    ...x, dynamicValue: { ...x.dynamicValue!, formula: e.target.value || undefined },
                                  } : x))}
                                  placeholder="ej: campo_a / campo_b * 100"
                                  className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1 text-xs text-white focus:ring-2 focus:ring-accent-cyan/40"
                                />
                              </div>
                            )}
                            {(r.dynamicValue.tipo ?? 'texto') === 'si_no' && (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <div className="flex items-center gap-1 mb-1">
                                    <label className="text-[10px] font-medium text-gray-400">Etiqueta si es Sí</label>
                                    <HelpTooltip
                                      titulo="Etiqueta para Sí"
                                      contenido={`Texto que se asigna como etiqueta cuando el valor del campo es verdadero (true, "yes", "sí", 1).\n\nEjemplo: si el campo es "tiene_presupuesto" y el valor es Sí → se asigna esta etiqueta.`}
                                    />
                                  </div>
                                  <input
                                    type="text"
                                    value={r.dynamicValue.labelSi ?? ''}
                                    onChange={(e) => setTagRules((prev) => prev.map((x) => x.id === r.id ? {
                                      ...x, dynamicValue: { ...x.dynamicValue!, labelSi: e.target.value || undefined },
                                    } : x))}
                                    placeholder="ej: Con presupuesto"
                                    className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1 text-xs text-white focus:ring-2 focus:ring-accent-cyan/40"
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center gap-1 mb-1">
                                    <label className="text-[10px] font-medium text-gray-400">Etiqueta si es No</label>
                                    <HelpTooltip
                                      titulo="Etiqueta para No"
                                      contenido={`Texto que se asigna como etiqueta cuando el valor del campo es falso (false, "no", 0, vacío).\n\nEjemplo: si el campo es "tiene_presupuesto" y el valor es No → se asigna esta etiqueta.`}
                                    />
                                  </div>
                                  <input
                                    type="text"
                                    value={r.dynamicValue.labelNo ?? ''}
                                    onChange={(e) => setTagRules((prev) => prev.map((x) => x.id === r.id ? {
                                      ...x, dynamicValue: { ...x.dynamicValue!, labelNo: e.target.value || undefined },
                                    } : x))}
                                    placeholder="ej: Sin presupuesto"
                                    className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1 text-xs text-white focus:ring-2 focus:ring-accent-cyan/40"
                                  />
                                </div>
                              </div>
                            )}
                            {(r.dynamicValue.tipo === 'numero' || (!r.dynamicValue.tipo && (r.dynamicValue.ranges?.length ?? 0) > 0)) && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1">
                                  <label className="text-[10px] font-medium text-gray-400">Rangos (opcional)</label>
                                  <HelpTooltip
                                    titulo="¿Cómo funcionan los rangos?"
                                    contenido={`Los rangos convierten un número en una etiqueta de texto por tramos.\n\nEjemplo con 3 rangos:\n• ≥ 0 → "Bajo"\n• ≥ 50000 → "Medio"\n• ≥ 100000 → "Alto"\n\nSi el valor del campo es 75000 → la etiqueta será "Medio" (el rango más alto cuyo mínimo no supera 75000).\n\nSin rangos, el valor numérico se usa tal cual como etiqueta.`}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setTagRules((prev) => prev.map((x) => x.id === r.id ? {
                                    ...x, dynamicValue: { ...x.dynamicValue!, ranges: [...(x.dynamicValue?.ranges ?? []), { min: 0, label: '' }] },
                                  } : x))}
                                  className="text-[10px] text-accent-cyan hover:text-accent-cyan/80"
                                >
                                  + Rango
                                </button>
                              </div>
                              {(r.dynamicValue.ranges ?? []).map((range, ri) => (
                                <div key={ri} className="flex items-center gap-2 mb-1">
                                  <input
                                    type="number"
                                    value={range.min}
                                    onChange={(e) => {
                                      const newRanges = [...(r.dynamicValue?.ranges ?? [])];
                                      newRanges[ri] = { ...newRanges[ri], min: parseFloat(e.target.value) || 0 };
                                      setTagRules((prev) => prev.map((x) => x.id === r.id ? {
                                        ...x, dynamicValue: { ...x.dynamicValue!, ranges: newRanges },
                                      } : x));
                                    }}
                                    placeholder="≥"
                                    className="w-20 rounded-lg bg-surface-600 border border-surface-500 px-2 py-1 text-xs text-white"
                                  />
                                  <span className="text-[10px] text-gray-500">→</span>
                                  <input
                                    type="text"
                                    value={range.label}
                                    onChange={(e) => {
                                      const newRanges = [...(r.dynamicValue?.ranges ?? [])];
                                      newRanges[ri] = { ...newRanges[ri], label: e.target.value };
                                      setTagRules((prev) => prev.map((x) => x.id === r.id ? {
                                        ...x, dynamicValue: { ...x.dynamicValue!, ranges: newRanges },
                                      } : x));
                                    }}
                                    placeholder="Etiqueta del rango"
                                    className="flex-1 rounded-lg bg-surface-600 border border-surface-500 px-2 py-1 text-xs text-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newRanges = (r.dynamicValue?.ranges ?? []).filter((_, i) => i !== ri);
                                      setTagRules((prev) => prev.map((x) => x.id === r.id ? {
                                        ...x, dynamicValue: { ...x.dynamicValue!, ranges: newRanges.length ? newRanges : undefined },
                                      } : x));
                                    }}
                                    className="text-gray-500 hover:text-red-400"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    </li>
                  );
                })}
              </ul>
              <button type="button" onClick={addTagRule} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent-amber/20 text-accent-amber border border-accent-amber/40 hover:bg-accent-amber/30 transition-all">
                <Tag className="w-4 h-4" /> + Añadir regla
              </button>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-4">
              {/* ── Sección: Dashboards personalizados ── */}
              <div className="rounded-xl border border-surface-500 bg-surface-700/30 p-4 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-accent-cyan/20">
                  <div className="rounded-lg p-1.5 bg-accent-cyan/10 border border-accent-cyan/30">
                    <span className="text-base">📊</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Dashboards personalizados</h4>
                    <p className="text-xs text-gray-400">Crea hasta 3 paneles adicionales para organizar tus métricas.</p>
                  </div>
                </div>
                <DashboardsManager
                  dashboards={dashboardsPersonalizados}
                  onChange={(updated) => setDashboardsPersonalizados(updated)}
                />
              </div>

              {/* ── Sección: Ranking por asesor ── */}
              <div className="rounded-xl border border-surface-500 bg-surface-700/30 p-4 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-accent-cyan/20">
                  <div className="rounded-lg p-1.5 bg-accent-cyan/10 border border-accent-cyan/30">
                    <Users className="w-4 h-4 text-accent-cyan" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-white">Ranking por asesor</h4>
                    <p className="text-xs text-gray-400">Mostrar u ocultar el ranking y elegir la métrica base para ordenar.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSeccionesOcultas((prev) =>
                        prev.includes('panel_ranking')
                          ? prev.filter((s) => s !== 'panel_ranking')
                          : [...prev, 'panel_ranking'],
                      );
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${!seccionesOcultas.includes('panel_ranking') ? 'bg-accent-cyan' : 'bg-surface-500'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${!seccionesOcultas.includes('panel_ranking') ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </button>
                </div>
                {!seccionesOcultas.includes('panel_ranking') && (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400 block">Métrica base del ranking</label>
                    <select
                      value={rankingMetricaBase ?? 'score'}
                      onChange={(e) => setRankingMetricaBase(e.target.value === 'score' ? null : e.target.value)}
                      className="w-full rounded-lg bg-surface-700/80 border border-surface-500 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-accent-cyan/40 focus:border-accent-cyan/40 transition-colors"
                    >
                      <option value="score">Score compuesto (por defecto)</option>
                      <option value="leads">Leads trabajados</option>
                      <option value="generados">Leads nuevos</option>
                      <option value="reactivados">Leads reactivados</option>
                      <option value="con_actividad">Con actividad</option>
                      <option value="llamadas">Llamadas</option>
                      <option value="tiempo_lead">Tiempo al lead</option>
                      <option value="agendadas">Citas agendadas</option>
                      <option value="asistidas">Citas asistidas</option>
                      <option value="facturacion">Facturación</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="tasa_contacto">Tasa contacto</option>
                      <option value="tasa_agend">Tasa agendamiento</option>
                      {metricasConfig
                        .filter((m) => m.atribuible_a_usuario && m.webhookCampo)
                        .map((m) => (
                          <option key={m.id} value={`webhook:${m.webhookCampo}`}>
                            {m.nombre}
                          </option>
                        ))}
                    </select>
                    <p className="text-[10px] text-gray-500">
                      Las métricas custom webhook aparecen aquí solo si tienen &quot;Atribuible a asesor&quot; activado.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pb-2 border-b border-accent-green/30">
                <div className="rounded-lg p-2 bg-accent-green/20 border border-accent-green/40"><BarChart3 className="w-5 h-5 text-accent-green" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Métricas personalizadas</h3>
                  <p className="text-sm text-gray-400">Manuales (campos) o automáticas (fórmulas). Arrastra para ordenar.</p>
                </div>
              </div>

              {/* ── Buscador + Filtro por panel ── */}
              {(() => {
                const panelLabels: Record<string, string> = {
                  panel_ejecutivo: 'Panel ejecutivo',
                  rendimiento: 'Rendimiento',
                  ambos: 'Ambos',
                };
                dashboardsPersonalizados.forEach((d) => {
                  panelLabels[d.id] = d.nombre;
                });
                const panelesUsados = Array.from(
                  new Set(
                    metricasConfig.flatMap((m) => {
                      if (m.paneles && m.paneles.length > 0) return m.paneles;
                      if (m.ubicacion) return [m.ubicacion];
                      return [];
                    }),
                  ),
                );
                return (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                      <input
                        type="text"
                        value={metricasBusqueda}
                        onChange={(e) => setMetricasBusqueda(e.target.value)}
                        placeholder="Buscar métrica por nombre…"
                        className="w-full rounded-lg bg-surface-700/80 border border-surface-500 pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-accent-green/40 focus:border-accent-green/40 transition-colors"
                      />
                    </div>
                    {panelesUsados.length > 1 && (
                      <div className="flex items-center gap-1.5">
                        <ListFilter className="w-4 h-4 text-gray-500 shrink-0" />
                        <HelpTooltip
                          titulo="Filtro por panel"
                          contenido="Filtra las métricas según el panel al que pertenecen. Cada métrica se asigna a uno o más paneles (Ejecutivo, Rendimiento, Guardias, etc.). Usa este filtro para ver solo las de un panel específico."
                        />
                        <select
                          value={metricasFiltroPanel}
                          onChange={(e) => setMetricasFiltroPanel(e.target.value)}
                          className="rounded-lg bg-surface-700/80 border border-surface-500 px-2 py-2 text-sm text-white focus:ring-2 focus:ring-accent-green/40 focus:border-accent-green/40 transition-colors"
                        >
                          <option value="todos">Todos los paneles</option>
                          {panelesUsados.map((p) => (
                            <option key={p} value={p}>
                              {panelLabels[p] ?? p}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })()}

              {(() => {
                const isFiltering = metricasBusqueda !== '' || metricasFiltroPanel !== 'todos';
                const sorted = [...metricasConfig].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));
                const filteredMetricas = isFiltering
                  ? sorted.filter((m) => {
                      if (metricasBusqueda && !m.nombre.toLowerCase().includes(metricasBusqueda.toLowerCase())) return false;
                      if (metricasFiltroPanel !== 'todos') {
                        const mp = (m.paneles && m.paneles.length > 0) ? m.paneles : m.ubicacion ? [m.ubicacion] : [];
                        if (metricasFiltroPanel === 'ambos') {
                          if (!mp.includes('ambos') && !mp.includes('panel_ejecutivo') && !mp.includes('rendimiento')) return false;
                        } else if (!mp.includes(metricasFiltroPanel as typeof mp[number]) && !mp.includes('ambos')) return false;
                      }
                      return true;
                    })
                  : sorted;
                return (
                  <>
                    <DndContext
                      sensors={dndSensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(event: DragEndEvent) => {
                        const { active, over } = event;
                        if (over && active.id !== over.id) {
                          setMetricasConfig((prev) => {
                            const ids = prev.map((x) => x.id);
                            const oldIdx = ids.indexOf(String(active.id));
                            const newIdx = ids.indexOf(String(over.id));
                            if (oldIdx === -1 || newIdx === -1) return prev;
                            const reordered = arrayMove(prev, oldIdx, newIdx);
                            return reordered.map((mi, i) => ({ ...mi, orden: i }));
                          });
                        }
                      }}
                    >
                      <SortableContext items={metricasConfig.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                        <ul className="space-y-2">
                          {filteredMetricas.map((m) => (
                            <SortableMetricaCard
                              key={m.id}
                              m={m}
                              onEdit={() => {
                                setMetricasEditingId(m.id);
                                setMetricasSheetTipo(m.tipo as 'manual' | 'automatica' | 'fija' | 'webhook' | 'chat');
                                setMetricasSheetOpen(true);
                              }}
                              onDelete={() => {
                                const deps = getMetricasQueDependenDe(m.id, metricasConfig);
                                if (deps.length > 0) {
                                  setMetricasDeleteConfirm({ id: m.id, dependientes: deps });
                                } else {
                                  setMetricasConfig((prev) => prev.filter((x) => x.id !== m.id));
                                  setMetricasManualData((prev) => {
                                    const next = { ...prev };
                                    delete next[m.id];
                                    return next;
                                  });
                                }
                              }}
                            />
                          ))}
                        </ul>
                      </SortableContext>
                    </DndContext>
                    {isFiltering && (
                      <p className="text-xs text-gray-500">
                        {filteredMetricas.length === 0
                          ? 'No hay métricas que coincidan con el filtro.'
                          : `Mostrando ${filteredMetricas.length} de ${metricasConfig.length} métricas.`}
                      </p>
                    )}
                  </>
                );
              })()}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMetricasEditingId(null);
                    setMetricasSheetTipo('manual');
                    setMetricasSheetOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent-green/20 text-accent-green border border-accent-green/50 hover:bg-accent-green/30"
                >
                  <Plus className="w-4 h-4" /> Manual
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMetricasEditingId(null);
                    setMetricasSheetTipo('automatica');
                    setMetricasSheetOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/50 hover:bg-accent-cyan/30"
                >
                  <Plus className="w-4 h-4" /> Automática
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMetricasEditingId(null);
                    setMetricasSheetTipo('webhook');
                    setMetricasSheetOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent-purple/20 text-accent-purple border border-accent-purple/50 hover:bg-accent-purple/30"
                >
                  <Plus className="w-4 h-4" /> Webhook / Ads
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMetricasEditingId(null);
                    setMetricasSheetTipo('chat');
                    setMetricasSheetOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/30"
                >
                  <Plus className="w-4 h-4" /> Chat
                </button>
              </div>
              {metricasDeleteConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/60" onClick={() => setMetricasDeleteConfirm(null)} aria-hidden />
                  <div className="relative rounded-xl bg-surface-800 border border-surface-500 p-4 max-w-md">
                    <h4 className="font-semibold text-white mb-2">No se puede eliminar</h4>
                    <p className="text-sm text-gray-400 mb-3">
                      Esta métrica es fuente de {metricasDeleteConfirm.dependientes.length} otra(s):{' '}
                      <span className="text-white font-medium">{metricasDeleteConfirm.dependientes.map((d) => d.nombre).join(', ')}</span>.
                      Edita o elimina primero las métricas dependientes.
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setMetricasDeleteConfirm(null)}
                        className="px-3 py-1.5 rounded-lg bg-surface-600 text-gray-300"
                      >
                        Entendido
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {metricasSheetOpen && (
                <MetricaEditSheet
                  metricasConfig={metricasConfig}
                  metricasManualData={metricasManualData}
                  editingMetric={metricasEditingId ? metricasConfig.find((x) => x.id === metricasEditingId) ?? null : null}
                  tipoInicial={metricasSheetTipo}
                  dashboardsPersonalizados={dashboardsPersonalizados}
                  subdominio={typeof window !== "undefined" ? window.location.hostname.replace(`.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "leadmaster.com.co"}`, "").replace(".localhost", "") : undefined}
                  onClose={() => {
                    setMetricasSheetOpen(false);
                    setMetricasEditingId(null);
                  }}
                  onSave={async (config, manualData) => {
                    const prev = metricasConfig;
                    const idx = prev.findIndex((x) => x.id === config.id);
                    const next = [...prev];
                    if (idx >= 0) {
                      next[idx] = config;
                    } else {
                      next.push(config);
                    }
                    const sorted = next.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));

                    const res = await fetch('/api/data/system-config', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ metricas_config: sorted }),
                    });

                    if (!res.ok) {
                      const err = await res.json().catch(() => null) as { refsColgantes?: Array<{ metricaNombre: string; fuenteFaltante: string }> } | null;
                      if (err?.refsColgantes?.length) {
                        const detalles = err.refsColgantes.map((r) => `"${r.metricaNombre}" usa fuente inexistente "${r.fuenteFaltante}"`).join('; ');
                        toast.error(`No se pudo guardar: ${detalles}`);
                      } else {
                        toast.error('Error al guardar la configuración de métricas');
                      }
                      throw new Error('save_failed');
                    }

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
                  }}
                />
              )}
            </div>
          )}

          {currentStep === 6 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 pb-2 border-b border-accent-cyan/30">
                <div className="rounded-lg p-2 bg-accent-cyan/20 border border-accent-cyan/40"><Target className="w-5 h-5 text-accent-cyan" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Establecer metas por canal</h3>
                  <p className="text-sm text-gray-400">Configura metas independientes para cada canal. Solo activa los canales que uses.</p>
                </div>
              </div>

              {/* ── Distribución de leads (universal) ────────────── */}
              <div className="rounded-xl border border-surface-500/60 bg-surface-700/40 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">📊</span>
                  <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Distribución de leads nuevos</h4>
                </div>
                <p className="text-[11px] text-gray-500">¿Cuántos leads nuevos se asignan a un asesor según el día en que ingresan? (Para alertas de bandeja.)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-accent-purple mb-1">Leads nuevos — día 1</label>
                    <input type="number" min={0} value={metas.leads_nuevos_dia_1} onChange={(e) => setMetas((m) => ({ ...m, leads_nuevos_dia_1: Math.max(0, +e.target.value || 0) }))}
                      className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-purple/40" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-accent-purple mb-1">Leads nuevos — día 2</label>
                    <input type="number" min={0} value={metas.leads_nuevos_dia_2} onChange={(e) => setMetas((m) => ({ ...m, leads_nuevos_dia_2: Math.max(0, +e.target.value || 0) }))}
                      className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-purple/40" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-accent-purple mb-1">Leads nuevos — día 3</label>
                    <input type="number" min={0} value={metas.leads_nuevos_dia_3} onChange={(e) => setMetas((m) => ({ ...m, leads_nuevos_dia_3: Math.max(0, +e.target.value || 0) }))}
                      className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-purple/40" />
                  </div>
                </div>
              </div>

              {/* ── Canal: Llamadas ───────────────────────────────── */}
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">📞</span>
                  <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Canal Llamadas</h4>
                </div>
                <p className="text-[11px] text-gray-500">Metas para el equipo de calling (SDRs / closers telefónicos). Deja vacío lo que no aplique.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-blue-300 mb-1">Llamadas diarias por asesor</label>
                    <input type="number" min={1} value={metas.meta_llamadas_diarias} onChange={(e) => setMetas((m) => ({ ...m, meta_llamadas_diarias: Math.max(1, +e.target.value || 1) }))}
                      className="w-full rounded-lg bg-surface-600 border border-blue-500/30 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-blue-500/40" />
                    <p className="text-[10px] text-gray-600 mt-0.5">Total de llamadas que debe hacer cada asesor por día.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-blue-300 mb-1">Llamadas semanales totales (equipo)</label>
                    <input type="number" min={0} value={metas.meta_llamadas_semanales ?? ''} onChange={(e) => setMetas((m) => ({ ...m, meta_llamadas_semanales: e.target.value ? Math.max(0, +e.target.value) : null }))}
                      placeholder="Sin meta"
                      className="w-full rounded-lg bg-surface-600 border border-blue-500/30 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-blue-500/40" />
                    <p className="text-[10px] text-gray-600 mt-0.5">Si se define, reemplaza el cálculo diario×días en alertas.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-blue-300 mb-1">Meta % contestación de llamadas</label>
                    <input type="number" min={0} max={100} step={1} value={metas.meta_contestacion_llamadas ?? ''} onChange={(e) => setMetas((m) => ({ ...m, meta_contestacion_llamadas: e.target.value ? Math.max(0, +e.target.value) : null }))}
                      placeholder="Ej. 60"
                      className="w-full rounded-lg bg-surface-600 border border-blue-500/30 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-blue-500/40" />
                    <p className="text-[10px] text-gray-600 mt-0.5">% de llamadas que deben ser contestadas. Ej: 60%.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-blue-300 mb-1">Speed to lead máximo (min) 🔻</label>
                    <input type="number" min={0} step={0.5} value={metas.meta_speed_llamadas_min ?? metas.meta_speed_to_lead_min ?? ''} onChange={(e) => setMetas((m) => ({ ...m, meta_speed_llamadas_min: e.target.value ? Math.max(0, +e.target.value) : null, meta_speed_to_lead_min: e.target.value ? Math.max(0, +e.target.value) : null }))}
                      placeholder="Ej. 5"
                      className="w-full rounded-lg bg-surface-600 border border-blue-500/30 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-blue-500/40" />
                    <p className="text-[10px] text-gray-600 mt-0.5">Tiempo máximo en minutos para contactar un lead. Verde = menor al límite.</p>
                  </div>
                </div>
              </div>

              {/* ── Canal: Videollamadas ─────────────────────────── */}
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">🎥</span>
                  <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Canal Citas</h4>
                </div>
                <p className="text-[11px] text-gray-500">Metas para el canal de citas / agendas (closers). Solo configura si usas este canal.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-purple-300 mb-1">Citas semanales agendadas</label>
                    <input type="number" min={0} value={metas.meta_citas_semanales_video ?? metas.meta_citas_semanales ?? ''} onChange={(e) => setMetas((m) => ({ ...m, meta_citas_semanales_video: e.target.value ? Math.max(0, +e.target.value) : null, meta_citas_semanales: e.target.value ? Math.max(0, +e.target.value) : null }))}
                      placeholder="Sin meta"
                      className="w-full rounded-lg bg-surface-600 border border-purple-500/30 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-purple-500/40" />
                    <p className="text-[10px] text-gray-600 mt-0.5">Citas agendadas por semana que debe alcanzar el equipo.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-purple-300 mb-1">Cierres semanales</label>
                    <input type="number" min={0} value={metas.meta_cierres_semanales ?? ''} onChange={(e) => setMetas((m) => ({ ...m, meta_cierres_semanales: e.target.value ? Math.max(0, +e.target.value) : null }))}
                      placeholder="Sin meta"
                      className="w-full rounded-lg bg-surface-600 border border-purple-500/30 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-purple-500/40" />
                    <p className="text-[10px] text-gray-600 mt-0.5">Número de ventas cerradas por semana.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-purple-300 mb-1">Meta % cierre (de citas asistidas)</label>
                    <input type="number" min={0} max={100} step={1} value={metas.meta_cierre_video ?? ''} onChange={(e) => setMetas((m) => ({ ...m, meta_cierre_video: e.target.value ? Math.max(0, +e.target.value) : null }))}
                      placeholder="Ej. 30"
                      className="w-full rounded-lg bg-surface-600 border border-purple-500/30 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-purple-500/40" />
                    <p className="text-[10px] text-gray-600 mt-0.5">% de citas que deben convertirse en venta. Ej: 30%.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-purple-300 mb-1">Revenue mensual ($)</label>
                    <input type="number" min={0} value={metas.meta_revenue_video ?? metas.meta_revenue_mensual ?? ''} onChange={(e) => setMetas((m) => ({ ...m, meta_revenue_video: e.target.value ? Math.max(0, +e.target.value) : null, meta_revenue_mensual: e.target.value ? Math.max(0, +e.target.value) : null }))}
                      placeholder="Sin meta"
                      className="w-full rounded-lg bg-surface-600 border border-purple-500/30 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-purple-500/40" />
                    <p className="text-[10px] text-gray-600 mt-0.5">Revenue total mensual a alcanzar por citas.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Meta cash collected mensual ($)</label>
                    <input type="number" min={0} value={metas.meta_cash_collected_mensual ?? ''} onChange={(e) => setMetas((m) => ({ ...m, meta_cash_collected_mensual: e.target.value ? Math.max(0, +e.target.value) : null }))}
                      placeholder="Sin meta"
                      className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-purple/40" />
                  </div>
                </div>
              </div>

              {/* ── Canal: Chats ─────────────────────────────────── */}
              <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">💬</span>
                  <h4 className="text-xs font-semibold text-green-400 uppercase tracking-wider">Canal Chats</h4>
                </div>
                <p className="text-[11px] text-gray-500">Metas para el canal de mensajería / chats. Solo configura si tu equipo gestiona chats activamente.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-green-300 mb-1">Chats diarios atendidos</label>
                    <input type="number" min={0} value={metas.meta_chats_diarios ?? ''} onChange={(e) => setMetas((m) => ({ ...m, meta_chats_diarios: e.target.value ? Math.max(0, +e.target.value) : null }))}
                      placeholder="Sin meta"
                      className="w-full rounded-lg bg-surface-600 border border-green-500/30 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-green-500/40" />
                    <p className="text-[10px] text-gray-600 mt-0.5">Total de chats que el equipo debe atender por día.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-green-300 mb-1">Meta % chats con respuesta</label>
                    <input type="number" min={0} max={100} step={1} value={metas.meta_chats_contestacion ?? ''} onChange={(e) => setMetas((m) => ({ ...m, meta_chats_contestacion: e.target.value ? Math.max(0, +e.target.value) : null }))}
                      placeholder="Ej. 90"
                      className="w-full rounded-lg bg-surface-600 border border-green-500/30 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-green-500/40" />
                    <p className="text-[10px] text-gray-600 mt-0.5">% de chats entrantes que deben recibir respuesta del equipo.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-green-300 mb-1">Speed to lead en chat (min) 🔻</label>
                    <input type="number" min={0} step={0.5} value={metas.meta_speed_chat_min ?? ''} onChange={(e) => setMetas((m) => ({ ...m, meta_speed_chat_min: e.target.value ? Math.max(0, +e.target.value) : null }))}
                      placeholder="Ej. 2"
                      className="w-full rounded-lg bg-surface-600 border border-green-500/30 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-green-500/40" />
                    <p className="text-[10px] text-gray-600 mt-0.5">Tiempo máximo en minutos para responder un chat. Verde = bajo el límite.</p>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-gray-500">🔻 = métrica invertida: menor valor es mejor. Deja vacío cualquier campo que no aplique a tu operación.</p>

              {/* ── Metas por Rol ─────────────────────────────────── */}
              <div className="mt-6 rounded-xl border border-surface-500 bg-surface-800/60 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎯</span>
                  <h4 className="text-sm font-semibold text-white">Metas por Rol</h4>
                  <span className="relative group ml-1">
                    <HelpCircle className="w-3.5 h-3.5 text-gray-500 cursor-help" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-2 rounded-lg bg-surface-900 border border-surface-500 text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      Un closer junior puede tener meta de 30 llamadas/día mientras un senior tiene 50. Configura metas específicas por rol para un seguimiento más justo.
                    </span>
                  </span>
                </div>
                <p className="text-[11px] text-gray-400">Define metas diferentes según el rol del asesor en tu equipo.</p>
                {rolesConfig.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-surface-500 bg-surface-700/30 px-4 py-4 text-center text-[11px] text-gray-500">
                    Configura roles en <strong className="text-gray-400">Sistema → Configuración</strong> para usar esta función.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rolesConfig.map((rol) => {
                      const metaRol = metasPorRol.find((m) => m.rol_id === rol.id) ?? {
                        rol_id: rol.id,
                        rol_nombre: rol.nombre,
                        meta_llamadas_diarias: null,
                        meta_chats_diarios: null,
                        meta_cierres_semanales: null,
                        meta_contestacion: null,
                      };
                      const updateMeta = (patch: Partial<MetaPorRolLocal>) => {
                        setMetasPorRol((prev) => {
                          const exists = prev.find((m) => m.rol_id === rol.id);
                          if (exists) {
                            return prev.map((m) => m.rol_id === rol.id ? { ...m, ...patch } : m);
                          }
                          return [...prev, { ...metaRol, ...patch }];
                        });
                      };
                      return (
                        <div key={rol.id} className="rounded-lg border border-surface-500 bg-surface-700/50 p-3 space-y-2">
                          <p className="text-xs font-semibold text-accent-cyan">{rol.nombre}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-1">Llamadas/día</label>
                              <input
                                type="number" min={0}
                                value={metaRol.meta_llamadas_diarias ?? ''}
                                onChange={(e) => updateMeta({ meta_llamadas_diarias: e.target.value ? Math.max(0, +e.target.value) : null })}
                                placeholder="Ej. 30"
                                className="w-full rounded bg-surface-600 border border-surface-400/30 px-2 py-1 text-xs text-white focus:ring-1 focus:ring-accent-cyan/40"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-1">Chats/día</label>
                              <input
                                type="number" min={0}
                                value={metaRol.meta_chats_diarios ?? ''}
                                onChange={(e) => updateMeta({ meta_chats_diarios: e.target.value ? Math.max(0, +e.target.value) : null })}
                                placeholder="Ej. 20"
                                className="w-full rounded bg-surface-600 border border-surface-400/30 px-2 py-1 text-xs text-white focus:ring-1 focus:ring-accent-cyan/40"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-1">Cierres/semana</label>
                              <input
                                type="number" min={0}
                                value={metaRol.meta_cierres_semanales ?? ''}
                                onChange={(e) => updateMeta({ meta_cierres_semanales: e.target.value ? Math.max(0, +e.target.value) : null })}
                                placeholder="Ej. 5"
                                className="w-full rounded bg-surface-600 border border-surface-400/30 px-2 py-1 text-xs text-white focus:ring-1 focus:ring-accent-cyan/40"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-1">% Contestación</label>
                              <input
                                type="number" min={0} max={100}
                                value={metaRol.meta_contestacion ?? ''}
                                onChange={(e) => updateMeta({ meta_contestacion: e.target.value ? Math.max(0, +e.target.value) : null })}
                                placeholder="Ej. 60"
                                className="w-full rounded bg-surface-600 border border-surface-400/30 px-2 py-1 text-xs text-white focus:ring-1 focus:ring-accent-cyan/40"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 9 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-accent-purple/30">
                <div className="rounded-lg p-2 bg-accent-purple/20 border border-accent-purple/40"><Sparkles className="w-5 h-5 text-accent-purple" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Motor IA</h3>
                  <p className="text-sm text-gray-400">Toda la inteligencia del sistema funciona con Google Gemini.</p>
                </div>
              </div>
              <div className="rounded-lg border border-accent-purple/30 bg-accent-purple/5 px-4 py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-accent-purple shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white">Para usar las funciones de IA necesitas configurar tu API key de Gemini.</p>
                    <p className="text-xs text-gray-400 mt-1">El análisis de chats, llamadas, citas, reportes cualitativos y el coach de ventas funcionan con Google Gemini (modelo <code className="text-accent-purple">gemini-2.5-flash</code>). Sin llave propia, estas secciones aparecen bloqueadas.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(13)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-purple text-white text-sm font-semibold hover:bg-accent-purple/90 transition-colors"
                >
                  <Key className="w-4 h-4" />
                  Configurar llave de Gemini (Paso 13)
                </button>
              </div>
              <div className="rounded-lg border border-surface-500 bg-surface-700/40 px-3 py-3 text-xs text-gray-400 space-y-2">
                <p className="font-semibold text-gray-300">Costos estimados con Gemini 2.5 Flash</p>
                <div className="space-y-1 text-gray-500">
                  <p>Entrada: <span className="text-accent-amber">$0.30 / 1M tokens</span> · Salida: <span className="text-accent-amber">$2.50 / 1M tokens</span></p>
                  <p>Estimado por chat analizado: ~<span className="text-accent-green">$0.0004 USD</span></p>
                  <p>Estimado por llamada (transcripción + análisis): ~<span className="text-accent-green">$0.001 USD</span></p>
                </div>
                <div className="border-t border-surface-600 pt-2 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent-green shrink-0 mt-0.5" />
                  <p className="text-gray-400"><strong className="text-white">Somos transparentes contigo:</strong> solo te cobramos lo que consumes. Tu llave va directo a tu cuenta de Google AI Studio — los costos son tuyos, sin markup.</p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 12 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-accent-green/30">
                <div className="rounded-lg p-2 bg-accent-green/20 border border-accent-green/40"><ShieldCheck className="w-5 h-5 text-accent-green" /></div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-lg font-semibold text-white">Coach de ventas</h3>
                    <HelpTooltip
                      titulo="¿Qué es el Coach de ventas?"
                      contenido="El Coach evalúa automáticamente llamadas, chats y videollamadas contra un guion modelo que tú defines. La IA compara lo que dijo el asesor con las secciones del guion y genera un score de cumplimiento. Si el score queda debajo del umbral, se aplican tags y una nota con lo que faltó."
                    />
                  </div>
                  <p className="text-sm text-gray-400">Define guiones por canal. La IA evalúa cada interacción contra el guion y aplica tags + notas según cumplimiento.</p>
                </div>
              </div>

              <PremiumGate hasGeminiKey={hasGeminiKey} premiumStatus={geminiPremiumStatus}>
              {coachLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-accent-green mr-2" />
                  <span className="text-sm text-gray-400">Cargando configuración del coach...</span>
                </div>
              )}

              {coachHabilitado === false && !coachLoading && (
                <div className="rounded-xl p-5 border border-surface-500 bg-surface-800/50 text-center space-y-2">
                  <ShieldCheck className="w-8 h-8 text-gray-600 mx-auto" />
                  <p className="text-sm text-gray-400">El Coach de ventas no está habilitado para esta cuenta.</p>
                  <p className="text-xs text-gray-500">Contacta al equipo de LeadMaster para activar esta función.</p>
                </div>
              )}

              {coachHabilitado === null && !coachLoading && (
                <div className="rounded-xl p-5 border border-amber-500/30 bg-amber-500/5 text-center space-y-2">
                  <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                  <p className="text-sm text-gray-400">No se pudo verificar el estado del coach.</p>
                  <button type="button" onClick={loadCoachData} className="text-xs text-accent-cyan hover:underline">Reintentar</button>
                </div>
              )}

              {coachHabilitado === true && !coachLoading && (
                <div className="space-y-4">
                  {/* ── Canal tabs ── */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 font-medium mr-1">Canal:</span>
                    {([
                      { canal: 'llamada' as CanalCoach, label: 'Llamadas', icon: <Phone className="w-3.5 h-3.5" /> },
                      { canal: 'chat' as CanalCoach, label: 'Chats', icon: <MessageSquare className="w-3.5 h-3.5" /> },
                      { canal: 'videollamada' as CanalCoach, label: 'Videollamadas', icon: <Video className="w-3.5 h-3.5" /> },
                    ] as const).map(({ canal, label, icon }) => (
                      <button
                        key={canal}
                        type="button"
                        onClick={() => { setCoachCanalActivo(canal); setCoachEditCatId(null); }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          coachCanalActivo === canal
                            ? 'bg-accent-green/20 text-accent-green border-accent-green/40'
                            : 'bg-surface-700 text-gray-400 border-surface-500 hover:border-gray-400'
                        }`}
                      >
                        {icon} {label}
                        {guionesCoach.filter((g) => (g.canal ?? 'llamada') === canal).length > 0 && (
                          <span className="ml-0.5 px-1 py-0 rounded text-[9px] bg-accent-green/30 text-accent-green">
                            {guionesCoach.filter((g) => (g.canal ?? 'llamada') === canal).length}
                          </span>
                        )}
                      </button>
                    ))}
                    <HelpTooltip
                      titulo="Canales del coach"
                      contenido="Puedes definir guiones separados para cada canal de comunicación. Para Llamadas, los guiones se organizan por categoría de llamada (definidas en el Paso 3). Para Chats y Videollamadas, puedes configurar un guion general que se aplica a todas las interacciones de ese canal."
                    />
                  </div>

                  {/* ── Guiones per canal ── */}
                  {coachCanalActivo === 'llamada' && categoriasLlamadas.length === 0 && (
                    <div className="rounded-xl p-4 border border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
                      <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-white font-medium">Primero crea categorías de llamada</p>
                        <p className="text-xs text-gray-400 mt-1">Para configurar guiones de llamada, necesitas al menos una categoría definida en el Paso 3.</p>
                        <button type="button" onClick={() => setCurrentStep(3)} className="text-xs text-accent-cyan hover:underline mt-1">Ir al Paso 3</button>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const canalLabel = coachCanalActivo === 'llamada' ? 'llamada' : coachCanalActivo === 'chat' ? 'chat' : 'videollamada';
                    const items: { id: string; nombre: string }[] = coachCanalActivo === 'llamada'
                      ? categoriasLlamadas
                      : [{ id: `_general_${coachCanalActivo}`, nombre: coachCanalActivo === 'chat' ? 'Guion general de chats' : 'Guion general de videollamadas' }];

                    if (items.length === 0) return null;

                    return (
                      <>
                        <div className="rounded-xl p-3 border border-accent-green/20 bg-accent-green/5 flex items-start gap-2">
                          <Info className="w-4 h-4 text-accent-green shrink-0 mt-0.5" />
                          <p className="text-xs text-gray-400">
                            {coachCanalActivo === 'llamada'
                              ? <>Cada categoría puede tener su propio guion. La IA evalúa cada llamada con transcript válido contra las secciones del guion.</>
                              : <>La IA evalúa cada {canalLabel} con contenido válido contra las secciones del guion.</>
                            }
                            {' '}Secciones <span className="text-accent-green font-medium">must-have</span> que falten generan tag de incumplimiento; secciones <span className="text-gray-300">deseables</span> solo generan una nota suave.
                          </p>
                        </div>

                        <ul className="space-y-3">
                          {items.map((cat) => {
                            const guion = guionesCoach.find((g) => g.categoria_llamada_id === cat.id && (g.canal ?? 'llamada') === coachCanalActivo);
                            const isEditing = coachEditCatId === cat.id;

                            const startEditing = () => {
                              setCoachEditCatId(cat.id);
                              if (guion) {
                                setCoachSecciones(guion.secciones.map((s) => ({ ...s })));
                                setCoachUmbral(guion.umbral);
                                setCoachNotaCumplido(guion.nota_cumplido ?? '');
                                setCoachNotaNoCumplido(guion.nota_no_cumplido ?? '');
                                setCoachTagsCumplido(guion.tags_cumplido ?? []);
                                setCoachTagsNoCumplido(guion.tags_no_cumplido ?? []);
                              } else {
                                setCoachSecciones(DEFAULT_SECCIONES.map((s) => ({ ...s })));
                                setCoachUmbral(70);
                                setCoachNotaCumplido('');
                                setCoachNotaNoCumplido('');
                                setCoachTagsCumplido([]);
                                setCoachTagsNoCumplido([]);
                              }
                              setCoachTagInput('');
                              setCoachTagNoCumplInput('');
                            };

                            return (
                              <li key={cat.id} className="rounded-xl border border-surface-500 bg-gradient-to-b from-surface-700/90 to-surface-800/90 overflow-hidden">
                                <div className="p-3 flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium text-white truncate">{cat.nombre}</p>
                                      {guion && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-green/15 text-accent-green border border-accent-green/30">
                                          v{guion.version}
                                        </span>
                                      )}
                                    </div>
                                    {guion ? (
                                      <p className="text-[11px] text-gray-500 mt-0.5">
                                        {guion.secciones.length} secciones · Umbral: {guion.umbral}%
                                        {guion.secciones.filter((s) => s.tipo === 'must_have').length > 0 && (
                                          <> · <span className="text-accent-green">{guion.secciones.filter((s) => s.tipo === 'must_have').length} must-have</span></>
                                        )}
                                        {(guion.tags_cumplido?.length ?? 0) > 0 && <> · {guion.tags_cumplido?.length} tags</>}
                                      </p>
                                    ) : (
                                      <p className="text-[11px] text-gray-500 mt-0.5">Sin guion configurado</p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => isEditing ? setCoachEditCatId(null) : startEditing()}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                      isEditing
                                        ? 'bg-surface-600 text-gray-300 border-surface-500'
                                        : guion
                                          ? 'bg-accent-green/20 text-accent-green border-accent-green/40 hover:bg-accent-green/30'
                                          : 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/40 hover:bg-accent-cyan/30'
                                    }`}
                                  >
                                    {isEditing ? 'Cerrar' : guion ? 'Editar guion' : 'Configurar guion'}
                                  </button>
                                  {guion && !isEditing && (
                                    <button
                                      type="button"
                                      onClick={() => deleteCoachGuion(cat.id, coachCanalActivo)}
                                      disabled={coachSaving}
                                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 disabled:opacity-50"
                                      title="Eliminar guion"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>

                                {isEditing && (
                                  <div className="border-t border-surface-500 p-4 space-y-4">
                                    {guion && (
                                      <div className="rounded-lg p-2.5 bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                        <p className="text-[11px] text-amber-300/90">Editar el guion crea una nueva versión (v{guion.version + 1}). Las interacciones pendientes se re-evaluarán con el nuevo guion.</p>
                                      </div>
                                    )}

                                    {/* ── Secciones ── */}
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <label className="text-xs font-medium text-accent-green">Secciones del guion</label>
                                          <HelpTooltip
                                            titulo="Secciones del guion"
                                            contenido="Cada sección representa un bloque del guion que el asesor debe cubrir. Las secciones 'must-have' son obligatorias: si faltan, se genera un tag de incumplimiento. Las secciones 'deseables' son recomendadas pero su ausencia solo genera una nota suave, sin penalizar el score."
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setCoachSecciones((prev) => [
                                            ...prev,
                                            { id: crypto.randomUUID(), nombre: '', criterio: '', tipo: 'deseable' },
                                          ])}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-accent-green/20 text-accent-green border border-accent-green/40 hover:bg-accent-green/30"
                                        >
                                          <Plus className="w-3 h-3" /> Sección
                                        </button>
                                      </div>

                                      {coachSecciones.map((sec, idx) => (
                                        <div key={sec.id} className="rounded-lg p-3 bg-surface-600/50 border border-surface-500 space-y-2">
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="text"
                                              value={sec.nombre}
                                              onChange={(e) => setCoachSecciones((prev) => prev.map((s, i) => i === idx ? { ...s, nombre: e.target.value } : s))}
                                              placeholder="Nombre de la sección"
                                              className="flex-1 rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-green/40"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => setCoachSecciones((prev) => prev.map((s, i) => i === idx ? { ...s, tipo: s.tipo === 'must_have' ? 'deseable' : 'must_have' } : s))}
                                              className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                                                sec.tipo === 'must_have'
                                                  ? 'bg-accent-green/20 text-accent-green border-accent-green/40'
                                                  : 'bg-surface-700 text-gray-400 border-surface-500 hover:border-gray-400'
                                              }`}
                                            >
                                              {sec.tipo === 'must_have' ? 'Must-have' : 'Deseable'}
                                            </button>
                                            {coachSecciones.length > 1 && (
                                              <button
                                                type="button"
                                                onClick={() => setCoachSecciones((prev) => prev.filter((_, i) => i !== idx))}
                                                className="p-1 text-gray-500 hover:text-red-400"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5 mb-1">
                                            <label className="text-[11px] text-gray-400">Criterio de evaluación</label>
                                            <HelpTooltip
                                              titulo="Criterio de evaluación"
                                              contenido="Describe qué debe cubrir el asesor en esta sección. La IA compara el transcript contra este criterio. Sé específico: en vez de 'saludar', escribe 'el asesor debe presentarse con nombre, empresa y preguntar el nombre del prospecto'."
                                            />
                                          </div>
                                          <textarea
                                            value={sec.criterio}
                                            onChange={(e) => setCoachSecciones((prev) => prev.map((s, i) => i === idx ? { ...s, criterio: e.target.value } : s))}
                                            placeholder="¿Qué debe cubrir el asesor en esta sección? (criterio de evaluación)"
                                            className="w-full rounded-lg bg-surface-700 border border-surface-500 p-2 text-sm text-white min-h-[60px] focus:ring-2 focus:ring-accent-green/40"
                                          />
                                        </div>
                                      ))}
                                    </div>

                                    {/* ── Umbral ── */}
                                    <div className="pt-2 border-t border-surface-500">
                                      <div className="flex items-center gap-1.5 mb-2">
                                        <label className="text-xs font-medium text-accent-green">Umbral de cumplimiento: {coachUmbral}%</label>
                                        <HelpTooltip
                                          titulo="Umbral de cumplimiento"
                                          contenido="Porcentaje mínimo que el asesor debe alcanzar para que la interacción se considere 'cumple'. Si el score queda por debajo, se aplican los tags de incumplimiento y la nota correspondiente."
                                        />
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <input type="range" min={0} max={100} step={5} value={coachUmbral} onChange={(e) => setCoachUmbral(Number(e.target.value))} className="flex-1 accent-accent-green" />
                                        <input type="number" min={0} max={100} value={coachUmbral} onChange={(e) => setCoachUmbral(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className="w-16 rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white text-center focus:ring-2 focus:ring-accent-green/40" />
                                      </div>
                                    </div>

                                    {/* ── Notas condicionadas ── */}
                                    <div className="pt-2 border-t border-surface-500 space-y-3">
                                      <div className="flex items-center gap-1.5">
                                        <label className="text-xs font-medium text-accent-green">Notas condicionadas</label>
                                        <HelpTooltip
                                          titulo="Notas condicionadas"
                                          contenido="Instrucciones extra para la IA al generar la nota accionable del asesor. 'Nota si cumple' se aplica cuando el score supera el umbral (ej: 'Felicitar al asesor'). 'Nota si no cumple' se aplica cuando falla (ej: 'Indicar exactamente qué secciones faltaron y sugerir cómo mejorar')."
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <div>
                                          <label className="text-[11px] text-gray-400 block mb-1">Nota si cumple el umbral</label>
                                          <textarea
                                            value={coachNotaCumplido}
                                            onChange={(e) => setCoachNotaCumplido(e.target.value)}
                                            placeholder="Instrucción para la IA cuando el asesor cumple (opcional)"
                                            className="w-full rounded-lg bg-surface-700 border border-surface-500 p-2 text-sm text-white min-h-[40px] focus:ring-2 focus:ring-accent-green/40"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[11px] text-gray-400 block mb-1">Nota si no cumple el umbral</label>
                                          <textarea
                                            value={coachNotaNoCumplido}
                                            onChange={(e) => setCoachNotaNoCumplido(e.target.value)}
                                            placeholder="Instrucción para la IA cuando el asesor no cumple (opcional)"
                                            className="w-full rounded-lg bg-surface-700 border border-surface-500 p-2 text-sm text-white min-h-[40px] focus:ring-2 focus:ring-accent-green/40"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* ── Tags condicionados ── */}
                                    <div className="pt-2 border-t border-surface-500 space-y-3">
                                      <div className="flex items-center gap-1.5">
                                        <label className="text-xs font-medium text-accent-green">Tags condicionados</label>
                                        <HelpTooltip
                                          titulo="Tags condicionados"
                                          contenido="Tags de GHL que se aplican automáticamente al contacto según el resultado de la evaluación. 'Tags si cumple' se aplican cuando el score supera el umbral. 'Tags si no cumple' se aplican cuando falla — por defecto se aplica 'incumplimiento_guion_autoia' si no configuras ninguno."
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <div>
                                          <label className="text-[11px] text-gray-400 block mb-1">Tags si cumple</label>
                                          <div className="flex flex-wrap gap-1 mb-1">
                                            {coachTagsCumplido.map((tag, i) => (
                                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-accent-green/15 text-accent-green border border-accent-green/30">
                                                {tag}
                                                <button type="button" onClick={() => setCoachTagsCumplido((prev) => prev.filter((_, j) => j !== i))} className="hover:text-red-400">
                                                  <Trash2 className="w-2.5 h-2.5" />
                                                </button>
                                              </span>
                                            ))}
                                          </div>
                                          <div className="flex gap-1">
                                            <input
                                              type="text"
                                              value={coachTagInput}
                                              onChange={(e) => setCoachTagInput(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter' && coachTagInput.trim()) {
                                                  e.preventDefault();
                                                  setCoachTagsCumplido((prev) => [...prev, coachTagInput.trim()]);
                                                  setCoachTagInput('');
                                                }
                                              }}
                                              placeholder="Nombre del tag + Enter"
                                              className="flex-1 rounded-lg bg-surface-700 border border-surface-500 px-2 py-1 text-xs text-white focus:ring-2 focus:ring-accent-green/40"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => { if (coachTagInput.trim()) { setCoachTagsCumplido((prev) => [...prev, coachTagInput.trim()]); setCoachTagInput(''); } }}
                                              className="px-2 py-1 rounded-lg text-[10px] font-medium bg-accent-green/20 text-accent-green border border-accent-green/40 hover:bg-accent-green/30"
                                            >
                                              <Plus className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                        <div>
                                          <label className="text-[11px] text-gray-400 block mb-1">Tags si no cumple <span className="text-gray-600">(default: incumplimiento_guion_autoia)</span></label>
                                          <div className="flex flex-wrap gap-1 mb-1">
                                            {coachTagsNoCumplido.map((tag, i) => (
                                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-red-500/15 text-red-400 border border-red-500/30">
                                                {tag}
                                                <button type="button" onClick={() => setCoachTagsNoCumplido((prev) => prev.filter((_, j) => j !== i))} className="hover:text-red-300">
                                                  <Trash2 className="w-2.5 h-2.5" />
                                                </button>
                                              </span>
                                            ))}
                                          </div>
                                          <div className="flex gap-1">
                                            <input
                                              type="text"
                                              value={coachTagNoCumplInput}
                                              onChange={(e) => setCoachTagNoCumplInput(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter' && coachTagNoCumplInput.trim()) {
                                                  e.preventDefault();
                                                  setCoachTagsNoCumplido((prev) => [...prev, coachTagNoCumplInput.trim()]);
                                                  setCoachTagNoCumplInput('');
                                                }
                                              }}
                                              placeholder="Nombre del tag + Enter"
                                              className="flex-1 rounded-lg bg-surface-700 border border-surface-500 px-2 py-1 text-xs text-white focus:ring-2 focus:ring-accent-green/40"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => { if (coachTagNoCumplInput.trim()) { setCoachTagsNoCumplido((prev) => [...prev, coachTagNoCumplInput.trim()]); setCoachTagNoCumplInput(''); } }}
                                              className="px-2 py-1 rounded-lg text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
                                            >
                                              <Plus className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* ── Save/Cancel ── */}
                                    <div className="flex gap-2 justify-end pt-2">
                                      <button
                                        type="button"
                                        onClick={() => setCoachEditCatId(null)}
                                        className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white border border-surface-500 hover:border-surface-400"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => saveCoachGuion(cat.id, coachCanalActivo)}
                                        disabled={coachSaving || coachSecciones.filter((s) => s.criterio.trim() && s.nombre.trim()).length === 0}
                                        className="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent-green/20 text-accent-green border border-accent-green/40 hover:bg-accent-green/30 disabled:opacity-50 flex items-center gap-1.5"
                                      >
                                        {coachSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                        {guion ? 'Actualizar guion' : 'Guardar guion'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    );
                  })()}

                  {/* ── Excluir análisis ── */}
                  <div className="pt-4 border-t border-surface-500 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-medium text-accent-green">Excluir del análisis</label>
                        <HelpTooltip
                          titulo="Excluir análisis del coach"
                          contenido="Define reglas para excluir ciertas interacciones del análisis del coach. Por ejemplo: excluir llamadas con estado 'no_contesta', excluir chats de tipo 'automatizado', o excluir videollamadas de un tipo de evento específico. Las reglas se evalúan antes de enviar a la IA, ahorrando tokens."
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setExclusionesCoach((prev) => [...prev, { canal: 'todos', campo: 'estado_resultado', operador: 'eq', valor: '' }])}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-accent-green/20 text-accent-green border border-accent-green/40 hover:bg-accent-green/30"
                      >
                        <Plus className="w-3 h-3" /> Regla
                      </button>
                    </div>

                    {exclusionesCoach.length === 0 && (
                      <p className="text-[11px] text-gray-500">Sin exclusiones configuradas. Todas las interacciones con transcript válido serán evaluadas.</p>
                    )}

                    {exclusionesCoach.map((regla, idx) => (
                      <div key={idx} className="rounded-lg p-3 bg-surface-600/50 border border-surface-500 flex flex-wrap items-center gap-2">
                        <select
                          value={regla.canal}
                          onChange={(e) => setExclusionesCoach((prev) => prev.map((r, i) => i === idx ? { ...r, canal: e.target.value as ReglaExclusionCoach['canal'] } : r))}
                          className="rounded-lg bg-surface-700 border border-surface-500 px-2 py-1 text-xs text-white"
                        >
                          <option value="todos">Todos los canales</option>
                          <option value="llamada">Llamadas</option>
                          <option value="chat">Chats</option>
                          <option value="videollamada">Videollamadas</option>
                        </select>
                        <span className="text-[11px] text-gray-500">donde</span>
                        <select
                          value={regla.campo}
                          onChange={(e) => setExclusionesCoach((prev) => prev.map((r, i) => i === idx ? { ...r, campo: e.target.value as ReglaExclusionCoach['campo'] } : r))}
                          className="rounded-lg bg-surface-700 border border-surface-500 px-2 py-1 text-xs text-white"
                        >
                          <option value="estado_resultado">Estado resultado</option>
                          <option value="tipo_evento">Tipo de evento</option>
                          <option value="canal">Canal</option>
                        </select>
                        <select
                          value={regla.operador}
                          onChange={(e) => setExclusionesCoach((prev) => prev.map((r, i) => i === idx ? { ...r, operador: e.target.value as ReglaExclusionCoach['operador'] } : r))}
                          className="rounded-lg bg-surface-700 border border-surface-500 px-2 py-1 text-xs text-white"
                        >
                          <option value="eq">es igual a</option>
                          <option value="neq">no es igual a</option>
                          <option value="contains">contiene</option>
                          <option value="not_contains">no contiene</option>
                        </select>
                        <input
                          type="text"
                          value={regla.valor}
                          onChange={(e) => setExclusionesCoach((prev) => prev.map((r, i) => i === idx ? { ...r, valor: e.target.value } : r))}
                          placeholder="Valor"
                          className="flex-1 min-w-[120px] rounded-lg bg-surface-700 border border-surface-500 px-2 py-1 text-xs text-white focus:ring-2 focus:ring-accent-green/40"
                        />
                        <button
                          type="button"
                          onClick={() => setExclusionesCoach((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-gray-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {exclusionesCoach.length > 0 && (
                      <button
                        type="button"
                        onClick={saveExclusionesCoach}
                        disabled={exclusionesCoachSaving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-green/20 text-accent-green border border-accent-green/40 hover:bg-accent-green/30 disabled:opacity-50"
                      >
                        {exclusionesCoachSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Guardar exclusiones
                      </button>
                    )}
                  </div>
                </div>
              )}
              </PremiumGate>
            </div>
          )}

          {currentStep === 13 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-accent-purple/30">
                <div className="rounded-lg p-2 bg-accent-purple/20 border border-accent-purple/40"><Sparkles className="w-5 h-5 text-accent-purple" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Llave de Gemini (IA Premium)</h3>
                  <p className="text-sm text-gray-400">Conectá tu llave de Google AI para desbloquear el análisis cualitativo con Gemini.</p>
                </div>
                <HelpTooltip
                  titulo="Llave de Gemini"
                  contenido="Gemini potencia el análisis cualitativo del reporte: objeciones, frases repetitivas, conclusiones, narrativas y el coach de ventas. Sin llave, estas secciones se muestran como bloqueadas."
                  comoProbar="Ingresá tu API Key de Google AI Studio (aistudio.google.com) y guardá. Los reportes generados a partir de ese momento incluirán análisis cualitativo."
                />
                <span className={`ml-auto px-2 py-0.5 rounded text-xs font-semibold ${hasGeminiKey ? (geminiPremiumStatus && geminiPremiumStatus !== 'active' ? 'bg-accent-amber/20 text-accent-amber' : 'bg-accent-green/20 text-accent-green') : 'bg-surface-600 text-gray-500'}`}>
                  {hasGeminiKey
                    ? geminiPremiumStatus === 'paused_invalid_key'
                      ? 'Llave inválida'
                      : geminiPremiumStatus === 'paused_quota_exceeded'
                        ? 'Sin saldo'
                        : 'Activa'
                    : 'No configurada'}
                </span>
              </div>

              {!hasGeminiKey && (
                <div className="rounded-lg border border-accent-purple/40 bg-accent-purple/5 px-4 py-3 flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-accent-purple shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white">Para usar estas funciones necesitas poner tu API key de Gemini.</p>
                    <p className="text-xs text-gray-400 mt-1">El análisis cualitativo, reportes narrativos, coach de ventas y clasificación de chats/llamadas requieren tu llave de Google AI Studio. Es gratis para empezar.</p>
                  </div>
                </div>
              )}

              {geminiPremiumStatus === 'paused_invalid_key' && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Tu llave fue rechazada por Google. Ingresá una nueva llave válida.
                </div>
              )}
              {geminiPremiumStatus === 'paused_quota_exceeded' && (
                <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/5 px-3 py-2 text-sm text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Tu llave de Gemini se quedó sin saldo. Recargá tu cuenta en Google AI Studio para reactivar.
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  {hasGeminiKey ? 'Reemplazar API Key' : 'Ingresar API Key'}
                </label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full rounded-lg bg-surface-600 border border-surface-500 px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:ring-2 focus:ring-accent-purple/50 focus:border-accent-purple/50"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">Tu key se guarda de forma segura y solo se usa para generar análisis cualitativos de tus conversaciones.</p>
              </div>

              <div className="rounded-lg border border-accent-purple/30 bg-accent-purple/5 px-3 py-2 text-sm text-gray-400 space-y-1">
                <p><strong className="text-accent-purple">Funciones que desbloquea:</strong></p>
                <ul className="list-disc list-inside text-gray-500 space-y-0.5">
                  <li>Análisis de objeciones frecuentes de leads</li>
                  <li>Frases repetitivas y patrones de conversación</li>
                  <li>Conclusiones y narrativa ejecutiva por IA</li>
                  <li>Análisis cualitativo por canal (llamadas, chats, video)</li>
                  <li>Coach de ventas inteligente</li>
                </ul>
              </div>

              <div className="rounded-lg border border-surface-500 bg-surface-800/60 px-3 py-2 text-sm text-gray-400">
                <strong className="text-white">¿Dónde consigo la llave?</strong>
                <p className="text-xs text-gray-500 mt-1">Andá a <code className="text-accent-purple">aistudio.google.com/apikey</code>, creá un proyecto y generá una API Key. El modelo usado es <code className="text-accent-purple">gemini-2.5-flash</code>.</p>
              </div>

              <div className="rounded-lg border border-surface-500 bg-surface-700/40 px-3 py-3 text-xs text-gray-400 space-y-2">
                <p className="font-semibold text-gray-300">Costos estimados (Gemini 2.5 Flash)</p>
                <div className="space-y-1 text-gray-500">
                  <p>Entrada: <span className="text-accent-amber">$0.30 / 1M tokens</span> · Salida: <span className="text-accent-amber">$2.50 / 1M tokens</span></p>
                  <p>Estimado por chat analizado: ~<span className="text-accent-green">$0.0004 USD</span></p>
                  <p>Estimado por llamada: ~<span className="text-accent-green">$0.001 USD</span></p>
                  <p>Estimado por reporte cualitativo: ~<span className="text-accent-green">$0.01 USD</span></p>
                </div>
                <div className="border-t border-surface-600 pt-2 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent-green shrink-0 mt-0.5" />
                  <p className="text-gray-300"><strong className="text-white">Somos transparentes contigo:</strong> solo te cobramos lo que consumes. Los costos van directamente a tu cuenta de Google AI Studio, sin markup ni sorpresas.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3 pt-2 border-t border-surface-500/80">
          <button type="button" onClick={async () => { await handleSave(); goStep(-1); }} disabled={currentStep === VISIBLE_STEPS[0] || saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-700/80 border border-surface-500 text-sm text-gray-300 hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-green text-black text-sm font-semibold hover:shadow-[0_0_20px_-6px_rgba(0,230,118,0.5)] transition-all border border-accent-green disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
            <button type="button" onClick={async () => { await handleSave(); goStep(1); }} disabled={currentStep === VISIBLE_STEPS[VISIBLE_STEPS.length - 1] || saving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-accent-cyan text-black text-sm font-semibold hover:shadow-[0_0_24px_-6px_rgba(0,240,255,0.5)] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
