"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/hooks/useSession";
import PageHeader from "@/components/dashboard/PageHeader";
import HelpTooltip from "@/components/dashboard/HelpTooltip";
import { LogIn, Users, Clock, Filter, MousePointerClick, Eye, Activity } from "lucide-react";

interface AccesoRow {
  id: number;
  id_cuenta: number | null;
  nombre_cuenta: string | null;
  email: string;
  nombre: string | null;
  ip: string | null;
  created_at: string;
}

interface ResumenRow {
  email: string;
  nombre: string | null;
  id_cuenta: number | null;
  nombre_cuenta: string | null;
  total: number;
  ultimo_acceso: string;
}

interface EventoRow {
  id: number;
  id_cuenta: number | null;
  nombre_cuenta: string | null;
  email: string;
  tipo: "page_view" | "click";
  pagina: string | null;
  detalle: string | null;
  created_at: string;
}

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tiempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

/** /dashboard → Panel ejecutivo, etc. (nombre legible de la página) */
const NOMBRES_PAGINAS: Record<string, string> = {
  "/dashboard": "Panel ejecutivo",
  "/performance": "Rendimiento",
  "/acquisition": "Adquisición & Ads",
  "/comparaciones": "Proyecciones",
  "/reportes": "Reportes",
  "/system": "Control del sistema",
  "/documentacion": "Documentación",
  "/configuracion": "Configuración",
  "/accesos": "Registro de accesos",
  "/bandeja": "Bandeja",
  "/asesor": "Vista asesor",
  "/comisiones": "Comisiones",
  "/enfoque": "Modo enfoque",
};

function nombrePagina(path: string | null): string {
  if (!path) return "—";
  const match = Object.entries(NOMBRES_PAGINAS).find(([p]) => path.includes(p));
  return match ? match[1] : path;
}

export default function AccesosPage() {
  const { session, loading: sessionLoading } = useSession();
  const isPlatformAdmin = session?.platformAdmin === true;
  const isSuperadmin = session?.rol === "superadmin";
  const puedeVer = isPlatformAdmin || isSuperadmin;

  const [accesos, setAccesos] = useState<AccesoRow[]>([]);
  const [resumen, setResumen] = useState<ResumenRow[]>([]);
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const [filterCuenta, setFilterCuenta] = useState<string>("");
  const [filterUsuario, setFilterUsuario] = useState<string>("");
  const [filterTipo, setFilterTipo] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ dias: String(dias) });
      if (filterCuenta) params.set("id_cuenta", filterCuenta);

      const actParams = new URLSearchParams(params);
      if (filterUsuario) actParams.set("email", filterUsuario);
      if (filterTipo) actParams.set("tipo", filterTipo);

      const [resAccesos, resActividad] = await Promise.all([
        fetch(`/api/data/accesos?${params}`),
        fetch(`/api/data/actividad?${actParams}`),
      ]);
      if (resAccesos.ok) {
        const data = await resAccesos.json();
        setAccesos(data.accesos ?? []);
        setResumen(data.resumen ?? []);
      }
      if (resActividad.ok) {
        const data = await resActividad.json();
        setEventos(data.eventos ?? []);
      }
    } catch {
      /* fail silently */
    }
    setLoading(false);
  }, [dias, filterCuenta, filterUsuario, filterTipo]);

  useEffect(() => {
    if (puedeVer) load();
  }, [puedeVer, load]);

  if (sessionLoading) {
    return (
      <>
        <PageHeader title="Registro de accesos" subtitle="Cargando..." />
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-gray-400 animate-pulse">Cargando...</p>
        </div>
      </>
    );
  }

  if (!puedeVer) {
    return (
      <>
        <PageHeader title="Accesos" subtitle="Registro de logins y actividad" />
        <div className="p-4">
          <p className="text-gray-400 text-sm">No tienes permiso para ver esta sección.</p>
        </div>
      </>
    );
  }

  const cuentasUnicas = Array.from(
    new Map(
      resumen
        .filter((r) => r.id_cuenta !== null)
        .map((r) => [r.id_cuenta, r.nombre_cuenta ?? `Cuenta ${r.id_cuenta}`]),
    ),
  );

  const usuariosUnicos = Array.from(
    new Map(resumen.map((r) => [r.email, r.nombre ?? r.email])),
  );

  return (
    <>
      <PageHeader
        title="Registro de accesos"
        subtitle="Quién entra, qué páginas visita y qué hace en el dashboard"
      />
      <div className="p-3 md:p-4 max-w-5xl mx-auto space-y-4 text-sm">
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={dias}
              onChange={(e) => setDias(Number(e.target.value))}
              className="rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white"
            >
              <option value={7}>Últimos 7 días</option>
              <option value={14}>Últimos 14 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={60}>Últimos 60 días</option>
              <option value={90}>Últimos 90 días</option>
            </select>
          </div>
          {isPlatformAdmin && cuentasUnicas.length > 1 && (
            <select
              value={filterCuenta}
              onChange={(e) => setFilterCuenta(e.target.value)}
              className="rounded-lg bg-surface-700 border border-surface-500 px-2 py-1.5 text-sm text-white"
            >
              <option value="">Todas las cuentas</option>
              {cuentasUnicas.map(([id, nombre]) => (
                <option key={id} value={String(id)}>
                  {nombre} (#{id})
                </option>
              ))}
            </select>
          )}
          <HelpTooltip
            titulo="Registro de accesos"
            contenido="Cada login exitoso (con Google o código), las páginas que visita cada usuario y los botones que toca. La actividad se conserva 90 días."
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <p className="text-gray-400 animate-pulse">Cargando accesos...</p>
          </div>
        ) : (
          <>
            {/* Resumen por usuario */}
            <div className="rounded-xl border border-surface-500 bg-surface-800/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-500 flex items-center gap-2">
                <Users className="w-4 h-4 text-accent-cyan" />
                <h3 className="font-semibold text-white">Resumen por usuario</h3>
                <span className="text-xs text-gray-500">
                  ({resumen.length} usuario{resumen.length !== 1 ? "s" : ""})
                </span>
              </div>
              {resumen.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">
                  Sin accesos en el período seleccionado.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 text-xs border-b border-surface-600">
                        <th className="px-4 py-2">Usuario</th>
                        {isPlatformAdmin && <th className="px-4 py-2">Cuenta</th>}
                        <th className="px-4 py-2 text-center">Logins</th>
                        <th className="px-4 py-2">Último acceso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.map((r) => (
                        <tr
                          key={`${r.email}-${r.id_cuenta}`}
                          className="border-b border-surface-700 hover:bg-surface-700/50"
                        >
                          <td className="px-4 py-2.5">
                            <p className="text-white font-medium">
                              {r.nombre ?? r.email}
                            </p>
                            {r.nombre && (
                              <p className="text-[11px] text-gray-500">{r.email}</p>
                            )}
                          </td>
                          {isPlatformAdmin && (
                            <td className="px-4 py-2.5 text-gray-400">
                              {r.nombre_cuenta ?? `#${r.id_cuenta}`}
                            </td>
                          )}
                          <td className="px-4 py-2.5 text-center">
                            <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-accent-cyan/15 text-accent-cyan text-xs font-semibold border border-accent-cyan/30">
                              {r.total}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-400">
                            <span title={formatFecha(r.ultimo_acceso)}>
                              {tiempoRelativo(r.ultimo_acceso)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Actividad: páginas y clics */}
            <div className="rounded-xl border border-surface-500 bg-surface-800/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-500 flex flex-wrap items-center gap-2">
                <Activity className="w-4 h-4 text-accent-purple" />
                <h3 className="font-semibold text-white">Actividad</h3>
                <span className="text-xs text-gray-500">
                  ({eventos.length} evento{eventos.length !== 1 ? "s" : ""})
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <select
                    value={filterUsuario}
                    onChange={(e) => setFilterUsuario(e.target.value)}
                    className="rounded-lg bg-surface-700 border border-surface-500 px-2 py-1 text-xs text-white"
                  >
                    <option value="">Todos los usuarios</option>
                    {usuariosUnicos.map(([email, nombre]) => (
                      <option key={email} value={email}>{nombre}</option>
                    ))}
                  </select>
                  <select
                    value={filterTipo}
                    onChange={(e) => setFilterTipo(e.target.value)}
                    className="rounded-lg bg-surface-700 border border-surface-500 px-2 py-1 text-xs text-white"
                  >
                    <option value="">Todo</option>
                    <option value="page_view">Páginas visitadas</option>
                    <option value="click">Clics</option>
                  </select>
                </div>
              </div>
              {eventos.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">
                  Sin actividad registrada en el período. La actividad se empieza a
                  registrar desde que esta versión está desplegada.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface-800">
                      <tr className="text-left text-gray-400 text-xs border-b border-surface-600">
                        <th className="px-4 py-2">Fecha</th>
                        <th className="px-4 py-2">Usuario</th>
                        <th className="px-4 py-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventos.map((e) => (
                        <tr
                          key={e.id}
                          className="border-b border-surface-700 hover:bg-surface-700/50"
                        >
                          <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                            <span title={formatFecha(e.created_at)}>
                              {tiempoRelativo(e.created_at)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-white whitespace-nowrap">{e.email}</td>
                          <td className="px-4 py-2">
                            {e.tipo === "page_view" ? (
                              <span className="text-gray-300">
                                <Eye className="w-3.5 h-3.5 inline-block mr-1.5 text-accent-blue" />
                                Entró a <span className="text-white font-medium">{nombrePagina(e.pagina)}</span>
                              </span>
                            ) : (
                              <span className="text-gray-300">
                                <MousePointerClick className="w-3.5 h-3.5 inline-block mr-1.5 text-accent-amber" />
                                Clic en <span className="text-white font-medium">«{e.detalle ?? "(sin texto)"}»</span>
                                <span className="text-gray-500 text-xs ml-1.5">en {nombrePagina(e.pagina)}</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Historial detallado de logins */}
            <div className="rounded-xl border border-surface-500 bg-surface-800/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-500 flex items-center gap-2">
                <LogIn className="w-4 h-4 text-accent-green" />
                <h3 className="font-semibold text-white">Historial de logins</h3>
                <span className="text-xs text-gray-500">
                  ({accesos.length} registro{accesos.length !== 1 ? "s" : ""})
                </span>
              </div>
              {accesos.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">
                  Sin accesos registrados.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 text-xs border-b border-surface-600">
                        <th className="px-4 py-2">Fecha</th>
                        <th className="px-4 py-2">Usuario</th>
                        {isPlatformAdmin && <th className="px-4 py-2">Cuenta</th>}
                        <th className="px-4 py-2">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accesos.map((a) => (
                        <tr
                          key={a.id}
                          className="border-b border-surface-700 hover:bg-surface-700/50"
                        >
                          <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                            <Clock className="w-3 h-3 inline-block mr-1 opacity-50" />
                            {formatFecha(a.created_at)}
                          </td>
                          <td className="px-4 py-2">
                            <span className="text-white">
                              {a.nombre ?? a.email}
                            </span>
                            {a.nombre && (
                              <span className="text-[11px] text-gray-500 ml-1.5">
                                {a.email}
                              </span>
                            )}
                          </td>
                          {isPlatformAdmin && (
                            <td className="px-4 py-2 text-gray-400">
                              {a.nombre_cuenta ?? `#${a.id_cuenta}`}
                            </td>
                          )}
                          <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                            {a.ip ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
