"use client";

import { useState, useMemo } from "react";
import { LogIn, Search, Settings } from "lucide-react";
import { normalizeSubdominio } from "@/lib/subdomain";
import ConfigCuentaForm from "./ConfigCuentaForm";

type TenantRow = {
  id_cuenta: number;
  nombre_cuenta: string | null;
  subdominio: string;
  estado_cuenta: string | null;
};

export default function SuperTenantList({
  tenants,
}: {
  tenants: TenantRow[];
}) {
  const [search, setSearch] = useState("");
  const [configId, setConfigId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) => {
      const slug = normalizeSubdominio(t.subdominio) ?? t.subdominio;
      return (
        (t.nombre_cuenta?.toLowerCase().includes(q) ?? false) ||
        t.subdominio.toLowerCase().includes(q) ||
        slug.toLowerCase().includes(q)
      );
    });
  }, [tenants, search]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por nombre o subdominio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-900/80 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
        />
      </div>

      <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/60">
                <th className="px-4 py-3 font-medium text-slate-300">
                  Subdominio
                </th>
                <th className="px-4 py-3 font-medium text-slate-300">
                  Nombre cuenta
                </th>
                <th className="px-4 py-3 font-medium text-slate-300">
                  Estado
                </th>
                <th className="px-4 py-3 font-medium text-slate-300 w-48">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    {tenants.length === 0
                      ? "No hay cuentas registradas."
                      : "Ningún resultado con ese filtro."}
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const slug = normalizeSubdominio(t.subdominio) ?? t.subdominio;
                  return (
                    <tr
                      key={t.id_cuenta}
                      className="border-b border-slate-700/60 hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-cyan-400">
                        {slug}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {t.nombre_cuenta ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {t.estado_cuenta ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setConfigId(t.id_cuenta)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
                          >
                            <Settings className="h-3.5 w-3.5" />
                            Configurar
                          </button>
                          <a
                            href={`/api/super/enter?subdominio=${encodeURIComponent(slug)}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
                          >
                            <LogIn className="h-3.5 w-3.5" />
                            Iniciar
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Total: {filtered.length}
        {search.trim() ? ` de ${tenants.length} cuentas` : " cuentas"}
      </p>

      {configId !== null && (
        <ConfigCuentaForm idCuenta={configId} onClose={() => setConfigId(null)} />
      )}
    </div>
  );
}
