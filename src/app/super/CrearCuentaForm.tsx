"use client";

import { useState } from "react";
import { crearCuenta } from "./actions";

const ZONAS = [
  "America/Bogota",
  "America/Mexico_City",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "Europe/Madrid",
];

interface OkResult {
  ok: true;
  subdominio: string;
  loginUrl: string;
  email: string;
}

export default function CrearCuentaForm() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OkResult | null>(null);

  const [nombre, setNombre] = useState("");
  const [tokenGhl, setTokenGhl] = useState("");
  const [locationId, setLocationId] = useState("");
  const [zona, setZona] = useState("America/Bogota");
  const [adminEmail, setAdminEmail] = useState("");

  const reset = () => {
    setNombre(""); setTokenGhl(""); setLocationId("");
    setZona("America/Bogota"); setAdminEmail("");
    setError(""); setResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await crearCuenta({
        nombre_cuenta: nombre,
        token_ghl: tokenGhl,
        location_id: locationId,
        zona_horaria: zona,
        admin_email: adminEmail,
      });
      if ("error" in res && res.error) { setError(res.error); return; }
      setResult(res as OkResult);
    } catch {
      setError("Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
      >
        + Crear nueva cuenta
      </button>
    );
  }

  // Pantalla de éxito
  if (result) {
    return (
      <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <h3 className="text-lg font-bold text-emerald-400">✅ Cuenta creada</h3>
        <p className="mt-1 text-sm text-slate-300">
          Cuenta <strong>{result.subdominio}</strong> lista. Comparte estos datos con el cliente:
        </p>
        <div className="mt-4 space-y-3 text-sm">
          <Field label="Link de acceso del cliente" value={result.loginUrl} />
          <Field label="Email" value={result.email} />
        </div>
        <p className="mt-4 text-xs text-slate-400">
          El cliente entra con Google o con el código de verificación que se le envía al correo. No necesita contraseña.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => { reset(); }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Crear otra
          </button>
          <button
            onClick={() => { reset(); setOpen(false); }}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/60 p-6">
      <h3 className="text-lg font-bold text-white">Crear nueva cuenta</h3>
      {error && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Nombre de la cuenta *</label>
          <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Grupo Mexa" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Token de GHL</label>
          <input className={inputCls} value={tokenGhl} onChange={(e) => setTokenGhl(e.target.value)} placeholder="pit-..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Location ID (GHL)</label>
          <input className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="Ej: aBcD1234..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Zona horaria</label>
          <select className={inputCls} value={zona} onChange={(e) => setZona(e.target.value)}>
            {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Email del admin del cliente *</label>
          <input className={inputCls} type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@cliente.com" required />
          <p className="mt-1 text-xs text-slate-500">Se crea su usuario; entrará con Google o código por correo.</p>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
            {loading ? "Creando..." : "Crear cuenta"}
          </button>
          <button type="button" onClick={() => { reset(); setOpen(false); }} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-slate-800 px-3 py-1.5 font-mono text-xs text-white">{value}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          {copied ? "✓" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
