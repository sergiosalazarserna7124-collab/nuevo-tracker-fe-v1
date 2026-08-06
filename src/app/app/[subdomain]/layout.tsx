"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LocaleProvider, useT } from "@/contexts/LocaleContext";
import type { Locale } from "@/lib/i18n";
import {
  LayoutDashboard,
  BarChart3,
  UserCheck,
  TrendingUp,
  Menu,
  X,
  Sparkles,
  UserCog,
  Target,
  LogOut,
  BookOpen,
  Inbox,
  Eye,
  EyeOff,
  ChevronDown,
  BadgeDollarSign,
  Building2,
  Check,
  GitCompareArrows,
  UserPlus,
  Activity,
  LogIn,
  Route,
} from "lucide-react";
import clsx from "clsx";
import InsightsChat from "@/components/dashboard/InsightsChat";
import ReportButton from "@/components/dashboard/ReportButton";
import { UserFilterProvider, useUserFilter } from "@/contexts/UserFilterContext";
import { LayoutGrid } from "lucide-react";
import { puedeVerRuta, NAV_PERMISOS } from "@/lib/permisos";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "leadmaster.com.co";

interface AccountItem { id_cuenta: number; nombre_cuenta: string; subdominio: string }

function AccountSwitcher({ currentSubdominio }: { currentSubdominio: string }) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/data/mis-cuentas")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.accounts?.length > 1) setAccounts(d.accounts); })
      .catch(() => {});
  }, []);

  if (accounts.length <= 1) return null;

  const current = accounts.find((a) => a.subdominio === currentSubdominio);

  const switchTo = async (acc: AccountItem) => {
    if (acc.subdominio === currentSubdominio) { setOpen(false); return; }
    setSwitching(acc.subdominio);
    setOpen(false);
    const isLocal = window.location.hostname === "localhost";
    const protocol = window.location.protocol;
    const port = window.location.port ? `:${window.location.port}` : "";
    const target = isLocal
      ? `${protocol}//${acc.subdominio}.localhost${port}/dashboard`
      : `${protocol}//${acc.subdominio}.${ROOT_DOMAIN}/dashboard`;
    // Validar que el subdominio es legítimo para el usuario actual
    const res = await fetch("/api/auth/switch-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subdominio: acc.subdominio }),
    });
    if (!res.ok) { setSwitching(null); return; }
    // El middleware detectará que el JWT tiene otro subdominio y redirigirá al login.
    // Guardamos el subdominio destino en sessionStorage para pre-seleccionarlo en login.
    sessionStorage.setItem("lm_switch_subdominio", acc.subdominio);
    window.location.href = target;
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-gray-300 hover:bg-surface-700 border border-surface-500/60 transition-all"
      >
        <Building2 className="w-4 h-4 shrink-0 text-accent-cyan" />
        <span className="flex-1 text-left truncate text-xs">{current?.nombre_cuenta ?? currentSubdominio}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl bg-surface-800 border border-surface-500 shadow-2xl overflow-hidden z-50">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider px-3 pt-2 pb-1">Cambiar cuenta</p>
          {accounts.map((acc) => (
            <button
              key={acc.id_cuenta}
              type="button"
              onClick={() => void switchTo(acc)}
              disabled={switching === acc.subdominio}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-700 transition-colors"
            >
              <Building2 className="w-4 h-4 shrink-0 text-gray-500" />
              <span className="flex-1 truncate text-xs text-gray-300">{acc.nombre_cuenta}</span>
              {acc.subdominio === currentSubdominio && <Check className="w-3.5 h-3.5 text-accent-cyan shrink-0" />}
              {switching === acc.subdominio && <span className="w-3.5 h-3.5 border border-accent-cyan border-t-transparent rounded-full animate-spin shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type NavKey = "dashboard" | "performance" | "asesor" | "comisiones" | "bandeja" | "adquisicion" | "comparaciones" | "sistema" | "documentacion" | "configuracion" | "reportes" | "sesiones" | "tablero-enfoque" | "asignacion" | "accesos" | "leads";

const NAV_KEY_TO_PATH: Record<NavKey, string> = {
  dashboard: "/dashboard",
  leads: "/leads",
  performance: "/performance",
  asesor: "/asesor",
  comisiones: "/comisiones",
  bandeja: "/bandeja",
  adquisicion: "/acquisition",
  comparaciones: "/comparaciones",
  sistema: "/system",
  documentacion: "/documentacion",
  configuracion: "/configuracion",
  reportes: "/reportes",
  sesiones: "/sesiones",
  "tablero-enfoque": "/tablero-enfoque",
  asignacion: "/asignacion",
  accesos: "/accesos",
};

const NAV_ITEMS: { path: string; navKey: NavKey; label: string; icon: React.ElementType; beta?: boolean }[] = [
  { path: "/dashboard", navKey: "dashboard", label: "Panel ejecutivo", icon: LayoutDashboard },
  { path: "/leads", navKey: "leads", label: "Recorrido de leads", icon: Route },
  { path: "/performance", navKey: "performance", label: "Rendimiento", icon: BarChart3 },
  { path: "/asesor", navKey: "asesor", label: "Panel asesor", icon: UserCheck },
  { path: "/comisiones", navKey: "comisiones", label: "Comisiones", icon: BadgeDollarSign },
  { path: "/bandeja", navKey: "bandeja", label: "Bandeja", icon: Inbox },
  { path: "/acquisition", navKey: "adquisicion", label: "Adquisición & Ads", icon: TrendingUp },
  { path: "/comparaciones", navKey: "comparaciones", label: "Proyecciones", icon: GitCompareArrows },
  { path: "/sesiones", navKey: "sesiones", label: "Sesiones de enfoque", icon: Sparkles, beta: true },
  { path: "/tablero-enfoque", navKey: "tablero-enfoque", label: "Tablero de operación", icon: Activity, beta: true },
  { path: "/asignacion", navKey: "asignacion", label: "Asignación de leads", icon: UserPlus, beta: true },
  { path: "/reportes", navKey: "reportes", label: "Reportes", icon: TrendingUp },
  { path: "/system", navKey: "sistema", label: "Control del sistema", icon: Target },
  { path: "/documentacion", navKey: "documentacion", label: "Documentación", icon: BookOpen },
  { path: "/configuracion", navKey: "configuracion", label: "Configuración", icon: UserCog },
  { path: "/accesos", navKey: "accesos", label: "Registro de accesos", icon: LogIn },
];

function SoloMisDatosToggle() {
  const { soloMisDatos, toggleSoloMisDatos, canViewAll, sessionLoading, asesoresSeleccionados, toggleAsesor, asesores, session } = useUserFilter();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (sessionLoading || !canViewAll) return null;

  const label =
    asesoresSeleccionados.length === 0
      ? (session?.email ? `Yo (${session.email})` : "Seleccionar asesor")
      : asesoresSeleccionados.length === 1
        ? (asesores.find((a) => (a.email ?? a.id) === asesoresSeleccionados[0])?.name ?? asesoresSeleccionados[0])
        : `${asesoresSeleccionados.length} asesores`;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={toggleSoloMisDatos}
        className={clsx(
          "flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-medium transition-all border",
          soloMisDatos
            ? "bg-accent-amber/10 text-accent-amber border-accent-amber/30"
            : "bg-surface-700/60 text-gray-400 border-surface-500 hover:text-white hover:bg-surface-600"
        )}
      >
        {soloMisDatos ? <EyeOff className="w-4 h-4 shrink-0" /> : <Eye className="w-4 h-4 shrink-0" />}
        <span className="truncate">Solo data del asesor</span>
        <div
          className={clsx(
            "ml-auto w-8 h-[18px] rounded-full p-[2px] transition-colors shrink-0",
            soloMisDatos ? "bg-accent-amber" : "bg-surface-500"
          )}
        >
          <div
            className={clsx(
              "w-[14px] h-[14px] rounded-full bg-white transition-transform",
              soloMisDatos ? "translate-x-[14px]" : "translate-x-0"
            )}
          />
        </div>
      </button>
      {soloMisDatos && asesores.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-surface-700/60 border border-surface-500 text-xs text-left"
          >
            <span className="truncate flex-1">{label}</span>
            <ChevronDown className="w-4 h-4 shrink-0" />
          </button>
          {dropdownOpen && (
            <>
              <div className="absolute inset-0 -top-1 -bottom-1 z-10" onClick={() => setDropdownOpen(false)} aria-hidden />
              <ul className="absolute bottom-full left-0 right-0 mb-1 max-h-40 overflow-y-auto rounded-lg bg-surface-800 border border-surface-500 shadow-xl z-20 py-1">
                <li>
                  <button
                    type="button"
                    onClick={() => toggleAsesor(session?.email ?? "")}
                    className={clsx("w-full px-3 py-2 text-left text-xs flex items-center gap-2", (asesoresSeleccionados.length === 0 || asesoresSeleccionados.includes(session?.email ?? "")) ? "bg-accent-cyan/20 text-accent-cyan" : "text-gray-300 hover:bg-surface-600")}
                  >
                    <span className={clsx("w-3.5 h-3.5 rounded border shrink-0", (asesoresSeleccionados.length === 0 || asesoresSeleccionados.includes(session?.email ?? "")) ? "bg-accent-cyan border-accent-cyan" : "border-surface-400")} />
                    Yo ({session?.email})
                  </button>
                </li>
                {asesores.filter((a) => (a.email ?? a.id) !== session?.email).map((a) => {
                  const email = a.email ?? a.id;
                  const selected = asesoresSeleccionados.includes(email);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => toggleAsesor(email)}
                        className={clsx("w-full px-3 py-2 text-left text-xs flex items-center gap-2", selected ? "bg-accent-cyan/20 text-accent-cyan" : "text-gray-300 hover:bg-surface-600")}
                      >
                        <span className={clsx("w-3.5 h-3.5 rounded border shrink-0", selected ? "bg-accent-cyan border-accent-cyan" : "border-surface-400")} />
                        {a.name} {a.email && a.email !== a.name ? `(${a.email})` : ""}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NavFiltered({
  onLinkClick,
  dashboards = [],
  seccionesOcultas = [],
}: {
  onLinkClick?: () => void;
  dashboards?: { id: string; nombre: string; icono?: string }[];
  seccionesOcultas?: string[];
}) {
  const pathname = usePathname();
  const { session, sessionLoading } = useUserFilter();
  const t = useT();
  const permisos = session?.permisosArray ?? [];
  const navFiltered = useMemo(() => {
    if (sessionLoading) return NAV_ITEMS;
    return NAV_ITEMS.filter((item) => {
      if (seccionesOcultas.includes(item.navKey)) return false;
      return puedeVerRuta(permisos, item.path) || session?.rol === "superadmin";
    });
  }, [sessionLoading, permisos, session?.rol, seccionesOcultas]);

  const isActive = (path: string) => {
    if (path === "/dashboard") return pathname.endsWith("/dashboard");
    return pathname.includes(path);
  };

  const isDashboardActive = (dashboardId: string) => {
    return pathname.includes(`/dashboard/${dashboardId}`);
  };

  return (
    <>
      {navFiltered.map(({ path, navKey, label, icon: Icon, beta }) => (
        <React.Fragment key={`${path}-${navKey}`}>
          <Link
            href={path}
            onClick={onLinkClick}
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
              isActive(path)
                ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 shadow-glow-cyan"
                : "text-gray-400 hover:bg-surface-600 hover:text-white border border-transparent"
            )}
          >
            <Icon className="w-5 h-5 shrink-0" />
            {t.nav[navKey] ?? label}
            {beta && <span className="ml-auto text-[9px] uppercase tracking-wide font-semibold rounded px-1.5 py-0.5 bg-accent-purple/20 text-accent-purple border border-accent-purple/30">Beta</span>}
          </Link>
          {path === "/dashboard" && dashboards.length > 0 && (
            <div className="space-y-1 ml-3">
              {dashboards.map((dash) => (
                <Link
                  key={dash.id}
                  href={`/dashboard/${dash.id}`}
                  onClick={onLinkClick}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                    isDashboardActive(dash.id)
                      ? "bg-accent-amber/10 text-accent-amber border border-accent-amber/20"
                      : "text-gray-500 hover:bg-surface-600 hover:text-gray-300 border border-transparent"
                  )}
                >
                  {dash.icono && <span className="text-sm">{dash.icono}</span>}
                  <span className="truncate">{dash.nombre}</span>
                </Link>
              ))}
            </div>
          )}
        </React.Fragment>
      ))}
    </>
  );
}

function NavFilteredMobile({
  onClose,
  dashboards = [],
  seccionesOcultas = [],
}: {
  onClose: () => void;
  dashboards?: { id: string; nombre: string; icono?: string }[];
  seccionesOcultas?: string[];
}) {
  return <NavFiltered onLinkClick={onClose} dashboards={dashboards} seccionesOcultas={seccionesOcultas} />;
}

function PermissionGuard({ children, seccionesOcultas = [] }: { children: React.ReactNode; seccionesOcultas?: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, sessionLoading } = useUserFilter();

  useEffect(() => {
    if (sessionLoading || !session) return;
    const path = pathname.replace(/^\/app\/[^/]+/, "") || "/dashboard";

    if (seccionesOcultas.length > 0) {
      const hiddenPaths = seccionesOcultas
        .map((k) => NAV_KEY_TO_PATH[k as NavKey])
        .filter(Boolean);
      const isHidden = hiddenPaths.some((hp) => path === hp || (hp !== "/dashboard" && path.startsWith(hp + "/")));
      if (isHidden) { router.replace("/dashboard"); return; }
    }

    const basePath = Object.keys(NAV_PERMISOS).find((p) => path === p || (p !== "/dashboard" && path.startsWith(p + "/")));
    const perm = basePath ? NAV_PERMISOS[basePath as keyof typeof NAV_PERMISOS] : null;
    if (!perm) return;
    const puede = session.rol === "superadmin" || puedeVerRuta(session.permisosArray ?? [], basePath!);
    if (!puede) router.replace("/dashboard");
  }, [pathname, session, sessionLoading, router, seccionesOcultas]);

  return <>{children}</>;
}

function TenantLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const currentSubdominio = typeof params?.subdomain === "string" ? params.subdomain : "";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [locale, setLocale] = useState<Locale | null>(null);
  const [dashboardsNav, setDashboardsNav] = useState<{ id: string; nombre: string; icono?: string }[]>([]);
  const [seccionesOcultas, setSeccionesOcultas] = useState<string[]>([]);
  const [ghlTokenStatus, setGhlTokenStatus] = useState<"ok" | "invalid" | "unknown" | null>(null);
  const [ghlPendingCount, setGhlPendingCount] = useState(0);
  const [ghlLocationId, setGhlLocationId] = useState<string | null>(null);
  const [showGhlAlert, setShowGhlAlert] = useState(false);
  const [ghlNewToken, setGhlNewToken] = useState("");
  const [ghlValidating, setGhlValidating] = useState(false);
  const [ghlRetryResult, setGhlRetryResult] = useState<{ success: number; failed: number } | null>(null);
  const { session } = useUserFilter();

  const isFullscreen = pathname.endsWith("/enfoque");

  useEffect(() => {
    if (isFullscreen) return;
    fetch("/api/data/locale")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.idioma) setLocale(d.idioma as Locale);
        if (Array.isArray(d?.seccionesOcultas)) setSeccionesOcultas(d.seccionesOcultas);
      })
      .catch(() => { /* fallback */ });
  }, [isFullscreen]);

  useEffect(() => {
    if (isFullscreen) return;
    const perms = session?.permisosArray ?? [];
    const canConfigure = session?.rol === "superadmin" || perms.includes("configurar_sistema");
    if (!canConfigure) return;

    const controller = new AbortController();
    const tId = setTimeout(() => controller.abort(), 5000);

    fetch("/api/data/ghl-token", { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        clearTimeout(tId);
        if (d?.status) setGhlTokenStatus(d.status as "ok" | "invalid" | "unknown");
        if (d?.locationid) setGhlLocationId(d.locationid);
        if (typeof d?.pending_count === "number") setGhlPendingCount(d.pending_count);
      })
      .catch(() => { clearTimeout(tId); });
  }, [isFullscreen, session?.rol, JSON.stringify(session?.permisosArray)]);

  useEffect(() => {
    if (isFullscreen) return;
    fetch("/api/data/dashboards")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.dashboards) setDashboardsNav(d.dashboards); })
      .catch(() => {});
  }, [isFullscreen]);

  if (isFullscreen) return <>{children}</>;

  const isActive = (path: string) => {
    if (path === "/dashboard") return pathname.endsWith("/dashboard");
    return pathname.includes(path);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch { /* ignore */ }
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const protocol = window.location.protocol;
    const port = window.location.port ? `:${window.location.port}` : "";
    const loginUrl = isLocal
      ? `${protocol}//localhost${port}/login`
      : `${protocol}//${ROOT_DOMAIN}/login`;
    window.location.href = loginUrl;
  };

  const logoutButton = (
    <button type="button" onClick={handleLogout}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-red-500/10 hover:text-red-400 border border-transparent transition-all w-full">
      <LogOut className="w-5 h-5 shrink-0" />
      Cerrar sesión
    </button>
  );

  return (
    <LocaleProvider locale={locale}>
    <div className="min-h-screen flex flex-col md:flex-row bg-[var(--bg)]" style={{ background: "var(--bg)", backgroundImage: "var(--bg-gradient)" }}>

      {/* ⚠️ ALERTA GLOBAL: Token GHL inválido */}
      {ghlTokenStatus === "invalid" && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border-2 border-red-500 bg-surface-900 shadow-2xl overflow-hidden">
            {/* Header rojo */}
            <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
              <span className="text-3xl">🚨</span>
              <div>
                <h2 className="text-white text-lg font-bold">Conexión con GoHighLevel rota</h2>
                <p className="text-red-100 text-sm">El token de acceso a GHL es inválido. Las notas y tags no se están enviando.</p>
              </div>
            </div>
            {/* Impacto */}
            {ghlPendingCount > 0 && (
              <div className="mx-6 mt-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-200">
                ⚠️ <strong>{ghlPendingCount} notas/acciones</strong> están en cola esperando ser enviadas a GHL. Se enviarán automáticamente cuando actualices el token.
              </div>
            )}
            {/* Paso a paso */}
            <div className="px-6 py-4 space-y-4">
              <h3 className="text-white font-semibold text-sm uppercase tracking-wider">Cómo solucionarlo — paso a paso:</h3>
              <ol className="space-y-3 text-sm text-gray-300">
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-accent-cyan text-black text-xs font-bold flex items-center justify-center">1</span>
                  <span>Ve a <strong className="text-white">GoHighLevel</strong> → Esquina superior derecha → tu nombre → <strong className="text-white">Settings</strong></span>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-accent-cyan text-black text-xs font-bold flex items-center justify-center">2</span>
                  <span>Busca <strong className="text-white">API Keys</strong> en el menú lateral</span>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-accent-cyan text-black text-xs font-bold flex items-center justify-center">3</span>
                  <span>Crea un nuevo token con todos los permisos: <strong className="text-white">contacts.write, contacts.read, notes.write, tags.write</strong></span>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-accent-cyan text-black text-xs font-bold flex items-center justify-center">4</span>
                  <span>Verifica que el <strong className="text-white">Location ID</strong> de tu GHL sea: <code className="bg-surface-700 px-2 py-0.5 rounded text-accent-cyan font-mono text-xs">{ghlLocationId ?? "—"}</code>. Si no coincide, usa el Location ID correcto.</span>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-accent-cyan text-black text-xs font-bold flex items-center justify-center">5</span>
                  <span>Pega el nuevo token aquí abajo y haz clic en <strong className="text-white">Validar y guardar</strong></span>
                </li>
              </ol>
              {/* Input del nuevo token */}
              <div className="space-y-2">
                <label className="text-xs text-gray-400 font-medium">Nuevo token de GHL (empieza con pit-...)</label>
                <input
                  type="text"
                  value={ghlNewToken}
                  onChange={(e) => setGhlNewToken(e.target.value)}
                  placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full rounded-lg bg-surface-700 border border-surface-500 px-4 py-2.5 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:border-accent-cyan"
                />
              </div>
              {ghlRetryResult && (
                <div className="rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3 text-sm text-green-200">
                  ✅ Token válido. {ghlRetryResult.success} notas enviadas a GHL. {ghlRetryResult.failed > 0 ? `${ghlRetryResult.failed} fallaron y se reintentarán.` : ""}
                </div>
              )}
              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={!ghlNewToken.trim() || ghlValidating}
                  onClick={async () => {
                    setGhlValidating(true);
                    try {
                      const r = await fetch("/api/data/ghl-token", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ token: ghlNewToken.trim() }),
                      });
                      const d = await r.json() as { valid?: boolean; error?: string; success?: number; failed?: number; remaining?: number; total_pending?: number };
                      if (d.valid) {
                        setGhlTokenStatus("ok");
                        setGhlRetryResult({ success: d.success ?? 0, failed: d.failed ?? 0 });
                        const remaining = d.remaining ?? 0;
                        setGhlPendingCount(remaining);
                        if (remaining === 0) {
                          setTimeout(() => setShowGhlAlert(false), 2500);
                        }
                        // Si quedan pendientes, seguir reintentando en batches automáticamente
                        if (remaining > 0) {
                          let stillPending = remaining;
                          let totalSuccess = d.success ?? 0;
                          while (stillPending > 0) {
                            await new Promise(res => setTimeout(res, 1500));
                            const r2 = await fetch("/api/data/ghl-token", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ token: ghlNewToken.trim() }),
                            });
                            const d2 = await r2.json() as typeof d;
                            if (!d2.valid) break;
                            totalSuccess += d2.success ?? 0;
                            stillPending = d2.remaining ?? 0;
                            setGhlPendingCount(stillPending);
                            setGhlRetryResult({ success: totalSuccess, failed: d2.failed ?? 0 });
                          }
                          if (stillPending === 0) setTimeout(() => setShowGhlAlert(false), 2500);
                        }
                      } else {
                        alert(`Token inválido: ${d.error ?? "El token no fue aceptado por GHL. Verifica que tenga todos los permisos."}`);
                      }
                    } catch {
                      alert("Error de conexión. Verifica tu internet e inténtalo de nuevo.");
                    } finally {
                      setGhlValidating(false);
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-accent-cyan text-black text-sm font-bold hover:bg-accent-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {ghlValidating ? "Validando..." : "✅ Validar y guardar token"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <aside className="hidden md:flex md:flex-col w-56 bg-surface-800/95 backdrop-blur-sm border-r border-surface-500 shrink-0 shadow-[2px_0_24px_-8px_rgba(0,240,255,0.12)]">
        <div className="p-4 border-b border-surface-500/80">
          <Link href="/dashboard" className="flex items-center gap-2 font-display font-semibold text-lg text-white">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-purple to-accent-cyan flex items-center justify-center shadow-glow-cyan">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">LeadMaster</span>
          </Link>
        </div>
        <nav className="flex-1 p-2 overflow-y-auto">
          <NavFiltered dashboards={dashboardsNav} seccionesOcultas={seccionesOcultas} />
        </nav>
        <div className="p-2 space-y-1 border-t border-surface-500/80">
          {session?.platformAdmin && (
            <a
              href="/api/super/exit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition-all w-full"
            >
              <LayoutGrid className="w-5 h-5 shrink-0" />
              Volver al listado
            </a>
          )}
          <AccountSwitcher currentSubdominio={currentSubdominio} />
          <SoloMisDatosToggle />
          {logoutButton}
        </div>
      </aside>

      <header className="md:hidden flex items-center justify-between p-3 bg-surface-800 border-b border-surface-500">
        <button type="button" onClick={() => setSidebarOpen((o) => !o)} className="p-2 rounded-lg hover:bg-surface-600">
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <Link href="/dashboard" className="font-display font-semibold text-white">LeadMaster</Link>
        <div className="w-10" />
      </header>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}
      <aside className={clsx(
        "fixed top-0 left-0 z-50 h-full w-64 bg-surface-800/98 backdrop-blur-sm border-r border-surface-500 transform transition-transform md:hidden shadow-[4px_0_32px_-8px_rgba(0,0,0,0.5)] flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-surface-500/80 flex items-center justify-between">
          <span className="font-display font-semibold text-white">LeadMaster</span>
          <button type="button" onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-surface-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-2">
          <NavFilteredMobile onClose={() => setSidebarOpen(false)} dashboards={dashboardsNav} seccionesOcultas={seccionesOcultas} />
        </nav>
        <div className="p-2 space-y-1 border-t border-surface-500/80">
          {session?.platformAdmin && (
            <a
              href="/api/super/exit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition-all w-full"
              onClick={() => setSidebarOpen(false)}
            >
              <LayoutGrid className="w-5 h-5 shrink-0" />
              Volver al listado
            </a>
          )}
          <AccountSwitcher currentSubdominio={currentSubdominio} />
          <SoloMisDatosToggle />
          {logoutButton}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-24">
        <div className="flex-1 min-w-0 max-w-full">
          <PermissionGuard seccionesOcultas={seccionesOcultas}>{children}</PermissionGuard>
        </div>
      </main>

      {(pathname.endsWith("/dashboard") || pathname.includes("/asesor")) && (
        <button type="button" onClick={() => setInsightsOpen(true)}
          className="fixed bottom-20 right-4 md:bottom-24 md:right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-600/95 backdrop-blur border border-accent-cyan/30 text-sm text-white hover:bg-accent-cyan/20 hover:border-accent-cyan/50 shadow-glow-cyan transition-all"
          title="Habla con tus datos">
          <Sparkles className="w-5 h-5 text-accent-cyan" />
          <span className="hidden sm:inline">Habla con tus datos</span>
        </button>
      )}

      {insightsOpen && <InsightsChat onClose={() => setInsightsOpen(false)} />}
      <ReportButton />
    </div>
    </LocaleProvider>
  );
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserFilterProvider>
      <TenantLayoutInner>{children}</TenantLayoutInner>
    </UserFilterProvider>
  );
}
