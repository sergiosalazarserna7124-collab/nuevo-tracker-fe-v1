"use client";

import { useState, useEffect } from "react";
import { X, Save, Plus, Trash2, Copy, Check } from "lucide-react";
import type {
  MetricaConfig,
  MetricaCampoConfig,
  MetricaFormulaConfig,
  MetricaManualEntry,
  ChatMetricaCampo,
  KeywordMatchScope,
  KeywordCountMode,
} from "@/lib/db/schema";
import SelectorFuenteConBusqueda from "./SelectorFuenteConBusqueda";

const TIPOS_CAMPO = [
  { value: "texto", label: "Texto" },
  { value: "numero", label: "Número" },
  { value: "fecha", label: "Fecha" },
  { value: "boolean", label: "Sí/No" },
] as const;

const TIPOS_FORMULA = [
  { value: "directo", label: "Directo (copiar valor)", desc: "Copia el valor tal cual de la fuente" },
  { value: "suma", label: "Suma de valores", desc: "Suma todos los operandos seleccionados" },
  { value: "promedio", label: "Promedio de valores", desc: "Calcula el promedio de los operandos" },
  { value: "division", label: "División (A ÷ B)", desc: "Divide el primer operando entre el segundo" },
  { value: "multiplicacion", label: "Multiplicación (A × B)", desc: "Multiplica todos los operandos" },
  { value: "resta", label: "Resta (A − B)", desc: "Resta el segundo operando del primero" },
  { value: "condicion", label: "Si se cumple condición → A, sino → B", desc: "Evalúa una condición y devuelve un resultado u otro" },
] as const;

const OPERADORES = [
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
  { value: "==", label: "==" },
  { value: "!=", label: "!=" },
] as const;

const UBICACIONES = [
  { value: "panel_ejecutivo", label: "Panel Ejecutivo" },
  { value: "rendimiento", label: "Rendimiento" },
  { value: "ambos", label: "Ambos" },
] as const;

const FORMATOS = [
  { value: "numero", label: "Número (123)" },
  { value: "moneda", label: "Moneda ($1,234)" },
  { value: "porcentaje", label: "Porcentaje (85.0%)" },
  { value: "tiempo", label: "Tiempo (2.3 min)" },
  { value: "decimal", label: "Decimal (4.5)" },
] as const;

const COLORES = [
  { value: "blue", label: "Azul", css: "bg-blue-500" },
  { value: "cyan", label: "Cian", css: "bg-cyan-500" },
  { value: "green", label: "Verde", css: "bg-green-500" },
  { value: "purple", label: "Morado", css: "bg-purple-500" },
  { value: "amber", label: "Ámbar", css: "bg-amber-500" },
  { value: "red", label: "Rojo", css: "bg-red-500" },
] as const;

const CHAT_CAMPOS: { value: ChatMetricaCampo; label: string; desc: string }[] = [
  { value: "total_mensajes", label: "Total mensajes", desc: "Suma de todos los mensajes en el chat" },
  { value: "mensajes_agente", label: "Mensajes del agente", desc: "Mensajes enviados por el agente/asesor" },
  { value: "mensajes_lead", label: "Mensajes del lead", desc: "Mensajes enviados por el lead" },
  { value: "speed_to_lead", label: "Speed to lead (seg)", desc: "Segundos hasta la primera respuesta del agente" },
  { value: "humano_tomo_control", label: "Humano tomó control", desc: "1 si un humano respondió, 0 si no" },
  { value: "objeciones_detectadas", label: "Objeciones detectadas", desc: "Cantidad de objeciones detectadas por IA" },
];

const CHAT_AGREGACIONES: { value: NonNullable<MetricaConfig["chatAgregacion"]>; label: string }[] = [
  { value: "suma", label: "Suma (total del período)" },
  { value: "promedio", label: "Promedio por chat" },
  { value: "conteo", label: "Conteo de chats con valor > 0" },
];

interface MetricaEditSheetProps {
  metricasConfig: MetricaConfig[];
  metricasManualData: Record<string, MetricaManualEntry[]>;
  editingMetric: MetricaConfig | null;
  tipoInicial: "manual" | "automatica" | "fija" | "webhook" | "ads" | "chat";
  subdominio?: string;
  dashboardsPersonalizados?: import("@/lib/db/schema").DashboardPersonalizado[];
  onClose: () => void;
  onSave: (
    config: MetricaConfig,
    manualData?: MetricaManualEntry[],
  ) => void | Promise<void>;
}

export default function MetricaEditSheet({
  metricasConfig,
  metricasManualData,
  editingMetric,
  tipoInicial,
  subdominio,
  dashboardsPersonalizados = [],
  onClose,
  onSave,
}: MetricaEditSheetProps) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [ubicacion, setUbicacion] = useState<MetricaConfig["ubicacion"]>("ambos");
  // paneles: selección múltiple de dónde aparece esta métrica
  const [panelesSeleccionados, setPanelesSeleccionados] = useState<string[]>(["panel_ejecutivo"]);
  const [atribuibleUsuario, setAtribuibleUsuario] = useState(false);
  const [tipo, setTipo] = useState<"manual" | "automatica" | "fija" | "webhook" | "ads" | "embudo_etapa" | "chat">(tipoInicial);

  const [campos, setCampos] = useState<MetricaCampoConfig[]>([]);

  const [formulaTipo, setFormulaTipo] = useState<MetricaFormulaConfig["tipo"]>("directo");
  const [fuente, setFuente] = useState<string[]>([]);
  const [operador, setOperador] = useState<MetricaFormulaConfig["operador"]>(">");
  const [valorComparacion, setValorComparacion] = useState<string>("");
  const [valorSiCumple, setValorSiCumple] = useState<string>("");
  const [valorSiNo, setValorSiNo] = useState<string>("");

  const [comparacionMode, setComparacionMode] = useState<"fijo" | "variable">("fijo");
  const [comparacionFuente, setComparacionFuente] = useState<string[]>([]);
  const [siCumpleMode, setSiCumpleMode] = useState<"fijo" | "variable">("fijo");
  const [siCumpleFuente, setSiCumpleFuente] = useState<string[]>([]);
  const [siNoMode, setSiNoMode] = useState<"fijo" | "variable">("fijo");
  const [siNoFuente, setSiNoFuente] = useState<string[]>([]);

  const [valorFijo, setValorFijo] = useState<string>("");
  const [webhookCampo, setWebhookCampo] = useState<string>("");
  const [webhookCamposDisponibles, setWebhookCamposDisponibles] = useState<string[]>([]);
  const [chatCampo, setChatCampo] = useState<ChatMetricaCampo>("total_mensajes");
  const [chatAgregacion, setChatAgregacion] = useState<NonNullable<MetricaConfig["chatAgregacion"]>>("suma");
  const [chatSubtipo, setChatSubtipo] = useState<"standard" | "conteo_keyword">("standard");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [matchScope, setMatchScope] = useState<KeywordMatchScope>("mensajes_lead");
  const [countMode, setCountMode] = useState<KeywordCountMode>("chats");
  const [formato, setFormato] = useState<MetricaConfig["formato"]>("numero");
  const [color, setColor] = useState<string>("green");

  const [nuevaEntrada, setNuevaEntrada] = useState<Record<string, string | number | boolean>>({});
  const [entradas, setEntradas] = useState<MetricaManualEntry[]>([]);

  const [saving, setSaving] = useState(false);

  const [tenantApiKey, setTenantApiKey] = useState<string | null>(null);
  const [copiedApiKey, setCopiedApiKey] = useState(false);

  useEffect(() => {
    if (tipo === "webhook" || tipoInicial === "webhook") {
      fetch("/api/data/api-keys")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { keys: { token: string; activa: boolean }[] } | null) => {
          const active = data?.keys?.find((k) => k.activa);
          if (active) setTenantApiKey(active.token);
        })
        .catch(() => {});
    }
  }, [tipo, tipoInicial]);

  useEffect(() => {
    if (editingMetric) {
      setNombre(editingMetric.nombre);
      setDescripcion(editingMetric.descripcion ?? "");
      setUbicacion(editingMetric.ubicacion ?? "ambos");
      // Inicializar paneles: usar paneles[] si existe, sino derivar de ubicacion
      const panelesInic: string[] = editingMetric.paneles?.length
        ? editingMetric.paneles
        : editingMetric.ubicacion === "ambos"
          ? ["panel_ejecutivo", "rendimiento"]
          : [editingMetric.ubicacion ?? "panel_ejecutivo"];
      setPanelesSeleccionados(panelesInic);
      setAtribuibleUsuario(editingMetric.atribuible_a_usuario ?? false);
      setTipo(editingMetric.tipo);
      setCampos(editingMetric.campos ?? []);
      if (editingMetric.formula) {
        setFormulaTipo(editingMetric.formula.tipo);
        setFuente(
          editingMetric.formula.fuente
            ? [editingMetric.formula.fuente]
            : editingMetric.formula.fuentes ?? [],
        );
        setOperador(editingMetric.formula.operador ?? ">");
        const rawCmp = String(editingMetric.formula.valorComparacion ?? "");
        if (rawCmp.startsWith("ref:")) {
          setComparacionMode("variable");
          setComparacionFuente([rawCmp.slice(4)]);
          setValorComparacion("");
        } else {
          setComparacionMode("fijo");
          setComparacionFuente([]);
          setValorComparacion(rawCmp);
        }
        const rawSi = String(editingMetric.formula.valorSiCumple ?? "");
        if (rawSi.startsWith("ref:")) {
          setSiCumpleMode("variable");
          setSiCumpleFuente([rawSi.slice(4)]);
          setValorSiCumple("");
        } else {
          setSiCumpleMode("fijo");
          setSiCumpleFuente([]);
          setValorSiCumple(rawSi);
        }
        const rawNo = String(editingMetric.formula.valorSiNo ?? "");
        if (rawNo.startsWith("ref:")) {
          setSiNoMode("variable");
          setSiNoFuente([rawNo.slice(4)]);
          setValorSiNo("");
        } else {
          setSiNoMode("fijo");
          setSiNoFuente([]);
          setValorSiNo(rawNo);
        }
      }
      setValorFijo(String(editingMetric.valorFijo ?? ""));
      setFormato(editingMetric.formato ?? "numero");
      setColor(editingMetric.color ?? "green");
      setEntradas(metricasManualData[editingMetric.id] ?? []);
      setWebhookCampo(editingMetric.webhookCampo ?? "");
      setChatCampo(editingMetric.chatCampo ?? "total_mensajes");
      setChatAgregacion(editingMetric.chatAgregacion ?? "suma");
      setChatSubtipo(editingMetric.chatSubtipo === "conteo_keyword" ? "conteo_keyword" : "standard");
      setKeywords(editingMetric.keywords ?? []);
      setKeywordInput("");
      setMatchScope(editingMetric.matchScope ?? "mensajes_lead");
      setCountMode(editingMetric.countMode ?? "chats");
    } else {
      setNombre("");
      setDescripcion("");
      setUbicacion("ambos"); // siempre ambos para nuevas métricas
      setPanelesSeleccionados(["panel_ejecutivo"]);
      setAtribuibleUsuario(false);
      setTipo(tipoInicial);
      setCampos([]);
      setFormulaTipo("directo");
      setFuente([]);
      setOperador(">");
      setValorComparacion("");
      setValorSiCumple("");
      setValorSiNo("");
      setComparacionMode("fijo");
      setComparacionFuente([]);
      setSiCumpleMode("fijo");
      setSiCumpleFuente([]);
      setSiNoMode("fijo");
      setSiNoFuente([]);
      setValorFijo("");
      setFormato("numero");
      setColor("green");
      setEntradas([]);
      setWebhookCampo("");
      setChatCampo("total_mensajes");
      setChatAgregacion("suma");
      setChatSubtipo(tipoInicial === "chat" ? "standard" : "standard");
      setKeywords([]);
      setKeywordInput("");
      setMatchScope("mensajes_lead");
      setCountMode("chats");
    }
    setNuevaEntrada({});
  }, [editingMetric, tipoInicial, metricasManualData]);

  const addCampo = () => {
    setCampos((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        nombre: "",
        tipo: "texto",
      },
    ]);
  };

  const updateCampo = (id: string, updates: Partial<MetricaCampoConfig>) => {
    setCampos((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  };

  const removeCampo = (id: string) => {
    setCampos((prev) => prev.filter((c) => c.id !== id));
  };

  const addEntrada = () => {
    const entry: MetricaManualEntry = {};
    for (const c of campos) {
      const v = nuevaEntrada[c.id];
      if (v !== undefined) {
        if (c.tipo === "numero") entry[c.id] = typeof v === "number" ? v : parseFloat(String(v)) || 0;
        else if (c.tipo === "boolean") entry[c.id] = v === true || v === "true";
        else if (c.tipo === "fecha") entry[c.id] = typeof v === "string" ? v : null;
        else entry[c.id] = v != null ? String(v) : null;
      } else {
        entry[c.id] = null;
      }
    }
    setEntradas((prev) => [...prev, entry]);
    setNuevaEntrada({});
  };

  const removeEntrada = (idx: number) => {
    setEntradas((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!nombre.trim()) return;
    setSaving(true);

    const id = editingMetric?.id ?? crypto.randomUUID();
    const orden = editingMetric?.orden ?? metricasConfig.length;

    let config: MetricaConfig;

    const panelesFinal = panelesSeleccionados.length > 0
      ? panelesSeleccionados
      : ["panel_ejecutivo" as const];

    // Derivar ubicacion legacy desde paneles para backward compat con código que aún lo lee
    const ubicacionLegacy: MetricaConfig["ubicacion"] =
      panelesFinal.includes("panel_ejecutivo") && panelesFinal.includes("rendimiento")
        ? "ambos"
        : panelesFinal.find((p) => p === "panel_ejecutivo" || p === "rendimiento") as MetricaConfig["ubicacion"] ?? "panel_ejecutivo";

    const base = {
      id, nombre: nombre.trim(), descripcion: descripcion.trim() || null,
      ubicacion: ubicacionLegacy,
      paneles: panelesFinal as MetricaConfig["paneles"],
      atribuible_a_usuario: atribuibleUsuario,
      orden, formato, color,
    };

    try {
      if (tipo === "chat") {
        if (chatSubtipo === "conteo_keyword") {
          config = {
            ...base,
            tipo: "chat" as const,
            chatSubtipo: "conteo_keyword" as const,
            keywords,
            matchScope,
            countMode,
            normalizeAccents: true,
          };
        } else {
          config = { ...base, tipo: "chat" as const, chatCampo, chatAgregacion };
        }
        await onSave(config);
        setSaving(false);
        onClose();
        return;
      } else if (tipo === "webhook") {
        config = { ...base, tipo: "webhook" as const, webhookCampo: webhookCampo.trim() };
        await onSave(config);
        setSaving(false);
        onClose();
        return;
      } else if (tipo === "embudo_etapa") {
        config = { ...base, tipo: "embudo_etapa" as const };
        await onSave(config);
        setSaving(false);
        onClose();
        return;
      } else if (tipo === "fija") {
        config = { ...base, tipo: "fija" as const, valorFijo: valorFijo.trim() || "0" };
        await onSave(config);
      } else if (tipo === "manual") {
        if (campos.length === 0) {
          setSaving(false);
          return;
        }
        const validCampos = campos
          .filter((c) => c.nombre.trim())
          .map((c) => ({
            ...c,
            nombre: c.nombre.trim(),
            esClaveFiltro: c.tipo === "fecha" ? c.esClaveFiltro : undefined,
          }));
        if (validCampos.length === 0) {
          setSaving(false);
          return;
        }
        config = { ...base, tipo: "manual" as const, campos: validCampos };
        await onSave(config, entradas);
      } else {
        const formula: MetricaFormulaConfig = { tipo: formulaTipo };
        if (formulaTipo === "directo" && fuente[0]) {
          formula.fuente = fuente[0];
        } else if (
          ["suma", "promedio", "multiplicacion"].includes(formulaTipo) &&
          fuente.length > 0
        ) {
          formula.fuentes = fuente;
        } else if (["division", "resta"].includes(formulaTipo) && fuente.length === 2) {
          formula.fuentes = fuente;
        } else if (formulaTipo === "condicion" && fuente[0]) {
          formula.fuente = fuente[0];
          formula.operador = operador;
          if (comparacionMode === "variable" && comparacionFuente[0]) {
            formula.valorComparacion = `ref:${comparacionFuente[0]}`;
          } else {
            const cmp = valorComparacion.trim();
            formula.valorComparacion =
              cmp === "true" ? true : cmp === "false" ? false : parseFloat(cmp) || 0;
          }
          if (siCumpleMode === "variable" && siCumpleFuente[0]) {
            formula.valorSiCumple = `ref:${siCumpleFuente[0]}`;
          } else {
            formula.valorSiCumple =
              valorSiCumple.trim() === "" ? 0 : parseFloat(valorSiCumple) || valorSiCumple;
          }
          if (siNoMode === "variable" && siNoFuente[0]) {
            formula.valorSiNo = `ref:${siNoFuente[0]}`;
          } else {
            formula.valorSiNo =
              valorSiNo.trim() === "" ? 0 : parseFloat(valorSiNo) || valorSiNo;
          }
        }
        config = { ...base, tipo: "automatica" as const, formula };
        await onSave(config);
      }
      setSaving(false);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const canSave =
    !!nombre.trim() &&
    (tipo === "chat"
      ? (chatSubtipo === "conteo_keyword" ? keywords.length > 0 : !!chatCampo)
      : tipo === "webhook"
        ? !!webhookCampo.trim()
        : tipo === "fija"
          ? true
          : tipo === "manual"
            ? campos.some((c) => c.nombre.trim())
            : tipo === "automatica"
              ? (formulaTipo === "directo"
                  ? fuente.length === 1
                  : formulaTipo === "condicion"
                    ? fuente.length === 1
                    : formulaTipo === "division" || formulaTipo === "resta"
                      ? fuente.length === 2
                      : fuente.length > 0)
              : true);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative w-full max-w-lg bg-surface-800 border-l border-surface-500 shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface-800 border-b border-surface-500 px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-white">
            {editingMetric ? "Editar métrica" : "Nueva métrica"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-accent-cyan mb-1">Nombre *</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Meta mensual"
              className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white focus:ring-2 focus:ring-accent-cyan/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Descripción</label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white"
            />
          </div>

          {/* ── Selector de paneles (multi-selección) ── */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              ¿En qué panel(es) aparece esta métrica?
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "panel_ejecutivo", label: "Panel Ejecutivo", emoji: "🏠" },
                { id: "rendimiento", label: "Rendimiento", emoji: "📈" },
                ...dashboardsPersonalizados.map((d) => ({ id: d.id, label: d.nombre, emoji: d.icono ?? "📊" })),
              ].map((panel) => {
                const activo = panelesSeleccionados.includes(panel.id);
                return (
                  <button
                    key={panel.id}
                    type="button"
                    onClick={() => setPanelesSeleccionados((prev) =>
                      activo ? prev.filter((p) => p !== panel.id) : [...prev, panel.id]
                    )}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                      activo
                        ? "bg-accent-cyan/20 text-accent-cyan border-accent-cyan/50"
                        : "bg-surface-700 text-gray-400 border-surface-500 hover:border-accent-cyan/30 hover:text-gray-300"
                    }`}
                  >
                    <span>{panel.emoji}</span>
                    {panel.label}
                  </button>
                );
              })}
            </div>
            {panelesSeleccionados.length === 0 && (
              <p className="text-[10px] text-amber-400 mt-1">Selecciona al menos un panel.</p>
            )}
          </div>

          {/* ── Atribución a usuario GHL ── */}
          {(tipo === "manual" || tipo === "webhook") && (
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-surface-700/50 border border-surface-500">
              <input
                id="atribuible"
                type="checkbox"
                checked={atribuibleUsuario}
                onChange={(e) => setAtribuibleUsuario(e.target.checked)}
                className="mt-0.5 accent-cyan-400"
              />
              <div>
                <label htmlFor="atribuible" className="text-xs font-medium text-white cursor-pointer">
                  Atribuible a asesor / cliente
                </label>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Si está activo, al enviar el webhook puedes incluir{" "}
                  <code className="bg-surface-600 px-1 rounded text-accent-cyan">userId</code> (asesor) o{" "}
                  <code className="bg-surface-600 px-1 rounded text-accent-cyan">customerId</code> (cliente).
                  La métrica se sumará individualmente y podrás verla por persona.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Formato del valor</label>
              <select
                value={formato}
                onChange={(e) => setFormato(e.target.value as MetricaConfig["formato"])}
                className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white"
              >
                {FORMATOS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Color en el panel</label>
              <div className="flex gap-1.5 mt-1">
                {COLORES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={`w-7 h-7 rounded-lg ${c.css} transition-all ${color === c.value ? "ring-2 ring-white ring-offset-1 ring-offset-surface-600 scale-110" : "opacity-50 hover:opacity-80"}`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>

          {!editingMetric && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as MetricaConfig["tipo"])}
                className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white"
              >
                <option value="manual">Manual (campos personalizados)</option>
                <option value="automatica">Automática (fórmula)</option>
                <option value="fija">Fija (valor constante)</option>
                <option value="webhook">Webhook (dato externo via API)</option>
                <option value="chat">Chat (datos de conversaciones)</option>
              </select>
            </div>
          )}

          {tipo === "webhook" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-accent-cyan/5 border border-accent-cyan/20 p-3 text-xs text-gray-400 space-y-2">
                <p className="text-white font-medium">¿Cómo funciona?</p>
                <p>Envía datos desde cualquier sistema externo (n8n, GHL, Zapier) al webhook de tu cuenta. El valor de este campo aparecerá aquí automáticamente.</p>
                <p className="text-accent-cyan">URL: <code className="bg-surface-700 px-1 py-0.5 rounded">leadmaster.com.co/webhooks/proxy/metricas/{subdominio ?? '[tu-subdominio]'}</code></p>
                {tenantApiKey ? (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 shrink-0">Tu API Key:</span>
                    <code className="bg-surface-700 px-1.5 py-0.5 rounded text-accent-cyan font-mono text-[11px] select-all truncate">{tenantApiKey}</code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(tenantApiKey);
                        setCopiedApiKey(true);
                        setTimeout(() => setCopiedApiKey(false), 2000);
                      }}
                      className="p-0.5 text-gray-500 hover:text-white transition-colors shrink-0"
                      title="Copiar API Key"
                    >
                      {copiedApiKey ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ) : (
                  <p className="text-amber-400">No tienes API Keys — créala en Documentación &rarr; Webhooks.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-accent-cyan mb-1">
                  Nombre del campo *
                  <span className="ml-1 text-gray-500 font-normal">(debe coincidir exactamente con el campo que envías en el JSON)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={webhookCampo}
                    onChange={(e) => setWebhookCampo(e.target.value)}
                    placeholder="ej: ventas_facebook, leads_instagram, costo_lead"
                    className="flex-1 rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white font-mono focus:ring-2 focus:ring-accent-cyan/40"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/data/metricas-webhook");
                        if (res.ok) {
                          const data = await res.json() as { campos: Array<{ campo: string }> };
                          setWebhookCamposDisponibles(data.campos.map((c) => c.campo));
                        }
                      } catch { /* ignore */ }
                    }}
                    className="px-2 py-1.5 rounded-lg bg-surface-600 border border-surface-500 text-xs text-gray-400 hover:text-white transition-colors"
                    title="Ver campos que ya han llegado"
                  >
                    Ver disponibles
                  </button>
                </div>
                {/* Campos de Ads disponibles */}
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Campos de Ads (Meta/Vturb/Google):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["gasto_total_ad","impresiones_totales","clicks_unicos","cpm","cpc","ctr","play_rate","engagement","agendamientos"].map((f) => (
                      <button key={f} type="button" onClick={() => setWebhookCampo(f)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${webhookCampo === f ? "bg-accent-purple/20 border-accent-purple text-accent-purple" : "bg-surface-600 border-surface-500 text-gray-400 hover:text-white"}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                {webhookCamposDisponibles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">Campos recibidos por webhook:</p>
                    <div className="flex flex-wrap gap-1.5">
                    {webhookCamposDisponibles.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setWebhookCampo(c)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${webhookCampo === c ? "bg-accent-cyan/20 border-accent-cyan text-accent-cyan" : "bg-surface-600 border-surface-500 text-gray-400 hover:text-white"}`}
                      >
                        {c}
                      </button>
                    ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-lg bg-surface-700/40 p-3 text-xs text-gray-500 font-mono whitespace-pre">
                {`POST leadmaster.com.co/webhooks/proxy/metricas/${subdominio ?? '[tu-subdominio]'}\nx-api-key: ${tenantApiKey ?? '[crea una API Key en Documentación]'}\n\n{\n  "${webhookCampo || "nombre_campo"}": 42,\n  "fecha": "2026-04-08T14:30:00-05:00"\n}`}
              </div>
              <p className="text-[10px] text-gray-500">
                💡 El campo <code className="bg-surface-700 px-1 rounded text-accent-cyan">fecha</code> acepta fecha (<code>2026-04-08</code>) o fecha+hora con zona horaria (<code>2026-04-08T14:30:00-05:00</code>). El sistema convierte automáticamente a UTC.
              </p>
            </div>
          )}

          {tipo === "chat" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Subtipo de métrica de chat</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setChatSubtipo("standard")}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                      chatSubtipo === "standard"
                        ? "bg-accent-cyan/20 text-accent-cyan border-accent-cyan/50"
                        : "bg-surface-700 text-gray-400 border-surface-500 hover:border-accent-cyan/30"
                    }`}
                  >
                    Campo del chat
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatSubtipo("conteo_keyword")}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                      chatSubtipo === "conteo_keyword"
                        ? "bg-accent-purple/20 text-accent-purple border-accent-purple/50"
                        : "bg-surface-700 text-gray-400 border-surface-500 hover:border-accent-purple/30"
                    }`}
                  >
                    Conteo de palabra clave
                  </button>
                </div>
              </div>

              {chatSubtipo === "standard" && (
                <>
                  <div className="rounded-lg bg-accent-cyan/5 border border-accent-cyan/20 p-3 text-xs text-gray-400 space-y-1">
                    <p className="text-white font-medium">¿Cómo funciona?</p>
                    <p>Selecciona un campo de las conversaciones de chat y cómo quieres agregar ese valor en el período seleccionado.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-accent-cyan mb-1">Campo del chat *</label>
                    <select
                      value={chatCampo}
                      onChange={(e) => setChatCampo(e.target.value as ChatMetricaCampo)}
                      className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white"
                    >
                      {CHAT_CAMPOS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {CHAT_CAMPOS.find((c) => c.value === chatCampo)?.desc}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-accent-cyan mb-1">Tipo de agregación</label>
                    <select
                      value={chatAgregacion}
                      onChange={(e) => setChatAgregacion(e.target.value as NonNullable<MetricaConfig["chatAgregacion"]>)}
                      className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white"
                    >
                      {CHAT_AGREGACIONES.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {chatSubtipo === "conteo_keyword" && (
                <>
                  <div className="rounded-lg bg-accent-purple/5 border border-accent-purple/20 p-3 text-xs text-gray-400 space-y-1">
                    <p className="text-white font-medium">Conteo de palabra clave</p>
                    <p>Cuenta cuántos chats (o cuántas ocurrencias) contienen las palabras/frases que definas. Búsqueda sin acentos y case-insensitive.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-accent-purple mb-1">Palabras clave *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const kw = keywordInput.trim();
                            if (kw && !keywords.includes(kw.toLowerCase())) {
                              setKeywords((prev) => [...prev, kw.toLowerCase()]);
                              setKeywordInput("");
                            }
                          }
                        }}
                        placeholder="Escribe y presiona Enter"
                        className="flex-1 rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white text-xs focus:ring-2 focus:ring-accent-purple/40"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const kw = keywordInput.trim();
                          if (kw && !keywords.includes(kw.toLowerCase())) {
                            setKeywords((prev) => [...prev, kw.toLowerCase()]);
                            setKeywordInput("");
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-accent-purple/20 text-accent-purple border border-accent-purple/50 text-xs font-medium hover:bg-accent-purple/30"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {keywords.map((kw) => (
                          <span
                            key={kw}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-purple/15 text-accent-purple text-[11px] border border-accent-purple/30"
                          >
                            {kw}
                            <button
                              type="button"
                              onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))}
                              className="hover:text-red-400"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {keywords.length === 0 && (
                      <p className="text-[10px] text-amber-400 mt-1">Agrega al menos una palabra clave.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-accent-purple mb-1">Alcance de búsqueda</label>
                    <select
                      value={matchScope}
                      onChange={(e) => setMatchScope(e.target.value as KeywordMatchScope)}
                      className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white text-xs"
                    >
                      <option value="mensajes_lead">Solo mensajes del lead</option>
                      <option value="todo_el_chat">Todo el chat (lead + agente)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-accent-purple mb-1">Modo de conteo</label>
                    <select
                      value={countMode}
                      onChange={(e) => setCountMode(e.target.value as KeywordCountMode)}
                      className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white text-xs"
                    >
                      <option value="chats">Chats que contienen la palabra (1 por chat)</option>
                      <option value="ocurrencias">Total de ocurrencias (puede ser +1 por chat)</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {tipo === "fija" && (
            <div>
              <label className="block text-xs font-medium text-accent-green mb-1">Valor fijo *</label>
              <input
                type="text"
                value={valorFijo}
                onChange={(e) => setValorFijo(e.target.value)}
                placeholder="Número o texto"
                className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white"
              />
            </div>
          )}

          {tipo === "manual" && (
            <>
              <div>
                <label className="block text-xs font-medium text-accent-purple mb-1">Campos</label>
                <div className="space-y-2">
                  {campos.map((c) => (
                    <div
                      key={c.id}
                      className="flex gap-2 items-start p-2 rounded-lg bg-surface-700/50 border border-surface-500"
                    >
                      <input
                        type="text"
                        value={c.nombre}
                        onChange={(e) => updateCampo(c.id, { nombre: e.target.value })}
                        placeholder="Nombre del campo"
                        className="flex-1 rounded bg-surface-600 px-2 py-1 text-white text-xs"
                      />
                      <select
                        value={c.tipo}
                        onChange={(e) =>
                          updateCampo(c.id, {
                            tipo: e.target.value as MetricaCampoConfig["tipo"],
                          })
                        }
                        className="w-24 rounded bg-surface-600 px-2 py-1 text-white text-xs"
                      >
                        {TIPOS_CAMPO.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      {c.tipo === "fecha" && (
                        <label className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                          <input
                            type="checkbox"
                            checked={c.esClaveFiltro ?? false}
                            onChange={(e) =>
                              updateCampo(c.id, { esClaveFiltro: e.target.checked })
                            }
                            className="rounded"
                          />
                          Filtro fechas
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={() => removeCampo(c.id)}
                        className="p-1 text-gray-500 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addCampo}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-accent-purple hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Añadir campo
                </button>
              </div>

              {campos.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-accent-amber mb-1">
                    Datos registrados
                  </label>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-surface-500 divide-y divide-surface-500">
                    {entradas.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-gray-500 text-center">
                        Sin datos. Añade entradas abajo.
                      </div>
                    ) : (
                      entradas.map((e, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-2 py-1.5 text-xs"
                        >
                          <span className="text-gray-400 truncate">
                            {Object.entries(e)
                              .filter(([, v]) => v != null)
                              .map(([k, v]) => {
                                const campo = campos.find((c) => c.id === k);
                                return `${campo?.nombre ?? k}: ${v}`;
                              })
                              .join(", ")}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeEntrada(idx)}
                            className="text-gray-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-2 p-2 rounded-lg bg-surface-700/30 border border-surface-500 space-y-2">
                    <span className="text-[10px] text-gray-500 uppercase">Añadir dato</span>
                    <div className="flex flex-wrap gap-2">
                      {campos.map((c) => (
                        <div key={c.id} className="flex flex-col gap-0.5">
                          <label className="text-[10px] text-gray-500">{c.nombre}</label>
                          {c.tipo === "numero" ? (
                            <input
                              type="number"
                              value={String(nuevaEntrada[c.id] ?? "")}
                              onChange={(ev) =>
                                setNuevaEntrada((prev) => ({
                                  ...prev,
                                  [c.id]: parseFloat(ev.target.value) || 0,
                                }))
                              }
                              className="w-20 rounded bg-surface-600 px-1.5 py-1 text-xs text-white"
                            />
                          ) : c.tipo === "boolean" ? (
                            <select
                              value={String(nuevaEntrada[c.id] ?? "")}
                              onChange={(ev) =>
                                setNuevaEntrada((prev) => ({
                                  ...prev,
                                  [c.id]: ev.target.value === "true",
                                }))
                              }
                              className="rounded bg-surface-600 px-1.5 py-1 text-xs text-white"
                            >
                              <option value="">—</option>
                              <option value="true">Sí</option>
                              <option value="false">No</option>
                            </select>
                          ) : c.tipo === "fecha" ? (
                            <input
                              type="date"
                              value={String(nuevaEntrada[c.id] ?? "")}
                              onChange={(ev) =>
                                setNuevaEntrada((prev) => ({
                                  ...prev,
                                  [c.id]: ev.target.value,
                                }))
                              }
                              className="rounded bg-surface-600 px-1.5 py-1 text-xs text-white"
                            />
                          ) : (
                            <input
                              type="text"
                              value={String(nuevaEntrada[c.id] ?? "")}
                              onChange={(ev) =>
                                setNuevaEntrada((prev) => ({
                                  ...prev,
                                  [c.id]: ev.target.value,
                                }))
                              }
                              className="w-28 rounded bg-surface-600 px-1.5 py-1 text-xs text-white"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addEntrada}
                      className="inline-flex items-center gap-1 text-xs text-accent-green hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" /> Añadir
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {tipo === "automatica" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-accent-cyan mb-1">
                  Tipo de fórmula
                </label>
                <select
                  value={formulaTipo}
                  onChange={(e) =>
                    setFormulaTipo(e.target.value as MetricaFormulaConfig["tipo"])
                  }
                  className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white"
                >
                  {TIPOS_FORMULA.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-500">
                  {TIPOS_FORMULA.find((t) => t.value === formulaTipo)?.desc}
                </p>
              </div>

              {formulaTipo !== "condicion" && (
                <>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent-cyan/20 text-accent-cyan text-[10px] font-bold shrink-0">1</span>
                    <span className="text-xs font-medium text-accent-cyan">Selecciona {formulaTipo === "directo" ? "la fuente" : "las fuentes"}</span>
                  </div>

                  {formulaTipo !== "directo" && fuente.length >= 2 && (
                    <div className="rounded-lg bg-surface-700/40 border border-surface-500/50 px-3 py-2 text-xs text-gray-400 font-mono text-center">
                      Resultado = {fuente.length > 0 ? fuente.map((_, i) => `operando${i + 1}`).join(
                        formulaTipo === "suma" ? " + " :
                        formulaTipo === "promedio" ? " + " :
                        formulaTipo === "multiplicacion" ? " × " :
                        formulaTipo === "division" ? " ÷ " :
                        " − "
                      ) : "..."}{formulaTipo === "promedio" && fuente.length > 0 ? ` ÷ ${fuente.length}` : ""}
                    </div>
                  )}

                  <div>
                    <SelectorFuenteConBusqueda
                      metricasConfig={metricasConfig}
                      selected={fuente}
                      onChange={setFuente}
                      multiple={formulaTipo !== "directo"}
                      maxSources={
                        formulaTipo === "division" || formulaTipo === "resta" ? 2 : 10
                      }
                      excludeMetricId={editingMetric?.id}
                    />
                  </div>
                </>
              )}

              {formulaTipo === "condicion" && (
                <div className="space-y-3 p-3 rounded-lg bg-surface-700/50 border border-surface-500">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent-cyan/20 text-accent-cyan text-[10px] font-bold shrink-0">1</span>
                    <span className="text-xs font-medium text-accent-cyan">Define la condición</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Fuente a comparar
                    </label>
                    <SelectorFuenteConBusqueda
                      metricasConfig={metricasConfig}
                      selected={fuente}
                      onChange={setFuente}
                      excludeMetricId={editingMetric?.id}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Operador
                    </label>
                    <select
                      value={operador}
                      onChange={(e) =>
                        setOperador(e.target.value as MetricaFormulaConfig["operador"])
                      }
                      className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white"
                    >
                      {OPERADORES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-400">
                        Valor de comparación
                      </label>
                      <div className="flex rounded-md overflow-hidden border border-surface-500">
                        <button
                          type="button"
                          onClick={() => { setComparacionMode("fijo"); setComparacionFuente([]); }}
                          className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${comparacionMode === "fijo" ? "bg-accent-cyan/20 text-accent-cyan" : "bg-surface-700 text-gray-500 hover:text-gray-300"}`}
                        >
                          Valor fijo
                        </button>
                        <button
                          type="button"
                          onClick={() => { setComparacionMode("variable"); setValorComparacion(""); }}
                          className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${comparacionMode === "variable" ? "bg-accent-purple/20 text-accent-purple" : "bg-surface-700 text-gray-500 hover:text-gray-300"}`}
                        >
                          Variable
                        </button>
                      </div>
                    </div>
                    {comparacionMode === "fijo" ? (
                      <input
                        type="text"
                        value={valorComparacion}
                        onChange={(e) => setValorComparacion(e.target.value)}
                        placeholder="Número, true o false"
                        className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white"
                      />
                    ) : (
                      <SelectorFuenteConBusqueda
                        metricasConfig={metricasConfig}
                        selected={comparacionFuente}
                        onChange={setComparacionFuente}
                        excludeMetricId={editingMetric?.id}
                      />
                    )}
                  </div>

                  {fuente.length > 0 && (
                    <div className="rounded-lg bg-surface-800/60 border border-surface-500/50 px-3 py-2 text-xs text-gray-400 font-mono text-center">
                      Si <span className="text-accent-cyan">fuente</span> {operador} <span className={comparacionMode === "variable" ? "text-accent-purple" : "text-accent-amber"}>{comparacionMode === "variable" ? (comparacionFuente[0] ?? "?") : (valorComparacion || "?")}</span> → resultado A, sino → resultado B
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent-green/20 text-accent-green text-[10px] font-bold shrink-0">2</span>
                    <span className="text-xs font-medium text-accent-green">Define los resultados</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-accent-green">
                          Resultado si cumple (A)
                        </label>
                        <div className="flex rounded-md overflow-hidden border border-surface-500">
                          <button
                            type="button"
                            onClick={() => { setSiCumpleMode("fijo"); setSiCumpleFuente([]); }}
                            className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${siCumpleMode === "fijo" ? "bg-accent-cyan/20 text-accent-cyan" : "bg-surface-700 text-gray-500 hover:text-gray-300"}`}
                          >
                            Fijo
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSiCumpleMode("variable"); setValorSiCumple(""); }}
                            className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${siCumpleMode === "variable" ? "bg-accent-purple/20 text-accent-purple" : "bg-surface-700 text-gray-500 hover:text-gray-300"}`}
                          >
                            Variable
                          </button>
                        </div>
                      </div>
                      {siCumpleMode === "fijo" ? (
                        <input
                          type="text"
                          value={valorSiCumple}
                          onChange={(e) => setValorSiCumple(e.target.value)}
                          placeholder="Número"
                          className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white"
                        />
                      ) : (
                        <SelectorFuenteConBusqueda
                          metricasConfig={metricasConfig}
                          selected={siCumpleFuente}
                          onChange={setSiCumpleFuente}
                          excludeMetricId={editingMetric?.id}
                        />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-red-400">
                          Resultado si no cumple (B)
                        </label>
                        <div className="flex rounded-md overflow-hidden border border-surface-500">
                          <button
                            type="button"
                            onClick={() => { setSiNoMode("fijo"); setSiNoFuente([]); }}
                            className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${siNoMode === "fijo" ? "bg-accent-cyan/20 text-accent-cyan" : "bg-surface-700 text-gray-500 hover:text-gray-300"}`}
                          >
                            Fijo
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSiNoMode("variable"); setValorSiNo(""); }}
                            className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${siNoMode === "variable" ? "bg-accent-purple/20 text-accent-purple" : "bg-surface-700 text-gray-500 hover:text-gray-300"}`}
                          >
                            Variable
                          </button>
                        </div>
                      </div>
                      {siNoMode === "fijo" ? (
                        <input
                          type="text"
                          value={valorSiNo}
                          onChange={(e) => setValorSiNo(e.target.value)}
                          placeholder="Número"
                          className="w-full rounded-lg bg-surface-600 border border-surface-500 px-2 py-1.5 text-white"
                        />
                      ) : (
                        <SelectorFuenteConBusqueda
                          metricasConfig={metricasConfig}
                          selected={siNoFuente}
                          onChange={setSiNoFuente}
                          excludeMetricId={editingMetric?.id}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-surface-800 border-t border-surface-500 px-4 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-600 text-gray-300 hover:bg-surface-500"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-4 py-2 rounded-lg bg-accent-green text-black font-semibold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="animate-spin">⏳</span> Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Guardar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
