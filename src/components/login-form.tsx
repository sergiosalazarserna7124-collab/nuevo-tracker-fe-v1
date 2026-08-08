"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import {
  requestLoginCodeAction,
  verifyLoginCodeAction,
  listMyAccountsAction,
} from "@/app/login/actions";
import type { AccountOption } from "@/app/login/actions";
import { Building2, Mail } from "lucide-react";

interface LoginFormProps {
  googleEnabled: boolean;
}

const RESEND_COOLDOWN_S = 30;

export default function LoginForm({ googleEnabled }: LoginFormProps) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null);

  const [accountLoading, setAccountLoading] = useState<number | null>(null);
  const [pendingSwitchSubdominio, setPendingSwitchSubdominio] = useState<string | null>(null);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "leadmaster.com.co";

  // Si viene de un account switch o redirigido desde un subdominio, auto-seleccionar la cuenta correcta
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Errores del flujo OAuth (Google): NextAuth redirige aquí con ?error=
    const oauthError = params.get("error");
    if (oauthError === "AccessDenied") {
      setError("Este correo no tiene acceso a LeadMaster. Pide a tu administrador que te agregue.");
    } else if (oauthError) {
      setError("No se pudo iniciar sesión con Google. Intenta de nuevo.");
    }

    // ?seleccionar=1: ya autenticado (Google) con varias cuentas → mostrar selector
    if (params.get("seleccionar") === "1") {
      listMyAccountsAction().then((res) => {
        if (res.accounts && res.accounts.length > 0) setAccounts(res.accounts);
      });
    }

    // sessionStorage: usado cuando el usuario cambia de cuenta desde el dashboard
    const pending = sessionStorage.getItem("lm_switch_subdominio");
    if (pending) {
      sessionStorage.removeItem("lm_switch_subdominio");
      setPendingSwitchSubdominio(pending);
      return;
    }
    // ?from=subdominio: añadido por el middleware cuando redirige desde un subdominio sin sesión
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

  // Cooldown para reenviar el código
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Panel único: todos los usuarios entran al MISMO dominio. El tenant se
  // resuelve desde la sesión, así que tras el login siempre vamos a /dashboard.
  const buildUrl = (_subdominio: string) => "/dashboard";

  const sendCode = async () => {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const result = await requestLoginCodeAction(email);
      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setStep("code");
      setCode("");
      setInfo(`Te enviamos un código a ${email.trim().toLowerCase()}. Revisa tu bandeja (y spam).`);
      setResendCooldown(RESEND_COOLDOWN_S);
      setLoading(false);
    } catch {
      setError("Ocurrió un error inesperado. Intenta de nuevo.");
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendCode();
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await verifyLoginCodeAction({
        email,
        code,
        subdominio_override: pendingSwitchSubdominio ?? undefined,
      });

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.accounts) {
        setInfo("");
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

  const handleGoogle = async () => {
    setError("");
    // Tras Google, /api/auth/post-login decide: dashboard directo o selector de cuenta
    await signIn("google", { callbackUrl: "/api/auth/post-login" });
  };

  // Selector de cuenta (email presente en varias cuentas)
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
                    // El usuario ya está autenticado; switch-account reescribe el JWT
                    const switchResp = await fetch("/api/auth/switch-account", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ subdominio: acc.subdominio }),
                    });
                    if (!switchResp.ok) {
                      setError("No se pudo cambiar de cuenta. Vuelve a iniciar sesión.");
                      setAccounts(null);
                      setAccountLoading(null);
                      setStep("email");
                      return;
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
              {step === "email"
                ? "Ingresa con Google o recibe un código en tu correo"
                : "Ingresa el código que te enviamos"}
            </p>
          </div>
        </div>

        <div className="px-8 pb-8">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {info && !error && (
            <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
              {info}
            </div>
          )}

          {step === "email" ? (
            <>
              {googleEnabled && (
                <>
                  <button
                    type="button"
                    onClick={handleGoogle}
                    className="w-full flex items-center justify-center gap-3 rounded-lg border border-slate-600 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:ring-2 focus:ring-blue-500/40 focus:outline-none transition-colors"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
                    </svg>
                    Continuar con Google
                  </button>
                  <div className="my-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-700" />
                    <span className="text-xs text-slate-500">o con tu correo</span>
                    <div className="h-px flex-1 bg-slate-700" />
                  </div>
                </>
              )}

              <form onSubmit={handleEmailSubmit} className="space-y-4">
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 focus:ring-2 focus:ring-blue-500/40 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  {loading ? "Enviando código..." : "Enviarme un código"}
                </button>
              </form>
            </>
          ) : (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Código de verificación
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  required
                  autoFocus
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-center text-2xl tracking-[0.5em] text-white placeholder-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 focus:ring-2 focus:ring-blue-500/40 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Verificando..." : "Ingresar"}
              </button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setError("");
                    setInfo("");
                  }}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  ← Cambiar correo
                </button>
                <button
                  type="button"
                  disabled={resendCooldown > 0 || loading}
                  onClick={sendCode}
                  className="text-blue-400 hover:text-blue-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                >
                  {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : "Reenviar código"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
