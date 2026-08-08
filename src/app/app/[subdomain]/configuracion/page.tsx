"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import PageHeader from "@/components/dashboard/PageHeader";
import HelpTooltip from "@/components/dashboard/HelpTooltip";
import { UserPlus, Shield, Crown, Users, X, Mail, Pencil, Loader2, Plus, Trash2, Upload, Download, CheckCircle2, Sparkles, MessageSquare, Phone, Video, Building2, ChevronDown, ChevronUp, GitBranch, AlertTriangle } from "lucide-react";
import { useUserFilter } from "@/contexts/UserFilterContext";
import { canManageUsers, canManageRoles, canManageSystem } from "@/lib/permisos";
import { PERMISOS_DISPONIBLES, type PermisoId } from "@/lib/permisos";
import type { RolConfig } from "@/lib/db/schema";
import { toast } from "sonner";

type Canal = "chats" | "llamadas" | "videollamadas";

interface CanalesState {
  chats: string[] | null;
  llamadas: string[] | null;
  videollamadas: string[] | null;
}

interface CalificaState {
  chats: boolean;
  llamadas: boolean;
  videollamadas: boolean;
}

interface CategoriaCustom {
  slug: string;
  label: string;
  descripcion: string;
}

interface CriteriosCalificacionData {
  categorias: string[] | null;
  canales: CanalesState;
  califica: CalificaState;
  categoriasDisponibles: string[];
  categoriasCustom: CategoriaCustom[];
  promptCalificacionChats: string | null;
}

interface EmbudoEtapa {
  id: string;
  nombre: string;
  name?: string;
  color?: string;
  orden: number;
  condition?: string;
  fuentes?: Canal[];
  es_fallback?: boolean;
  es_fija?: boolean;
  es_calificada?: boolean;
  es_cerrada?: boolean;
  es_unica?: boolean;
}

interface SystemConfigData {
  prompt_ventas: string;
  prompt_videollamadas: string;
  prompt_llamadas: string;
  embudo_personalizado: EmbudoEtapa[];
}

interface CanalesActivosData {
  chats: boolean;
  llamadas: boolean;
  videollamadas: boolean;
}

type TipoUsuario = "analista" | "enfoque";

interface UserRow {
  id: number;
  nombre: string | null;
  email: string;
  rol: string;
  permisos: Record<string, boolean> | null;
  fathom: string | null;
  id_webhook_fathom?: string | null;
  tipo_usuario: TipoUsuario;
}

const ROLES_BUILTIN = [
  { id: "superadmin", nombre: "Administrador General" },
  { id: "usuario", nombre: "Usuario" },
];

const CALIFICA_DEFAULTS: CalificaState = { chats: true, llamadas: false, videollamadas: true };

const CANAL_CONFIG: {
  id: Canal;
  label: string;
  icon: typeof MessageSquare;
  color: string;
  borderColor: string;
  bgColor: string;
  promptLabel: string;
  promptPlaceholder: string;
  promptNote?: string;
  helpTitulo: string;
  helpContenido: string;
  helpProbar: string;
  criteriosHelp: { titulo: string; contenido: string; probar: string };
}[] = [
  {
    id: "chats",
    label: "Chats (WhatsApp)",
    icon: MessageSquare,
    color: "text-accent-amber",
    borderColor: "border-accent-amber/30",
    bgColor: "bg-accent-amber/5",
    promptLabel: "Prompt de calificación de chats",
    promptPlaceholder: "Describe cómo se debe determinar si un chat está calificado o no...",
    helpTitulo: "Configuración de Chats",
    helpContenido: "Aquí configuras todo lo relacionado con el canal de chats (WhatsApp): el prompt que usa la IA para calificar, los criterios de calificación, y las etapas del embudo que aplican a este canal.",
    helpProbar: "Activa la calificación, configura el prompt y los criterios, guarda, y verifica en Performance que los chats se clasifican correctamente.",
    criteriosHelp: {
      titulo: "Criterios de Chats (WhatsApp)",
      contenido: "Las categorías seleccionadas aquí aplican solo a las conversaciones de WhatsApp/chat. Si dejas vacío, se usarán los criterios globales para este canal.",
      probar: "Selecciona categorías específicas para chats, guarda, y verifica que solo se aplican a los chats en Performance.",
    },
  },
  {
    id: "llamadas",
    label: "Llamadas (Twilio)",
    icon: Phone,
    color: "text-accent-cyan",
    borderColor: "border-accent-cyan/30",
    bgColor: "bg-accent-cyan/5",
    promptLabel: "Prompt de resumen de llamadas",
    promptPlaceholder: "Instrucciones para resumir la llamada telefónica...",
    promptNote: "Este prompt se usa solo para generar el resumen de la llamada, no para calificar.",
    helpTitulo: "Configuración de Llamadas",
    helpContenido: "Aquí configuras todo lo relacionado con el canal de llamadas telefónicas (Twilio): el prompt de resumen, los criterios de calificación, y las etapas del embudo que aplican a este canal.\n\nNota: El prompt de llamadas genera un resumen, no una calificación directa.",
    helpProbar: "Configura el prompt de resumen y los criterios, guarda, y verifica en Performance que las llamadas se procesan correctamente.",
    criteriosHelp: {
      titulo: "Criterios de Llamadas (Twilio)",
      contenido: "Las categorías seleccionadas aquí aplican solo a las llamadas telefónicas. Si dejas vacío, se usarán los criterios globales para este canal.",
      probar: "Selecciona categorías específicas para llamadas, guarda, y verifica que solo se aplican a las llamadas en Performance.",
    },
  },
  {
    id: "videollamadas",
    label: "Citas (Fathom)",
    icon: Video,
    color: "text-accent-purple",
    borderColor: "border-accent-purple/30",
    bgColor: "bg-accent-purple/5",
    promptLabel: "Prompt de evaluación de citas",
    promptPlaceholder: "Evalúa la cita según los siguientes criterios...",
    helpTitulo: "Configuración de Citas",
    helpContenido: "Aquí configuras todo lo relacionado con el canal de citas/videollamadas (Fathom): el prompt de evaluación que usa la IA, los criterios de calificación, y las etapas del embudo que aplican a este canal.",
    helpProbar: "Configura el prompt de evaluación y los criterios, guarda, y verifica en Performance que las citas se evalúan correctamente.",
    criteriosHelp: {
      titulo: "Criterios de Citas (Fathom)",
      contenido: "Las categorías seleccionadas aquí aplican solo a las citas. Si dejas vacío, se usarán los criterios globales para este canal.",
      probar: "Selecciona categorías específicas para citas, guarda, y verifica que solo se aplican a las citas en Performance.",
    },
  },
];

const EMBUDO_COLORS = ["#06b6d4", "#8b5cf6", "#22c55e", "#f97316", "#ef4444", "#eab308", "#ec4899", "#14b8a6"];

export default function ConfiguracionPage() {
  const { session } = useUserFilter();
  const permisos = session?.permisosArray ?? [];
  const puedeUsuarios = canManageUsers(permisos) || session?.rol === "superadmin";
  const puedeRoles = canManageRoles(permisos) || session?.rol === "superadmin";
  const puedeCriterios = canManageSystem(permisos) || session?.rol === "superadmin";

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RolConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalUser, setModalUser] = useState<"create" | "edit" | null>(null);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [formUser, setFormUser] = useState({ name: "", email: "", fathom: "", rol: "usuario", tipo_usuario: "analista" as TipoUsuario });
  const [error, setError] = useState("");

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ creados: number; errores: Array<{ email: string; error: string }> } | null>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  const [modalRol, setModalRol] = useState<"create" | "edit" | null>(null);
  const [editingRol, setEditingRol] = useState<RolConfig | null>(null);
  const [formRol, setFormRol] = useState<RolConfig>({ id: "", nombre: "", permisos: [] });

  const [criteriosData, setCriteriosData] = useState<CriteriosCalificacionData | null>(null);
  const [criteriosSeleccionados, setCriteriosSeleccionados] = useState<string[]>([]);
  const [criteriosCanales, setCriteriosCanales] = useState<CanalesState>({ chats: null, llamadas: null, videollamadas: null });
  const [criteriosSaving, setCriteriosSaving] = useState(false);
  const [criteriosLoaded, setCriteriosLoaded] = useState(false);
  const [categoriasCustom, setCategoriasCustom] = useState<CategoriaCustom[]>([]);
  const [modalCustom, setModalCustom] = useState<"create" | "edit" | null>(null);
  const [editingCustomIdx, setEditingCustomIdx] = useState<number>(-1);
  const [formCustom, setFormCustom] = useState<{ label: string; descripcion: string }>({ label: "", descripcion: "" });
  const [promptCalificacionChats, setPromptCalificacionChats] = useState("");
  const [califica, setCalifica] = useState<CalificaState>({ ...CALIFICA_DEFAULTS });

  const [promptEmpresa, setPromptEmpresa] = useState("");
  const [promptLlamadas, setPromptLlamadas] = useState("");
  const [promptVideollamadas, setPromptVideollamadas] = useState("");
  const [embudoEtapas, setEmbudoEtapas] = useState<EmbudoEtapa[]>([]);
  const [systemConfigLoaded, setSystemConfigLoaded] = useState(false);
  const [systemSaving, setSystemSaving] = useState(false);

  const [canales, setCanales] = useState<CanalesActivosData>({ chats: false, llamadas: false, videollamadas: false });
  const [canalesSaving, setCanalesSaving] = useState(false);
  const [canalesLoaded, setCanalesLoaded] = useState(false);

  const [expandedCanal, setExpandedCanal] = useState<Canal | null>("chats");

  const loadCriterios = useCallback(async () => {
    if (!puedeCriterios) return;
    try {
      const res = await fetch("/api/data/criterios-calificacion");
      if (res.ok) {
        const data = (await res.json()) as CriteriosCalificacionData;
        setCriteriosData(data);
        setCriteriosSeleccionados(data.categorias ?? []);
        setCriteriosCanales(data.canales ?? { chats: null, llamadas: null, videollamadas: null });
        setCategoriasCustom(data.categoriasCustom ?? []);
        setPromptCalificacionChats(data.promptCalificacionChats ?? "");
        setCalifica(data.califica ?? { ...CALIFICA_DEFAULTS });
        setCriteriosLoaded(true);
      }
    } catch { /* ignore */ }
  }, [puedeCriterios]);

  const loadSystemConfig = useCallback(async () => {
    if (!puedeCriterios) return;
    try {
      const res = await fetch("/api/data/system-config");
      if (res.ok) {
        const data = (await res.json()) as SystemConfigData;
        setPromptEmpresa(data.prompt_ventas ?? "");
        setPromptLlamadas(data.prompt_llamadas ?? "");
        setPromptVideollamadas(data.prompt_videollamadas ?? "");
        setEmbudoEtapas(Array.isArray(data.embudo_personalizado)
          ? data.embudo_personalizado.map((e) => ({ ...e, nombre: e.nombre ?? e.name ?? e.id }))
          : []);
        setSystemConfigLoaded(true);
      }
    } catch { /* ignore */ }
  }, [puedeCriterios]);

  const loadCanales = useCallback(async () => {
    if (!puedeCriterios) return;
    try {
      const res = await fetch("/api/data/canales-activos");
      if (res.ok) {
        const data = (await res.json()) as CanalesActivosData;
        setCanales(data);
        setCanalesLoaded(true);
      }
    } catch { /* ignore */ }
  }, [puedeCriterios]);

  const loadUsers = useCallback(async () => {
    if (!puedeUsuarios) return;
    try {
      const res = await fetch("/api/data/usuarios");
      if (res.ok) setUsers(await res.json());
    } catch { /* ignore */ }
  }, [puedeUsuarios]);

  const loadRoles = useCallback(async () => {
    if (!puedeRoles) return;
    try {
      const res = await fetch("/api/data/roles");
      if (res.ok) setRoles(await res.json());
    } catch { /* ignore */ }
  }, [puedeRoles]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadUsers(), loadRoles(), loadCriterios(), loadCanales(), loadSystemConfig()]).finally(() => setLoading(false));
  }, [loadUsers, loadRoles, loadCriterios, loadCanales, loadSystemConfig]);

  const rolesParaSelect = [...ROLES_BUILTIN, ...roles.filter((r) => !["superadmin", "usuario"].includes(r.id))];

  const openCreateUser = () => { setEditingUser(null); setFormUser({ name: "", email: "", fathom: "", rol: "usuario", tipo_usuario: "analista" }); setError(""); setModalUser("create"); };
  const openEditUser = (u: UserRow) => { setEditingUser(u); setFormUser({ name: u.nombre ?? "", email: u.email, fathom: u.fathom ?? "", rol: u.rol, tipo_usuario: u.tipo_usuario ?? "analista" }); setError(""); setModalUser("edit"); };

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      if (editingUser) {
        const body: Record<string, unknown> = { id: editingUser.id, nombre: formUser.name, rol: formUser.rol, fathom: formUser.fathom, tipo_usuario: formUser.tipo_usuario };
        const putRes = await fetch("/api/data/usuarios", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!putRes.ok) throw new Error("Error al actualizar");
        const putData = await putRes.json().catch(() => ({}));
        if (putData.fathomWarning) { toast.warning("Usuario actualizado, pero Fathom no registró el webhook", { description: putData.fathomWarning }); }
        else { toast.success("Usuario actualizado"); }
      } else {
        if (!formUser.email) { setError("Email es obligatorio"); setSaving(false); return; }
        const payload: Record<string, unknown> = { nombre: formUser.name, email: formUser.email, rol: formUser.rol, fathom: formUser.fathom, tipo_usuario: formUser.tipo_usuario };
        const res = await fetch("/api/data/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.error ?? "Error al crear usuario"); setSaving(false); return; }
        const created = await res.json().catch(() => ({}));
        if (created.fathomWarning) { toast.warning("Usuario creado, pero Fathom no registró el webhook", { description: created.fathomWarning }); }
        else { toast.success("Usuario creado. Podrá entrar con Google o código por correo."); }
      }
      setModalUser(null); loadUsers();
    } catch { setError("Error de red"); }
    setSaving(false);
  };

  const handleDeleteUser = async (id: number) => {
    const target = users.find((u) => u.id === id);
    if (target && session?.email && target.email === session.email) { toast.error("No puedes eliminar tu propia cuenta"); return; }
    if (!confirm("¿Eliminar este usuario?")) return;
    try { const res = await fetch(`/api/data/usuarios?id=${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Error al eliminar"); toast.success("Usuario eliminado"); loadUsers(); }
    catch { toast.error("Error al eliminar el usuario"); }
  };

  const updateRoleUser = async (userId: number, newRole: string) => {
    try { const res = await fetch("/api/data/usuarios", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: userId, rol: newRole }) }); if (!res.ok) throw new Error("Error al actualizar rol"); toast.success("Rol actualizado"); loadUsers(); }
    catch { toast.error("Error al actualizar el rol"); }
  };

  const openCreateRol = () => { setEditingRol(null); setFormRol({ id: `rol_${Date.now()}`, nombre: "", permisos: [] }); setModalRol("create"); };
  const openEditRol = (r: RolConfig) => { setEditingRol(r); setFormRol({ ...r }); setModalRol("edit"); };
  const togglePermisoRol = (permisoId: PermisoId) => { setFormRol((prev) => ({ ...prev, permisos: prev.permisos.includes(permisoId) ? prev.permisos.filter((p) => p !== permisoId) : [...prev.permisos, permisoId] })); };

  const handleSubmitRol = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const newRoles = editingRol ? roles.map((r) => (r.id === editingRol.id ? formRol : r)) : [...roles, formRol];
      const res = await fetch("/api/data/roles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roles_config: newRoles }) });
      if (!res.ok) throw new Error("Error al guardar rol"); toast.success("Rol guardado"); setModalRol(null); loadRoles();
    } catch { toast.error("Error al guardar el rol"); }
    setSaving(false);
  };

  const handleDeleteRol = async (id: string) => {
    if (["superadmin", "usuario"].includes(id)) return;
    if (!confirm("¿Eliminar este rol?")) return;
    try { const newRoles = roles.filter((r) => r.id !== id); const res = await fetch("/api/data/roles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roles_config: newRoles }) }); if (!res.ok) throw new Error("Error al eliminar rol"); toast.success("Rol eliminado"); loadRoles(); }
    catch { toast.error("Error al eliminar el rol"); }
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault(); if (!bulkFile) return; setBulkLoading(true); setBulkResult(null);
    try { const fd = new FormData(); fd.append("file", bulkFile); const res = await fetch("/api/data/usuarios/bulk", { method: "POST", body: fd }); const data = await res.json(); setBulkResult(data); if (data.creados > 0) loadUsers(); }
    catch { toast.error("Error al procesar el archivo"); }
    setBulkLoading(false);
  };

  const handleSaveCriterios = async () => {
    setCriteriosSaving(true);
    try {
      const res = await fetch("/api/data/criterios-calificacion", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorias: criteriosSeleccionados.length > 0 ? criteriosSeleccionados : null, canales: criteriosCanales, categoriasCustom: categoriasCustom.length > 0 ? categoriasCustom : undefined, promptCalificacionChats: promptCalificacionChats.trim() || null, califica }),
      });
      if (!res.ok) throw new Error("Error al guardar"); toast.success("Criterios de calificación guardados"); await loadCriterios();
    } catch { toast.error("Error al guardar los criterios"); }
    setCriteriosSaving(false);
  };

  const toggleCriterio = (canal: Canal, cat: string) => {
    setCriteriosCanales((prev) => {
      const current = prev[canal] ?? [];
      const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
      return { ...prev, [canal]: next.length > 0 ? next : null };
    });
  };

  const toggleCriterioGlobal = (cat: string) => {
    setCriteriosSeleccionados((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  };

  const slugify = (text: string): string => text.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

  const openCreateCustom = () => { setFormCustom({ label: "", descripcion: "" }); setEditingCustomIdx(-1); setModalCustom("create"); };
  const openEditCustom = (idx: number) => { const cat = categoriasCustom[idx]; setFormCustom({ label: cat.label, descripcion: cat.descripcion }); setEditingCustomIdx(idx); setModalCustom("edit"); };

  const handleSubmitCustom = () => {
    const label = formCustom.label.trim(); const descripcion = formCustom.descripcion.trim();
    if (!label) return; const slug = slugify(label); if (!slug) return;
    if (modalCustom === "create") { if (categoriasCustom.some((c) => c.slug === slug)) { toast.error("Ya existe un criterio con ese nombre"); return; } setCategoriasCustom((prev) => [...prev, { slug, label, descripcion }]); }
    else if (modalCustom === "edit" && editingCustomIdx >= 0) { if (categoriasCustom.some((c, i) => c.slug === slug && i !== editingCustomIdx)) { toast.error("Ya existe un criterio con ese nombre"); return; } setCategoriasCustom((prev) => prev.map((c, i) => (i === editingCustomIdx ? { slug, label, descripcion } : c))); }
    setModalCustom(null);
  };

  const handleDeleteCustom = (idx: number) => {
    const cat = categoriasCustom[idx];
    setCategoriasCustom((prev) => prev.filter((_, i) => i !== idx));
    setCriteriosSeleccionados((prev) => prev.filter((s) => s !== cat.slug));
    setCriteriosCanales((prev) => {
      const updated = { ...prev };
      for (const canal of ["chats", "llamadas", "videollamadas"] as Canal[]) {
        if (updated[canal]) { const filtered = updated[canal]!.filter((s) => s !== cat.slug); updated[canal] = filtered.length > 0 ? filtered : null; }
      }
      return updated;
    });
  };

  const handleSaveSystemConfig = async () => {
    setSystemSaving(true);
    try {
      const res = await fetch("/api/data/system-config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_ventas: promptEmpresa, prompt_videollamadas: promptVideollamadas, prompt_llamadas: promptLlamadas, embudo_personalizado: embudoEtapas }),
      });
      if (!res.ok) throw new Error("Error al guardar"); toast.success("Configuración guardada"); await loadSystemConfig();
    } catch { toast.error("Error al guardar la configuración"); }
    setSystemSaving(false);
  };

  const handleSaveCanales = async () => {
    setCanalesSaving(true);
    try {
      const res = await fetch("/api/data/canales-activos", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(canales),
      });
      if (!res.ok) throw new Error("Error al guardar"); toast.success("Canales activos guardados"); await loadCanales();
    } catch { toast.error("Error al guardar los canales"); }
    setCanalesSaving(false);
  };

  const toggleCanal = (canal: keyof CanalesActivosData) => { setCanales((prev) => ({ ...prev, [canal]: !prev[canal] })); };

  const addEmbudoEtapa = (canal: Canal) => {
    const maxOrden = embudoEtapas.reduce((max, e) => Math.max(max, e.orden), 0);
    const colorIdx = embudoEtapas.filter((e) => !e.es_fija).length % EMBUDO_COLORS.length;
    setEmbudoEtapas((prev) => [...prev, { id: `custom_${Date.now()}`, nombre: "Nueva etapa", color: EMBUDO_COLORS[colorIdx], orden: maxOrden + 1, fuentes: [canal] }]);
  };

  const removeEmbudoEtapa = (id: string) => { setEmbudoEtapas((prev) => prev.filter((e) => e.id !== id)); };

  const getPromptForCanal = (canal: Canal): string => {
    if (canal === "chats") return promptCalificacionChats;
    if (canal === "llamadas") return promptLlamadas;
    return promptVideollamadas;
  };

  const setPromptForCanal = (canal: Canal, value: string) => {
    if (canal === "chats") setPromptCalificacionChats(value);
    else if (canal === "llamadas") setPromptLlamadas(value);
    else setPromptVideollamadas(value);
  };

  const getEtapasForCanal = (canal: Canal): EmbudoEtapa[] => embudoEtapas.filter((e) => !e.es_fija && e.fuentes?.includes(canal));

  const allCategoriasDisponibles = [...(criteriosData?.categoriasDisponibles ?? []), ...categoriasCustom.map((c) => c.slug)];

  const handleSaveAll = async () => { await Promise.all([handleSaveCriterios(), handleSaveSystemConfig()]); };

  if (!puedeUsuarios && !puedeRoles && !puedeCriterios) {
    return (
      <>
        <PageHeader title="Configuración" subtitle="Sin permisos" action={<span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-amber/20 text-accent-amber border border-accent-amber/40 font-medium uppercase shrink-0">Beta</span>} />
        <div className="p-4 text-center text-gray-500">No tienes permiso para acceder a esta sección.</div>
      </>
    );
  }

  const renderCriteriosSelector = (canal: Canal) => {
    const selected = criteriosCanales[canal] ?? [];
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {allCategoriasDisponibles.map((cat) => {
            const isSelected = selected.includes(cat);
            const customDef = categoriasCustom.find((c) => c.slug === cat);
            const displayLabel = customDef ? customDef.label : cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
            return (
              <button key={cat} type="button" onClick={() => toggleCriterio(canal, cat)} title={customDef?.descripcion}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${isSelected ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" : "bg-surface-700 text-gray-400 border-surface-500 hover:border-emerald-500/30 hover:text-gray-300"} ${customDef ? "ring-1 ring-accent-purple/30" : ""}`}>
                {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                {displayLabel}
                {customDef && <Sparkles className="w-3 h-3 text-accent-purple/60" />}
              </button>
            );
          })}
        </div>
        {selected.length > 0 && <span className="text-xs text-gray-400">{selected.length} categoría{selected.length !== 1 ? "s" : ""} seleccionada{selected.length !== 1 ? "s" : ""}</span>}
      </div>
    );
  };

  const renderEtapasCanal = (canal: Canal) => {
    const etapas = getEtapasForCanal(canal);
    return (
      <div className="space-y-2">
        {etapas.length === 0
          ? <p className="text-xs text-gray-500 py-2">No hay etapas personalizadas para este canal.</p>
          : <ul className="space-y-2">{etapas.map((etapa) => {
              const allIdx = embudoEtapas.findIndex((x) => x.id === etapa.id);
              return (
                <li key={etapa.id} className="rounded-lg p-3 bg-surface-700/50 border border-surface-600 flex items-center gap-3">
                  <input type="color" value={etapa.color ?? "#06b6d4"} onChange={(e) => setEmbudoEtapas((prev) => prev.map((x, i) => i === allIdx ? { ...x, color: e.target.value } : x))} className="w-8 h-8 rounded cursor-pointer border border-surface-500 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <input type="text" value={etapa.nombre} onChange={(e) => setEmbudoEtapas((prev) => prev.map((x, i) => i === allIdx ? { ...x, nombre: e.target.value } : x))} className="w-full bg-transparent text-sm font-medium text-white placeholder-gray-500 focus:outline-none" placeholder="Nombre de la etapa" />
                    <textarea value={etapa.condition ?? ""} onChange={(e) => setEmbudoEtapas((prev) => prev.map((x, i) => i === allIdx ? { ...x, condition: e.target.value } : x))} placeholder="Descripción para la IA..." className="w-full rounded bg-surface-600 border border-surface-500 px-2 py-1 text-xs text-white placeholder-gray-600 resize-none" rows={2} />
                  </div>
                  <button type="button" onClick={() => removeEmbudoEtapa(etapa.id)} className="shrink-0 p-1.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400" title="Eliminar etapa">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}</ul>
        }
        <button type="button" onClick={() => addEmbudoEtapa(canal)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-gray-300 hover:text-white hover:border-accent-cyan/50 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Agregar etapa
        </button>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Configuración" subtitle="Usuarios · Roles · Canales" action={<span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-amber/20 text-accent-amber border border-accent-amber/40 font-medium uppercase shrink-0">Beta</span>} />
      <div className="p-3 md:p-4 max-w-4xl mx-auto space-y-6 text-sm min-w-0 max-w-full overflow-x-hidden">
        {/* ── Roles ── */}
        {puedeRoles && (
          <section className="rounded-xl border border-surface-500 bg-surface-800/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-accent-cyan" />
                <h2 className="text-sm font-semibold text-white">Roles</h2>
                <span className="px-2 py-0.5 rounded-full bg-accent-cyan/20 text-accent-cyan text-xs font-medium">{roles.length + 2}</span>
              </div>
              <button type="button" onClick={openCreateRol} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-cyan text-black text-sm font-semibold hover:bg-accent-cyan/90 transition-colors">
                <Plus className="w-4 h-4" /> Crear rol
              </button>
            </div>
            <ul className="space-y-2">
              {ROLES_BUILTIN.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-lg bg-surface-700/80 border border-surface-500 px-3 py-2">
                  <span className="text-white font-medium">{r.nombre}</span>
                  <span className="text-xs text-gray-500">(integrado)</span>
                </li>
              ))}
              {roles.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-lg bg-surface-700/80 border border-surface-500 px-3 py-2">
                  <span className="text-white font-medium">{r.nombre}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => openEditRol(r)} className="p-1.5 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-accent-cyan"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => handleDeleteRol(r.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Usuarios ── */}
        {puedeUsuarios && (
          <section className="rounded-xl border border-surface-500 bg-surface-800/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-accent-cyan" />
                <h2 className="text-sm font-semibold text-white">Usuarios</h2>
                <span className="px-2 py-0.5 rounded-full bg-accent-cyan/20 text-accent-cyan text-xs font-medium">{users.length}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <a href="/api/data/usuarios/template" download className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-700 border border-surface-500 text-gray-300 text-xs font-medium hover:bg-surface-600 transition-colors"><Download className="w-3.5 h-3.5" /> Plantilla</a>
                <button type="button" onClick={() => { setShowBulkModal(true); setBulkResult(null); setBulkFile(null); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-700 border border-surface-500 text-gray-300 text-xs font-medium hover:bg-surface-600 transition-colors"><Upload className="w-3.5 h-3.5" /> Carga masiva</button>
                <button type="button" onClick={openCreateUser} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-cyan text-black text-sm font-semibold hover:bg-accent-cyan/90 transition-colors"><UserPlus className="w-4 h-4" /> Añadir usuario</button>
              </div>
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
            ) : users.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center rounded-lg bg-surface-700/50 border border-surface-500 border-dashed">No hay usuarios. Haz clic en &quot;Añadir usuario&quot; para crear el primero.</p>
            ) : (
              <ul className="space-y-2">
                {users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between rounded-lg bg-surface-700/80 border border-surface-500 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white font-medium">{u.nombre ?? u.email}</span>
                        {u.rol === "superadmin" && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        {u.tipo_usuario === "enfoque" && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-purple/20 text-accent-purple border border-accent-purple/30 font-medium uppercase">Enfoque</span>}
                      </div>
                      <span className="text-gray-500 text-xs block">{u.email}</span>
                      {u.fathom?.trim() && <span className={`text-[10px] block mt-0.5 ${u.id_webhook_fathom ? "text-accent-green" : "text-amber-400"}`}>Fathom: {u.id_webhook_fathom ? "webhook registrado" : "API key sin webhook (revisa o edita)"}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select value={u.rol} onChange={(e) => updateRoleUser(u.id, e.target.value)} className="rounded bg-surface-600 border border-surface-500 px-2 py-1 text-xs text-white">
                        {rolesParaSelect.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                      </select>
                      <button type="button" onClick={() => openEditUser(u)} className="p-1.5 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-accent-cyan"><Pencil className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDeleteUser(u.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400"><X className="w-4 h-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Contexto de empresa (global) ── */}
        {systemConfigLoaded && puedeCriterios && (
          <section className="rounded-xl border border-surface-500 bg-surface-800/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-accent-blue" />
                <h2 className="text-sm font-semibold text-white">Contexto de empresa</h2>
                <HelpTooltip titulo="Contexto de empresa" contenido="Describe qué hace tu empresa para que la IA tenga contexto al evaluar llamadas, citas y chats. Este prompt aplica a los 3 canales como contexto base." comoProbar="Escribe una descripción de tu empresa, guarda, y la IA la usará como referencia al analizar cualquier interacción." />
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-3 leading-relaxed">Describe qué hace tu empresa. La IA usará este contexto al analizar todos los canales (chats, llamadas y citas).</p>
            <textarea value={promptEmpresa} onChange={(e) => setPromptEmpresa(e.target.value)} className="w-full rounded-lg bg-surface-700/80 border border-surface-500 p-3 text-sm text-white placeholder-gray-500 min-h-[120px] focus:ring-2 focus:ring-accent-blue/50 transition-colors resize-y" placeholder="Qué hace la empresa, a quién le vende, qué productos/servicios ofrece..." />
          </section>
        )}

        {/* ── Criterios globales ── */}
        {criteriosLoaded && puedeCriterios && allCategoriasDisponibles.length > 0 && (
          <section className="rounded-xl border border-surface-500 bg-surface-800/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent-purple" />
                <h2 className="text-sm font-semibold text-white">Criterios globales de calificación</h2>
                <HelpTooltip titulo="Criterios Globales" contenido="Las categorías seleccionadas aquí aplican a todos los canales que no tengan criterios propios. Si un canal tiene criterios específicos, se usarán esos en lugar de los globales." comoProbar="Selecciona categorías globales, guarda, y verifica en Performance que se aplican a los canales sin criterios propios." />
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-3 leading-relaxed">Selecciona las categorías que consideras un lead calificado. Aplican a todos los canales sin criterios propios.</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {allCategoriasDisponibles.map((cat) => {
                const isSelected = criteriosSeleccionados.includes(cat);
                const customDef = categoriasCustom.find((c) => c.slug === cat);
                const displayLabel = customDef ? customDef.label : cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
                return (
                  <button key={cat} type="button" onClick={() => toggleCriterioGlobal(cat)} title={customDef?.descripcion}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${isSelected ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" : "bg-surface-700 text-gray-400 border-surface-500 hover:border-emerald-500/30 hover:text-gray-300"} ${customDef ? "ring-1 ring-accent-purple/30" : ""}`}>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {displayLabel}
                    {customDef && <Sparkles className="w-3 h-3 text-accent-purple/60" />}
                  </button>
                );
              })}
            </div>
            {categoriasCustom.length > 0 && (
              <div className="mb-3 space-y-1.5">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide font-medium mb-1.5">Criterios personalizados</p>
                {categoriasCustom.map((cat, idx) => (
                  <div key={cat.slug} className="flex items-center justify-between rounded-lg bg-surface-700/60 border border-accent-purple/20 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-accent-purple shrink-0" /><span className="text-xs font-medium text-white">{cat.label}</span><span className="text-[10px] text-gray-500">({cat.slug})</span></div>
                      {cat.descripcion && <p className="text-[11px] text-gray-400 mt-0.5 ml-[18px] line-clamp-2">{cat.descripcion}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button type="button" onClick={() => openEditCustom(idx)} className="p-1 rounded hover:bg-surface-600 text-gray-400 hover:text-accent-cyan"><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => handleDeleteCustom(idx)} className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={openCreateCustom} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-purple/20 text-accent-purple text-xs font-medium border border-accent-purple/30 hover:bg-accent-purple/30 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Agregar criterio
            </button>
          </section>
        )}

        {/* ── Canales Activos ── */}
        {canalesLoaded && puedeCriterios && (
          <section className="rounded-xl border border-surface-500 bg-surface-800/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-accent-cyan" />
                <h2 className="text-sm font-semibold text-white">Canales del Embudo IA</h2>
                <HelpTooltip
                  titulo="¿Qué son los Canales del Embudo IA?"
                  contenido={`Indica qué canales de comunicación usa tu equipo de ventas: Chats (WhatsApp), Llamadas (Twilio) y/o Citas (Fathom).\n\nLa IA del embudo solo analizará y calculará métricas de los canales que marques como activos. Desactivar un canal que no usas evita ruido y métricas vacías en tus reportes.`}
                  comoProbar="Activa solo los canales que tu equipo realmente usa y pulsa 'Guardar canales'. Revisa el embudo/Performance y confirma que solo aparecen métricas de los canales activos."
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Indica qué canales de comunicación usa tu equipo de ventas. La IA del embudo solo analizará los canales activos.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {([
                { key: "chats" as const, label: "Chats (WhatsApp)", icon: MessageSquare, desc: "Conversaciones de WhatsApp y chat" },
                { key: "llamadas" as const, label: "Llamadas (Twilio)", icon: Phone, desc: "Llamadas telefónicas grabadas" },
                { key: "videollamadas" as const, label: "Citas (Fathom)", icon: Video, desc: "Citas con transcripción" },
              ]).map(({ key, label, icon: Icon, desc }) => (
                <button key={key} type="button" onClick={() => toggleCanal(key)}
                  className={`flex flex-col items-start gap-2 p-3 rounded-lg border text-left transition-all ${canales[key] ? "bg-accent-cyan/10 border-accent-cyan/50 text-white" : "bg-surface-700 border-surface-500 text-gray-400 hover:border-accent-cyan/30"}`}>
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${canales[key] ? "text-accent-cyan" : "text-gray-500"}`} />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <span className="text-xs text-gray-500">{desc}</span>
                  {canales[key] && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-accent-cyan"><CheckCircle2 className="w-3 h-3" /> Activo</span>}
                </button>
              ))}
            </div>
            <button type="button" onClick={handleSaveCanales} disabled={canalesSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-cyan text-black text-sm font-semibold hover:bg-accent-cyan/90 disabled:opacity-50 transition-colors">
              {canalesSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Guardar canales
            </button>
          </section>
        )}

        {/* ── Secciones por canal ── */}
        {criteriosLoaded && systemConfigLoaded && puedeCriterios && CANAL_CONFIG.filter((cfg) => canales[cfg.id]).map((cfg) => {
          const Icon = cfg.icon;
          const isExpanded = expandedCanal === cfg.id;
          const canalCalifica = califica[cfg.id];
          const criteriosCount = (criteriosCanales[cfg.id] ?? []).length;
          const etapasCount = getEtapasForCanal(cfg.id).length;
          return (
            <section key={cfg.id} className={`rounded-xl border ${cfg.borderColor} ${cfg.bgColor} overflow-hidden`}>
              <button type="button" onClick={() => setExpandedCanal(isExpanded ? null : cfg.id)} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${cfg.bgColor} border ${cfg.borderColor}`}><Icon className={`w-5 h-5 ${cfg.color}`} /></div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">{cfg.label}</h2>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${canalCalifica ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-surface-600 text-gray-500 border border-surface-500"}`}>{canalCalifica ? "Califica" : "No califica"}</span>
                      {criteriosCount > 0 && <span className="text-[10px] text-gray-500">{criteriosCount} criterio{criteriosCount !== 1 ? "s" : ""}</span>}
                      {etapasCount > 0 && <span className="text-[10px] text-gray-500">{etapasCount} etapa{etapasCount !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <HelpTooltip titulo={cfg.helpTitulo} contenido={cfg.helpContenido} comoProbar={cfg.helpProbar} />
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </div>
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 space-y-5 border-t border-surface-500/50">
                  <div className="flex items-start gap-3 pt-4">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-white">Usar para calificación</label>
                      <p className="text-xs text-gray-500 mt-0.5">{cfg.id === "llamadas" ? "Las llamadas generan resumen pero no calificación directa por defecto." : `Cuando está activo, la IA califica automáticamente las interacciones de ${cfg.label.toLowerCase()}.`}</p>
                    </div>
                    <button type="button" onClick={() => setCalifica((prev) => ({ ...prev, [cfg.id]: !prev[cfg.id] }))} className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${canalCalifica ? "bg-accent-green" : "bg-surface-500"}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${canalCalifica ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-gray-300">{cfg.promptLabel}</label>
                      <HelpTooltip titulo={cfg.promptLabel} contenido={cfg.id === "llamadas" ? "Instrucciones para que la IA genere el resumen de cada llamada. Este prompt NO se usa para calificar — solo para resumir el contenido." : cfg.id === "chats" ? "Instrucciones para que la IA determine si un chat está calificado o no. Complementa las categorías de calificación." : "Rúbrica/criterios para que la IA evalúe la calidad de la cita (puntaje, aspectos a revisar)."} comoProbar="Escribe tus instrucciones, guarda, y verifica que la IA las aplica en el próximo análisis." />
                    </div>
                    {cfg.promptNote && (
                      <div className="flex items-start gap-2 rounded-lg p-2 bg-accent-amber/10 border border-accent-amber/20">
                        <AlertTriangle className="w-3.5 h-3.5 text-accent-amber shrink-0 mt-0.5" />
                        <p className="text-[11px] text-accent-amber">{cfg.promptNote}</p>
                      </div>
                    )}
                    <textarea value={getPromptForCanal(cfg.id)} onChange={(e) => setPromptForCanal(cfg.id, e.target.value)} placeholder={cfg.promptPlaceholder} rows={4} className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-accent-cyan/40 resize-y" />
                  </div>
                  {allCategoriasDisponibles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-gray-300">Criterios de calificación</label>
                        <HelpTooltip titulo={cfg.criteriosHelp.titulo} contenido={cfg.criteriosHelp.contenido} comoProbar={cfg.criteriosHelp.probar} />
                      </div>
                      <p className="text-[11px] text-gray-500">Categorías específicas para {cfg.label.toLowerCase()}. Dejar vacío = se usarán los criterios globales.</p>
                      {renderCriteriosSelector(cfg.id)}
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-3.5 h-3.5 text-gray-400" />
                      <label className="text-xs font-medium text-gray-300">Etapas del embudo</label>
                      <HelpTooltip titulo={`Etapas del embudo — ${cfg.label}`} contenido={`Etapas personalizadas que aplican solo a ${cfg.label.toLowerCase()}. La IA puede clasificar un lead en estas etapas después de analizar una interacción de este canal.`} comoProbar="Crea una etapa, describe cuándo aplica, guarda, y verifica que la IA la usa al clasificar interacciones de este canal." />
                    </div>
                    {renderEtapasCanal(cfg.id)}
                  </div>
                </div>
              )}
            </section>
          );
        })}

        {/* ── Guardar todo ── */}
        {puedeCriterios && (criteriosLoaded || systemConfigLoaded) && (
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSaveAll} disabled={criteriosSaving || systemSaving} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-cyan text-black text-sm font-semibold hover:bg-accent-cyan/90 disabled:opacity-50 transition-colors">
              {(criteriosSaving || systemSaving) ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Guardar configuración
            </button>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalUser(null)} aria-hidden />
          <div className="relative w-full max-w-md rounded-xl bg-surface-800 border border-surface-500 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-500">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">{editingUser ? <><Pencil className="w-4 h-4 text-accent-cyan" /> Editar usuario</> : <><UserPlus className="w-4 h-4 text-accent-cyan" /> Añadir usuario</>}</h3>
              <button type="button" onClick={() => setModalUser(null)} className="p-1.5 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form className="p-4 space-y-4" onSubmit={handleSubmitUser}>
              {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
              <div><label className="block text-xs text-gray-400 mb-1">Nombre</label><input type="text" value={formUser.name} onChange={(e) => setFormUser((f) => ({ ...f, name: e.target.value }))} placeholder="Nombre completo" className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-accent-cyan/40" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Email</label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" /><input type="email" required={!editingUser} value={formUser.email} onChange={(e) => setFormUser((f) => ({ ...f, email: e.target.value }))} placeholder="usuario@empresa.com" disabled={!!editingUser} className="w-full rounded-lg bg-surface-700 border border-surface-500 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-accent-cyan/40 disabled:opacity-50" /></div></div>
              {!editingUser && <p className="text-xs text-gray-500">El usuario iniciará sesión con Google o con un código enviado a su correo. No necesita contraseña.</p>}
              <div><label className="block text-xs text-gray-400 mb-1">API de Fathom (opcional)</label><input type="text" value={formUser.fathom} onChange={(e) => setFormUser((f) => ({ ...f, fathom: e.target.value }))} placeholder="Clave API Fathom" className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-accent-cyan/40" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Rol</label><select value={formUser.rol} onChange={(e) => setFormUser((f) => ({ ...f, rol: e.target.value }))} className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-accent-cyan/40">{rolesParaSelect.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></div>
              <div><label className="block text-xs text-gray-400 mb-1">Tipo de usuario</label><select value={formUser.tipo_usuario} onChange={(e) => setFormUser((f) => ({ ...f, tipo_usuario: e.target.value as TipoUsuario }))} className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-accent-cyan/40"><option value="analista">Analista (ve todo el dashboard)</option><option value="enfoque">Enfoque (kiosko fullscreen, solo órdenes)</option></select>{formUser.tipo_usuario === "enfoque" && <p className="text-[11px] text-accent-purple mt-1">Este usuario solo verá el modo enfoque en pantalla completa al iniciar sesión.</p>}</div>
              <div className="flex gap-2 pt-2"><button type="button" onClick={() => setModalUser(null)} className="flex-1 px-3 py-2 rounded-lg bg-surface-600 text-gray-300 text-sm font-medium hover:bg-surface-500">Cancelar</button><button type="submit" disabled={saving} className="flex-1 px-3 py-2 rounded-lg bg-accent-cyan text-black text-sm font-semibold hover:bg-accent-cyan/90 disabled:opacity-50">{saving ? "Guardando..." : editingUser ? "Guardar" : "Crear usuario"}</button></div>
            </form>
          </div>
        </div>
      )}
      {modalRol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalRol(null)} aria-hidden />
          <div className="relative w-full max-w-lg rounded-xl bg-surface-800 border border-surface-500 shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-500 shrink-0">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">{editingRol ? <><Shield className="w-4 h-4 text-accent-cyan" /> Editar rol</> : <><Plus className="w-4 h-4 text-accent-cyan" /> Crear rol</>}</h3>
              <button type="button" onClick={() => setModalRol(null)} className="p-1.5 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form className="p-4 space-y-4 overflow-y-auto flex-1" onSubmit={handleSubmitRol}>
              <div><label className="block text-xs text-gray-400 mb-1">Nombre del rol</label><input type="text" value={formRol.nombre} onChange={(e) => setFormRol((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Asesor Senior" required className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-accent-cyan/40" /></div>
              {!editingRol && <div><label className="block text-xs text-gray-400 mb-1">ID (único, sin espacios)</label><input type="text" value={formRol.id} onChange={(e) => setFormRol((f) => ({ ...f, id: e.target.value.replace(/\s/g, "_") }))} placeholder="asesor_senior" required className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-accent-cyan/40" /></div>}
              <div><label className="block text-xs text-gray-400 mb-2">Permisos</label><div className="space-y-2 max-h-48 overflow-y-auto">{PERMISOS_DISPONIBLES.map((p) => <label key={p.id} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={formRol.permisos.includes(p.id)} onChange={() => togglePermisoRol(p.id)} className="rounded border-surface-500 bg-surface-700 text-accent-cyan focus:ring-accent-cyan/40" /><span className="text-sm text-gray-300">{p.label}</span></label>)}</div></div>
              <div className="flex gap-2 pt-2 shrink-0"><button type="button" onClick={() => setModalRol(null)} className="flex-1 px-3 py-2 rounded-lg bg-surface-600 text-gray-300 text-sm font-medium hover:bg-surface-500">Cancelar</button><button type="submit" disabled={saving} className="flex-1 px-3 py-2 rounded-lg bg-accent-cyan text-black text-sm font-semibold hover:bg-accent-cyan/90 disabled:opacity-50">{saving ? "Guardando..." : editingRol ? "Guardar" : "Crear rol"}</button></div>
            </form>
          </div>
        </div>
      )}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowBulkModal(false); setBulkResult(null); }} aria-hidden />
          <div className="relative w-full max-w-md rounded-xl bg-surface-800 border border-surface-500 shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-500">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Upload className="w-4 h-4 text-accent-cyan" /> Carga masiva de usuarios</h3>
              <button type="button" onClick={() => { setShowBulkModal(false); setBulkResult(null); }} className="p-1.5 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form className="p-4 space-y-4" onSubmit={handleBulkUpload}>
              <p className="text-xs text-gray-400">Sube un CSV con columnas: <code className="bg-surface-700 px-1 rounded">nombre, email, rol, fathom_api_key</code>.<br />Máximo 100 usuarios por lote. Los usuarios entran con Google o código por correo.</p>
              <a href="/api/data/usuarios/template" download className="flex items-center gap-1.5 text-xs text-accent-cyan hover:underline"><Download className="w-3.5 h-3.5" /> Descargar plantilla CSV</a>
              <div><label className="block text-xs text-gray-400 mb-1">Archivo CSV</label><input ref={bulkFileRef} type="file" accept=".csv,text/csv" onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)} className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-accent-cyan/20 file:text-accent-cyan hover:file:bg-accent-cyan/30" /></div>
              {bulkResult && (
                <div className="rounded-lg border border-surface-500 bg-surface-700/60 p-3 space-y-2 text-xs">
                  <p className="text-accent-green font-medium">{bulkResult.creados} usuario{bulkResult.creados !== 1 ? "s" : ""} creado{bulkResult.creados !== 1 ? "s" : ""}</p>
                  {bulkResult.errores.length > 0 && <div><p className="text-red-400 font-medium mb-1">{bulkResult.errores.length} error{bulkResult.errores.length !== 1 ? "es" : ""}:</p><ul className="space-y-1 max-h-32 overflow-y-auto">{bulkResult.errores.map((err, i) => <li key={i} className="text-gray-400"><span className="text-gray-300">{err.email}</span>: {err.error}</li>)}</ul></div>}
                </div>
              )}
              <div className="flex gap-2 pt-1"><button type="button" onClick={() => { setShowBulkModal(false); setBulkResult(null); }} className="flex-1 px-3 py-2 rounded-lg bg-surface-600 text-gray-300 text-sm font-medium hover:bg-surface-500">Cerrar</button><button type="submit" disabled={bulkLoading || !bulkFile} className="flex-1 px-3 py-2 rounded-lg bg-accent-cyan text-black text-sm font-semibold hover:bg-accent-cyan/90 disabled:opacity-50 flex items-center justify-center gap-2">{bulkLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : "Subir CSV"}</button></div>
            </form>
          </div>
        </div>
      )}
      {modalCustom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalCustom(null)} aria-hidden />
          <div className="relative w-full max-w-md rounded-xl bg-surface-800 border border-surface-500 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-500">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-accent-purple" />{modalCustom === "edit" ? "Editar criterio" : "Agregar criterio personalizado"}</h3>
              <button type="button" onClick={() => setModalCustom(null)} className="p-1.5 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div><label className="block text-xs text-gray-400 mb-1">Nombre del criterio</label><input type="text" value={formCustom.label} onChange={(e) => setFormCustom((f) => ({ ...f, label: e.target.value }))} placeholder="Ej: Interesado en compra" className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-accent-purple/40" />{formCustom.label.trim() && <p className="text-[10px] text-gray-500 mt-1">Slug: <code className="bg-surface-700 px-1 rounded">{slugify(formCustom.label)}</code></p>}</div>
              <div><label className="block text-xs text-gray-400 mb-1">Explicación (qué significa este criterio)</label><textarea value={formCustom.descripcion} onChange={(e) => setFormCustom((f) => ({ ...f, descripcion: e.target.value }))} placeholder="Describe cuándo un lead debería recibir esta categoría..." rows={3} className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-accent-purple/40 resize-none" /></div>
              <div className="flex gap-2 pt-1"><button type="button" onClick={() => setModalCustom(null)} className="flex-1 px-3 py-2 rounded-lg bg-surface-600 text-gray-300 text-sm font-medium hover:bg-surface-500">Cancelar</button><button type="button" onClick={handleSubmitCustom} disabled={!formCustom.label.trim()} className="flex-1 px-3 py-2 rounded-lg bg-accent-purple text-white text-sm font-semibold hover:bg-accent-purple/90 disabled:opacity-50">{modalCustom === "edit" ? "Guardar" : "Agregar"}</button></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
