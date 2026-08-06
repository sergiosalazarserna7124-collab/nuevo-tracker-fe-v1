"use client";

import { useEffect, useState } from "react";
import { getCuentaConfig, configurarCuenta, actualizarUsuarioPrincipal } from "./actions";
import type { InfoComercial } from "@/lib/db/schema";

const ZONAS = [
  "America/Bogota", "America/Mexico_City", "America/Lima", "America/Santiago",
  "America/Argentina/Buenos_Aires", "America/New_York", "Europe/Madrid",
];

const SECCIONES: { key: string; label: string }[] = [
  { key: "dashboard", label: "Panel ejecutivo" },
  { key: "leads", label: "Recorrido de leads" },
  { key: "performance", label: "Rendimiento" },
  { key: "asesor", label: "Panel asesor" },
  { key: "comisiones", label: "Comisiones" },
  { key: "bandeja", label: "Bandeja" },
  { key: "adquisicion", label: "Adquisición & Ads" },
  { key: "comparaciones", label: "Proyecciones" },
  { key: "sesiones", label: "Sesiones de enfoque" },
  { key: "tablero-enfoque", label: "Tablero de operación" },
  { key: "asignacion", label: "Asignación de leads" },
  { key: "reportes", label: "Reportes" },
  { key: "sistema", label: "Control del sistema" },
  { key: "documentacion", label: "Documentación" },
  { key: "configuracion", label: "Configuración" },
  { key: "accesos", label: "Registro de accesos" },
];

const PRODUCTOS = ["GHL", "Ads", "LeadMaster", "Fathom"];

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none";

export default function ConfigCuentaForm({
  idCuenta,
  onClose,
}: {
  idCuenta: number;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [nombre, setNombre] = useState("");
  const [tokenGhl, setTokenGhl] = useState("");
  const [zona, setZona] = useState("America/Bogota");
  const [locationId, setLocationId] = useState("");
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [productos, setProductos] = useState<string[]>([]);
  const [precio, setPrecio] = useState<string>("");
  const [moneda, setMoneda] = useState("USD");
  const [pagaComision, setPagaComision] = useState(false);
  const [comisionPct, setComisionPct] = useState<string>("");
  const [notas, setNotas] = useState("");

  // Usuario principal
  const [usuarioId, setUsuarioId] = useState<number | null>(null);
  const [usuarioNombre, setUsuarioNombre] = useState("");
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const [usuarioPass, setUsuarioPass] = useState("");

  useEffect(() => {
    (async () => {
      const cfg = await getCuentaConfig(idCuenta);
      if (cfg) {
        setNombre(cfg.nombre_cuenta ?? "");
        setTokenGhl(cfg.token_ghl ?? "");
        setZona(cfg.zona_horaria_iana ?? "America/Bogota");
        setLocationId(cfg.locationid ?? "");
        const ui = cfg.configuracion_ui as { secciones_ocultas?: string[] } | null;
        setOcultas(ui?.secciones_ocultas ?? []);
        const ic = (cfg.info_comercial ?? {}) as InfoComercial;
        setProductos(ic.productos ?? []);
        setPrecio(ic.precio_mensual != null ? String(ic.precio_mensual) : "");
        setMoneda(ic.moneda ?? "USD");
        setPagaComision(!!ic.paga_comision);
        setComisionPct(ic.comision_pct != null ? String(ic.comision_pct) : "");
        setNotas(ic.notas ?? "");
        if (cfg.usuario) {
          setUsuarioId(cfg.usuario.id_evento);
          setUsuarioNombre(cfg.usuario.nombre ?? "");
          setUsuarioEmail(cfg.usuario.email ?? "");
        }
      }
      setLoading(false);
    })();
  }, [idCuenta]);

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const handleSave = async () => {
    setSaving(true); setError(""); setSaved(false);
    const info: InfoComercial = {
      productos,
      precio_mensual: precio ? Number(precio) : undefined,
      moneda,
      paga_comision: pagaComision,
      comision_pct: comisionPct ? Number(comisionPct) : undefined,
      notas: notas || undefined,
    };
    const res = await configurarCuenta({
      id_cuenta: idCuenta,
      nombre_cuenta: nombre,
      token_ghl: tokenGhl || null,
      zona_horaria_iana: zona || null,
      locationid: locationId || null,
      secciones_ocultas: ocultas,
      info_comercial: info,
    });
    if ("error" in res && res.error) { setSaving(false); setError(res.error); return; }

    // Guardar usuario principal (si existe)
    if (usuarioId != null) {
      const ru = await actualizarUsuarioPrincipal({
        id_cuenta: idCuenta,
        id_evento: usuarioId,
        nombre: usuarioNombre,
        email: usuarioEmail || undefined,
        password: usuarioPass || undefined,
      });
      if ("error" in ru && ru.error) { setSaving(false); setError(ru.error); return; }
      setUsuarioPass("");
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Configurar cuenta</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-slate-400">Cargando…</p>
        ) : (
          <div className="space-y-6">
            {/* Datos básicos */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-blue-400">Datos de la cuenta</h4>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre</label>
                <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Token de GHL</label>
                <input className={inputCls} value={tokenGhl} onChange={(e) => setTokenGhl(e.target.value)} placeholder="pit-..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Location ID (GHL)</label>
                  <input className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Zona horaria</label>
                  <select className={inputCls} value={zona} onChange={(e) => setZona(e.target.value)}>
                    {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* Usuario principal */}
            {usuarioId != null && (
              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-blue-400">Usuario principal (acceso del cliente)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Nombre</label>
                    <input className={inputCls} value={usuarioNombre} onChange={(e) => setUsuarioNombre(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Correo</label>
                    <input className={inputCls} type="email" value={usuarioEmail} onChange={(e) => setUsuarioEmail(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Contraseña (nueva)</label>
                  <input className={inputCls} type="text" value={usuarioPass} onChange={(e) => setUsuarioPass(e.target.value)} placeholder="Dejar vacío para no cambiarla" />
                  <p className="mt-1 text-xs text-slate-500">Si escribes una, reemplaza la contraseña actual del cliente.</p>
                </div>
              </section>
            )}

            {/* Ocultar secciones */}
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-blue-400">Secciones visibles para el cliente</h4>
              <p className="text-xs text-slate-500">Desmarca las que NO quieres que vea este cliente.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SECCIONES.map((s) => {
                  const visible = !ocultas.includes(s.key);
                  return (
                    <label key={s.key} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={() => setOcultas((prev) => toggle(prev, s.key))}
                      />
                      {s.label}
                    </label>
                  );
                })}
              </div>
            </section>

            {/* Info comercial */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-blue-400">Info comercial</h4>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Productos vendidos</label>
                <div className="flex flex-wrap gap-2">
                  {PRODUCTOS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProductos((prev) => toggle(prev, p))}
                      className={`rounded-lg border px-3 py-1.5 text-xs ${productos.includes(p) ? "border-blue-500 bg-blue-600/20 text-blue-300" : "border-slate-700 text-slate-400"}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Precio mensual</label>
                  <input className={inputCls} type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Moneda</label>
                  <select className={inputCls} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                    <option>USD</option><option>COP</option><option>MXN</option><option>EUR</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                  <input type="checkbox" checked={pagaComision} onChange={(e) => setPagaComision(e.target.checked)} />
                  Paga comisión por ventas
                </label>
                {pagaComision && (
                  <input className={`${inputCls} w-24`} type="number" value={comisionPct} onChange={(e) => setComisionPct(e.target.value)} placeholder="% " />
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Notas</label>
                <textarea className={inputCls} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
              </div>
            </section>

            {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</div>}
            {saved && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">✅ Guardado</div>}

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
              <button onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800">
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
