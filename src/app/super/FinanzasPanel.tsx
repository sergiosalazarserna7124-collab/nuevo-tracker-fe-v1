"use client";

import { useEffect, useState } from "react";
import { getFinanzasStatus, guardarFinanzasKeys } from "./actions";

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none";

export default function FinanzasPanel() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<{ stripe: string | null; mercury: string | null }>({ stripe: null, mercury: null });
  const [stripe, setStripe] = useState("");
  const [mercury, setMercury] = useState("");

  const refresh = async () => setStatus(await getFinanzasStatus());
  useEffect(() => { if (open) void refresh(); }, [open]);

  const handleSave = async () => {
    setSaving(true); setError(""); setSaved(false);
    const res = await guardarFinanzasKeys({ stripe: stripe || undefined, mercury: mercury || undefined });
    setSaving(false);
    if ("error" in res && res.error) { setError(res.error); return; }
    setStripe(""); setMercury("");
    setSaved(true);
    await refresh();
    setTimeout(() => setSaved(false), 2000);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-4 text-left hover:bg-slate-900"
      >
        <div>
          <div className="text-sm font-semibold text-white">💰 Finanzas (Stripe + Mercury)</div>
          <div className="text-xs text-slate-400">Conecta tus cuentas para ver ingresos y egresos</div>
        </div>
        <span className="text-slate-400">Configurar →</span>
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-slate-900/60 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">💰 Finanzas</h3>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">
            Stripe — API Key {status.stripe && <span className="text-emerald-400">· conectada ({status.stripe})</span>}
          </label>
          <input className={inputCls} type="password" value={stripe} onChange={(e) => setStripe(e.target.value)} placeholder={status.stripe ? "•••• (dejar vacío para no cambiar)" : "sk_live_..."} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">
            Mercury — API Token {status.mercury && <span className="text-emerald-400">· conectada ({status.mercury})</span>}
          </label>
          <input className={inputCls} type="password" value={mercury} onChange={(e) => setMercury(e.target.value)} placeholder={status.mercury ? "•••• (dejar vacío para no cambiar)" : "secret-token:..."} />
        </div>

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</div>}
        {saved && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">✅ Llaves guardadas</div>}

        <p className="text-xs text-slate-500">
          Las llaves se guardan de forma segura. El tablero de ingresos/egresos (saldos, cobros, transferencias) se activa en la siguiente fase con estas llaves.
        </p>

        <button onClick={handleSave} disabled={saving || (!stripe && !mercury)} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar llaves"}
        </button>
      </div>
    </div>
  );
}
