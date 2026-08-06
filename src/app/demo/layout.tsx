"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { DEMO_GENERATORS } from "@/lib/demo-data";
import {
  LayoutDashboard,
  BarChart3,
  UserCheck,
  TrendingUp,
  Menu,
  X,
  BadgeDollarSign,
  BarChart2,
  RefreshCw,
  GitCompareArrows,
  Inbox,
} from "lucide-react";
import clsx from "clsx";

const NAV_ITEMS = [
  { path: "/demo/dashboard", label: "Panel ejecutivo", icon: LayoutDashboard },
  { path: "/demo/performance/llamadas", label: "Llamadas", icon: BarChart3 },
  { path: "/demo/performance/videollamadas", label: "Citas", icon: BarChart2 },
  { path: "/demo/performance/chats", label: "Chats", icon: BadgeDollarSign },
  { path: "/demo/asesor", label: "Panel asesor", icon: UserCheck },
  { path: "/demo/acquisition", label: "Adquisición & Ads", icon: TrendingUp },
  { path: "/demo/comparaciones", label: "Comparaciones", icon: GitCompareArrows },
  { path: "/demo/comisiones", label: "Comisiones", icon: BadgeDollarSign },
  { path: "/demo/bandeja", label: "Bandeja", icon: Inbox },
];

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const patchedRef = useRef(false);

  useEffect(() => {
    if (patchedRef.current) return;
    patchedRef.current = true;

    const originalFetch = window.fetch;
    window.fetch = async function demoFetch(input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const path = url.split("?")[0];
      const gen = DEMO_GENERATORS[path];
      if (gen && (!init?.method || init.method === "GET" || init.method === "POST")) {
        const body = JSON.stringify(gen());
        return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (path.startsWith("/api/data/")) {
        return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return originalFetch(input, init);
    } as typeof fetch;

    return () => { window.fetch = originalFetch; };
  }, []);

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <LocaleProvider locale="es">
      <div
        className="min-h-screen flex flex-col md:flex-row"
        style={{ background: "var(--bg)", backgroundImage: "var(--bg-gradient)" }}
      >
        {/* Sidebar desktop */}
        <aside className="hidden md:flex md:flex-col w-56 bg-surface-800/95 backdrop-blur-sm border-r border-surface-500 shrink-0 shadow-[2px_0_24px_-8px_rgba(0,240,255,0.12)]">
          <div className="p-4 border-b border-surface-500/80">
            <Link href="/demo/dashboard" className="flex items-center gap-2 font-display font-semibold text-lg text-white">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-purple to-accent-cyan flex items-center justify-center shadow-glow-cyan">
                <LayoutDashboard className="w-5 h-5 text-white" />
              </div>
              <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">LeadMaster</span>
            </Link>
            <span className="mt-1 inline-block text-[10px] px-2 py-0.5 rounded bg-accent-amber/20 text-accent-amber border border-accent-amber/40 font-medium uppercase">
              Demo
            </span>
          </div>
          <nav className="flex-1 p-2 overflow-y-auto space-y-0.5">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                href={path}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive(path)
                    ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 shadow-glow-cyan"
                    : "text-gray-400 hover:bg-surface-600 hover:text-white border border-transparent"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="p-2 border-t border-surface-500/80 space-y-1">
            <button
              type="button"
              onClick={handleReload}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-accent-cyan/10 hover:text-accent-cyan border border-transparent transition-all w-full"
            >
              <RefreshCw className="w-5 h-5 shrink-0" />
              Nuevos datos
            </button>
            <Link
              href="/login"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-surface-600 hover:text-white border border-transparent transition-all"
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              Iniciar sesión real
            </Link>
          </div>
        </aside>

        {/* Header mobile */}
        <header className="md:hidden flex items-center justify-between p-3 bg-surface-800 border-b border-surface-500">
          <button type="button" onClick={() => setSidebarOpen((o) => !o)} className="p-2 rounded-lg hover:bg-surface-600">
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <span className="font-display font-semibold text-white flex items-center gap-2">
            LeadMaster
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-amber/20 text-accent-amber border border-accent-amber/40 font-medium uppercase">Demo</span>
          </span>
          <button type="button" onClick={handleReload} className="p-2 rounded-lg hover:bg-surface-600 text-accent-cyan" title="Nuevos datos">
            <RefreshCw className="w-5 h-5" />
          </button>
        </header>

        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
        )}
        <aside className={clsx(
          "fixed top-0 left-0 z-50 h-full w-64 bg-surface-800/98 backdrop-blur-sm border-r border-surface-500 transform transition-transform md:hidden shadow-xl flex flex-col",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="p-4 border-b border-surface-500/80 flex items-center justify-between">
            <span className="font-display font-semibold text-white">LeadMaster Demo</span>
            <button type="button" onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-surface-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 p-2 space-y-0.5">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                href={path}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isActive(path)
                    ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20"
                    : "text-gray-400 hover:bg-surface-600 hover:text-white border border-transparent"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="p-2 border-t border-surface-500/80">
            <button
              type="button"
              onClick={handleReload}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-accent-cyan/10 hover:text-accent-cyan border border-transparent transition-all w-full"
            >
              <RefreshCw className="w-5 h-5 shrink-0" />
              Nuevos datos falsos
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-8">
          {/* Banner demo */}
          <div className="sticky top-0 z-20 bg-accent-amber/10 border-b border-accent-amber/30 px-4 py-2 text-center text-xs text-accent-amber font-medium">
            🎭 Modo demo — datos ficticios · Recarga para generar nuevos ·{" "}
            <Link href="/login" className="underline hover:text-white">
              Acceder con cuenta real →
            </Link>
          </div>
          <div className="flex-1 min-w-0 max-w-full">{children}</div>
        </main>
      </div>
    </LocaleProvider>
  );
}
