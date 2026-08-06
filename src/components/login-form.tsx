"use client";

import { useState, useEffect } from "react";
import { loginAction } from "@/app/login/actions";
import type { AccountOption } from "@/app/login/actions";
import { Building2 } from "lucide-react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null);

  const [accountLoading, setAccountLoading] = useState<number | null>(null);
  const [pendingSwitchSubdominio, setPendingSwitchSubdominio] = useState<string | null>(null);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "leadmaster.com.co";

  // Si viene de un account switch o redirigido desde un subdominio, auto-seleccionar la cuenta correcta
  useEffect(() => {
    // sessionStorage: usado cuando el usuario cambia de cuenta desde el dashboard
    const pending = sessionStorage.getItem("lm_switch_subdominio");
    if (pending) {
      sessionStorage.removeItem("lm_switch_subdominio");
      setPendingSwitchSubdominio(pending);
      return;
    }
    // ?from=subdominio: añadido por el middleware cuando redirige desde un subdominio sin sesión
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    if (from) {
      setPendingSwitchSubdominio(from);
      return;
    }
    // Entrada del cliente: login.leadmaster.com.co/{id-cuenta}
    // El middleware renderiza este login manteniendo /{slug} en la URL del navegador,
    // así que tomamos el slug del primer segmento del path.
    const seg = window.location.pathname.split("/").filter(Boolean);
    const RESERVED = ["login", "super", "demo", "dashboard", "app", "enfoque", "cambiar-password", "integraciones"];
    if (seg.length === 1 && !RESERVED.includes(seg[0])) {
      setPendingSwitchSubdominio(seg[0]);
    }
  }, []);

  // Panel único: todos los usuarios entran al MISMO dominio. El tenant se
  // resuelve desde la sesión (no desde el subdominio de la URL), así que tras
  // el login siempre vamos a /dashboard en el mismo host.
  const buildUrl = (_subdominio: string) => "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Si entró por /{id-cuenta}, escopamos el login a esa cuenta
      const result = await loginAction({
        email,
        password,
        subdominio_override: pendingSwitchSubdominio ?? undefined,
      });

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.platformAdmin) {
        window.location.href = "/super";
        return;
      }

      if ("accounts" in result && result.accounts) {
        // Si venimos de un switch, auto-seleccionar la cuenta destino
        if (pendingSwitchSubdominio) {
          const targetAcc = result.accounts.find((a) => a.subdominio === pendingSwitchSubdominio);
          if (targetAcc) {
            const switchResult = await loginAction({ email, password, subdominio_override: targetAcc.subdominio });
            if (!("error" in switchResult)) {
              window.location.href = buildUrl(targetAcc.subdominio);
              return;
            }
          }
        }
        setAccounts(result.accounts);
        setLoading(false);
        return;
      }

      if (result.subdominio) {
        window.location.href = buildUrl(result.subdominio);
      }
    } catch {
      setError("Ocurrió un error inesperado. Intenta de nuevo.");
      setLoading(false);
    }
  };

  // Account selector screen
  if (accounts) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 shadow-2xl overflow-hidden">
          <div className="p-8 pb-6 flex flex-col items-center gap-4">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">Selecciona tu cuenta</h1>
              <p className="text-sm text-slate-400 mt-1">
                Tienes acceso a {accounts.length} cuentas
              </p>
            </div>
          </div>
          <div className="px-8 pb-8 space-y-3">
            {accounts.map((acc) => (
              <button
                key={acc.id_cuenta}
                type="button"
                disabled={accountLoading !== null}
                onClick={async () => {
                  setAccountLoading(acc.id_cuenta);
                  try {
                    // Usar switch-account en lugar de re-autenticar con contraseña.
                    // El usuario ya está autenticado desde el primer signIn; re-verificar
                    // el password contra CADA cuenta falla si los hashes difieren entre cuentas.
                    const switchResp = await fetch("/api/auth/switch-account", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ subdominio: acc.subdominio }),
                    });
                    if (!switchResp.ok) {
                      // Fallback: si el switch falla (ej. sesión expirada), re-autenticar
                      const result = await loginAction({
                        email,
                        password,
                        subdominio_override: acc.subdominio,
                      });
                      if ("error" in result && result.error) {
                        setError(result.error);
                        setAccounts(null);
                        setAccountLoading(null);
                        return;
                      }
                    }
                    window.location.href = buildUrl(acc.subdominio);
                  } catch {
                    setError("Error al seleccionar la cuenta. Intenta de nuevo.");
                    setAccounts(null);
                    setAccountLoading(null);
                  }
                }}
                className="w-full flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-left hover:border-blue-500/50 hover:bg-slate-700 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
                  {accountLoading === acc.id_cuenta
                    ? <span className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    : <Building2 className="w-5 h-5 text-blue-400" />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">
                    {acc.nombre_cuenta ?? acc.subdominio}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{acc.subdominio}.{rootDomain}</p>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAccounts(null)}
              className="w-full mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              ← Volver al login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 shadow-2xl overflow-hidden">
        <div className="p-8 pb-6 flex flex-col items-center gap-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Iniciar Sesión</h1>
            <p className="text-sm text-slate-400 mt-1">
              Ingresa tus credenciales para continuar
            </p>
          </div>
        </div>

        <div className="px-8 pb-8">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 focus:ring-2 focus:ring-blue-500/40 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
