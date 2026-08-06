"use client";

import { useState, useMemo } from "react";
import { useApiData } from "@/hooks/useApiData";
import type {
  MapaTiemposResponse,
  MapaTiemposAsesor,
  MapaTiemposLeadTimeline,
} from "@/types";
import HelpTooltip from "./HelpTooltip";
import { Clock, User, Search, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import clsx from "clsx";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} h`;
  const dias = Math.round(seconds / 86400);
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SortKey = "asesor" | "t1" | "t2" | "t3" | "t4" | "t5";

const SORT_FIELD_MAP: Record<Exclude<SortKey, "asesor">, keyof MapaTiemposAsesor> = {
  t1: "t1_mediana_seconds",
  t2: "t2_mediana_seconds",
  t3: "t3_mediana_seconds",
  t4: "t4_mediana_seconds",
  t5: "t5_mediana_seconds",
};

const COLUMN_COLORS: Record<string, "cyan" | "purple" | "amber" | "emerald" | "rose"> = {
  t1: "cyan",
  t2: "purple",
  t3: "amber",
  t4: "emerald",
  t5: "rose",
};

export default function MapaTiempos({
  dateFrom,
  dateTo,
}: {
  dateFrom: string;
  dateTo: string;
}) {
  const [asesorFilter, setAsesorFilter] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("t1");
  const [sortAsc, setSortAsc] = useState(true);

  const { data, loading, error } = useApiData<MapaTiemposResponse>(
    "/api/data/mapa-tiempos",
    {
      desde: dateFrom,
      hasta: dateTo,
      asesor: asesorFilter || undefined,
      lead: leadId || undefined,
    },
    // Widget secundario: un 401 aquí NO debe redirigir/recargar todo el panel.
    { redirectOn401: false },
  );

  const asesores = data?.asesores ?? [];
  const leadTimeline = data?.lead_timeline ?? null;
  const totalLeads = data?.total_leads ?? 0;
  const stuck = data?.stuck ?? null;

  const maxByKey = useMemo(() => {
    const keys = ["t1", "t2", "t3", "t4", "t5"] as const;
    const result: Record<string, number> = {};
    for (const k of keys) {
      const field = `${k}_mediana_seconds` as keyof MapaTiemposAsesor;
      let max = 0;
      for (const a of asesores) {
        const v = a[field];
        if (typeof v === "number" && v > max) max = v;
      }
      result[k] = max || 1;
    }
    return result;
  }, [asesores]);

  const sortedAsesores = useMemo(() => {
    const arr = [...asesores];
    arr.sort((a, b) => {
      if (sortKey === "asesor") {
        return sortAsc
          ? a.asesor.localeCompare(b.asesor)
          : b.asesor.localeCompare(a.asesor);
      }
      const field = SORT_FIELD_MAP[sortKey];
      const va = (a[field] as number | null) ?? Infinity;
      const vb = (b[field] as number | null) ?? Infinity;
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [asesores, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (
      sortAsc ? (
        <ChevronUp className="w-3 h-3 inline ml-0.5" />
      ) : (
        <ChevronDown className="w-3 h-3 inline ml-0.5" />
      )
    ) : null;

  const handleLeadSearch = () => {
    const trimmed = leadSearch.trim();
    if (/^\d+$/.test(trimmed)) {
      setLeadId(trimmed);
    } else {
      setLeadId(null);
    }
  };

  const clearLeadSearch = () => {
    setLeadSearch("");
    setLeadId(null);
  };

  const uniqueAsesores = useMemo(() => {
    const names = asesores.map((a) => a.asesor);
    return [...new Set(names)].sort();
  }, [asesores]);

  const hasAnyT4T5 = asesores.some((a) => a.t4_n > 0 || a.t5_n > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          <Clock className="w-4 h-4" />
          Mapa de tiempos
          {!hasAnyT4T5 && (
            <span className="ml-1 px-1.5 py-0.5 text-[9px] font-semibold uppercase rounded bg-accent-cyan/20 text-accent-cyan tracking-wide">
              Beta
            </span>
          )}
          <HelpTooltip
            titulo="Mapa de tiempos"
            contenido={
              "Visualiza el tiempo que tarda cada asesor en avanzar los leads por el funnel.\n\n" +
              "T1 (Llegó el lead → Llamarlo): tiempo desde que el lead llega hasta la primera llamada.\n" +
              "T2 (Llamarlo → Agendar cita): tiempo desde la primera llamada hasta que se agenda una cita.\n" +
              "T3 (Agendar cita → Que asista): tiempo desde que se agenda hasta que el lead asiste a la cita.\n" +
              "T4 (Que asista → Que aparte): tiempo desde la asistencia hasta que el lead aparta.\n" +
              "T5 (Que aparte → Que compre): tiempo desde el apartado hasta el cierre de la venta.\n\n" +
              "Se muestra la mediana (valor central, robusto a outliers). La barra refleja el tamaño relativo entre asesores.\n\n" +
              "T4 y T5 se alimentan del webhook de cambio de etapa de GHL. Si aún no hay datos, la columna aparece vacía."
            }
            comoProbar="Selecciona un asesor del filtro para ver solo sus tiempos. Ingresa un ID de lead para ver su linea de tiempo individual con fechas exactas."
          />
        </h2>
        {!leadId && (
          <span className="text-xs text-gray-500">
            {totalLeads} leads totales
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Advisor filter */}
        <div className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-gray-500" />
          <select
            value={asesorFilter}
            onChange={(e) => setAsesorFilter(e.target.value)}
            className="bg-surface-700 border border-surface-500 rounded-md px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-accent-cyan/30"
          >
            <option value="">Todos los asesores</option>
            {uniqueAsesores.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Lead search */}
        <div className="flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="ID del lead"
            value={leadSearch}
            onChange={(e) => setLeadSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLeadSearch()}
            className="bg-surface-700 border border-surface-500 rounded-md px-2 py-1 text-xs text-gray-300 w-28 focus:outline-none focus:ring-1 focus:ring-accent-cyan/30"
          />
          <button
            type="button"
            onClick={handleLeadSearch}
            className="px-2 py-1 text-xs rounded-md bg-accent-cyan/20 text-accent-cyan hover:bg-accent-cyan/30 transition-colors"
          >
            Buscar
          </button>
          {leadId && (
            <button
              type="button"
              onClick={clearLeadSearch}
              className="px-2 py-1 text-xs rounded-md bg-surface-600 text-gray-400 hover:text-white transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Single lead timeline */}
      {!loading && !error && leadId && (
        <LeadTimelineView timeline={leadTimeline} />
      )}

      {/* Advisor comparison view */}
      {!loading && !error && !leadId && asesores.length > 0 && (
        <div className="rounded-lg border border-surface-500 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-700 text-left text-gray-400">
                  <th
                    className="px-3 py-2 font-medium cursor-pointer hover:text-white w-36"
                    onClick={() => toggleSort("asesor")}
                  >
                    Asesor
                    <SortIcon col="asesor" />
                  </th>
                  <th
                    className="px-3 py-2 font-medium cursor-pointer hover:text-white"
                    onClick={() => toggleSort("t1")}
                  >
                    <span title="Tiempo desde que llega el lead hasta la primera llamada">
                      T1: Llegó → Llamar
                    </span>
                    <SortIcon col="t1" />
                  </th>
                  <th
                    className="px-3 py-2 font-medium cursor-pointer hover:text-white"
                    onClick={() => toggleSort("t2")}
                  >
                    <span title="Tiempo desde la primera llamada hasta que se agenda una cita">
                      T2: Llamar → Agendar
                    </span>
                    <SortIcon col="t2" />
                  </th>
                  <th
                    className="px-3 py-2 font-medium cursor-pointer hover:text-white"
                    onClick={() => toggleSort("t3")}
                  >
                    <span title="Tiempo desde que se agenda hasta que asiste a la cita">
                      T3: Agendar → Asistir
                    </span>
                    <SortIcon col="t3" />
                  </th>
                  <th
                    className="px-3 py-2 font-medium cursor-pointer hover:text-white"
                    onClick={() => toggleSort("t4")}
                  >
                    <span title="Tiempo desde que asiste hasta que aparta">
                      T4: Asistir → Apartar
                    </span>
                    <SortIcon col="t4" />
                  </th>
                  <th
                    className="px-3 py-2 font-medium cursor-pointer hover:text-white"
                    onClick={() => toggleSort("t5")}
                  >
                    <span title="Tiempo desde que aparta hasta que compra">
                      T5: Apartar → Comprar
                    </span>
                    <SortIcon col="t5" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedAsesores.map((a) => (
                  <AsesorRow
                    key={a.asesor}
                    asesor={a}
                    maxByKey={maxByKey}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stuck counts */}
      {!loading && !error && !leadId && stuck && (
        <StuckBar stuck={stuck} />
      )}

      {!loading && !error && !leadId && asesores.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-500">
          Sin datos de tiempos para el periodo seleccionado
        </div>
      )}
    </div>
  );
}

function StuckBar({ stuck }: { stuck: { sin_llamar: number; sin_agendar: number; sin_asistir: number; sin_apartar: number; sin_comprar: number } }) {
  const items = [
    { label: "Sin llamar", count: stuck.sin_llamar },
    { label: "Sin agendar", count: stuck.sin_agendar },
    { label: "Sin asistir", count: stuck.sin_asistir },
    { label: "Sin apartar", count: stuck.sin_apartar },
    { label: "Sin comprar", count: stuck.sin_comprar },
  ];
  const hasAny = items.some((i) => i.count > 0);
  if (!hasAny) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px]">
      <span className="flex items-center gap-1 text-gray-500">
        <AlertTriangle className="w-3 h-3" />
        Estancados:
      </span>
      {items.map((item) =>
        item.count > 0 ? (
          <span key={item.label} className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {item.label}: {item.count}
          </span>
        ) : null,
      )}
    </div>
  );
}

function AsesorRow({
  asesor,
  maxByKey,
}: {
  asesor: MapaTiemposAsesor;
  maxByKey: Record<string, number>;
}) {
  const columns = ["t1", "t2", "t3", "t4", "t5"] as const;

  return (
    <tr className="border-t border-surface-500 hover:bg-surface-700/50">
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-cyan shrink-0" />
          <span className="text-gray-200 truncate max-w-[120px]">{asesor.asesor}</span>
        </span>
      </td>
      {columns.map((col) => {
        const mediana = asesor[`${col}_mediana_seconds`];
        const p90 = asesor[`${col}_p90_seconds`];
        const n = asesor[`${col}_n`];
        const max = maxByKey[col];
        const pct = mediana != null ? (mediana / max) * 100 : 0;

        return (
          <td key={col} className="px-3 py-2.5">
            {n > 0 ? (
              <TimeBar
                seconds={mediana}
                p90={p90}
                n={n}
                pct={pct}
                color={COLUMN_COLORS[col]}
              />
            ) : (
              <span className="text-gray-600">—</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function TimeBar({
  seconds,
  p90,
  n,
  pct,
  color,
}: {
  seconds: number | null;
  p90: number | null;
  n: number;
  pct: number;
  color: "cyan" | "purple" | "amber" | "emerald" | "rose";
}) {
  if (seconds == null || n === 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-gray-600">—</span>
      </div>
    );
  }

  const barColors: Record<typeof color, string> = {
    cyan: "bg-accent-cyan/40",
    purple: "bg-accent-purple/40",
    amber: "bg-amber-500/40",
    emerald: "bg-emerald-500/40",
    rose: "bg-rose-500/40",
  };

  const textColors: Record<typeof color, string> = {
    cyan: "text-accent-cyan",
    purple: "text-accent-purple",
    amber: "text-amber-400",
    emerald: "text-emerald-400",
    rose: "text-rose-400",
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-5 bg-surface-600 rounded-sm overflow-hidden relative min-w-[60px] max-w-[200px]">
          <div
            className={clsx("h-full rounded-sm transition-all", barColors[color])}
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
          <span
            className={clsx(
              "absolute inset-0 flex items-center px-1.5 text-[11px] font-medium",
              textColors[color],
            )}
          >
            {formatDuration(seconds)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {p90 != null && (
          <span className="text-[10px] text-gray-500">
            p90: {formatDuration(p90)}
          </span>
        )}
        <span className="text-[10px] text-gray-600">
          n={n}
        </span>
      </div>
    </div>
  );
}

function LeadTimelineView({
  timeline,
}: {
  timeline: MapaTiemposLeadTimeline | null;
}) {
  if (!timeline) {
    return (
      <div className="text-center py-8 text-sm text-gray-500">
        No se encontro timeline para este lead
      </div>
    );
  }

  const stages = [
    {
      label: "Llegó el lead",
      timestamp: timeline.t_llegada,
      delta: null as number | null,
      deltaLabel: "",
      active: true,
    },
    {
      label: "Llamarlo",
      timestamp: timeline.t_llamada,
      delta: timeline.t1_seconds,
      deltaLabel: "T1",
      active: !!timeline.t_llamada,
    },
    {
      label: "Agendar cita",
      timestamp: timeline.t_agenda,
      delta: timeline.t2_seconds,
      deltaLabel: "T2",
      active: !!timeline.t_agenda,
    },
    {
      label: "Que asista",
      timestamp: timeline.t_asista,
      delta: timeline.t3_seconds,
      deltaLabel: "T3",
      active: !!timeline.t_asista,
    },
    {
      label: "Que aparte",
      timestamp: timeline.t_aparta,
      delta: timeline.t4_seconds,
      deltaLabel: "T4",
      active: !!timeline.t_aparta,
    },
    {
      label: "Que compre",
      timestamp: timeline.t_compra,
      delta: timeline.t5_seconds,
      deltaLabel: "T5",
      active: !!timeline.t_compra,
    },
  ];

  return (
    <div className="rounded-lg border border-surface-500 bg-surface-800 p-4 space-y-4">
      {/* Lead info header */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-400">Lead:</span>
        <span className="text-white font-medium">
          {timeline.nombre_lead ?? `#${timeline.id_registro}`}
        </span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">Asesor:</span>
        <span className="text-accent-cyan">{timeline.asesor}</span>
      </div>

      {/* Horizontal timeline */}
      <div className="flex items-start gap-0 overflow-x-auto py-2">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-start">
            {/* Delta connector */}
            {i > 0 && (
              <div className="flex flex-col items-center pt-3 min-w-[80px]">
                <div
                  className={clsx(
                    "h-0.5 w-full",
                    stage.active ? "bg-accent-cyan/40" : "bg-gray-700",
                  )}
                />
                {stage.delta != null ? (
                  <span className="text-[10px] text-accent-cyan mt-1 whitespace-nowrap">
                    {stage.deltaLabel}: {formatDuration(stage.delta)}
                  </span>
                ) : (
                  <span
                    className={clsx(
                      "text-[10px] mt-1",
                      stage.active ? "text-gray-500" : "text-gray-700",
                    )}
                  >
                    —
                  </span>
                )}
              </div>
            )}

            {/* Stage node */}
            <div className="flex flex-col items-center min-w-[90px]">
              <div
                className={clsx(
                  "w-3 h-3 rounded-full border-2",
                  stage.active
                    ? "border-accent-cyan bg-accent-cyan/30"
                    : "border-gray-600 bg-surface-700",
                )}
              />
              <span
                className={clsx(
                  "text-[11px] font-medium mt-1.5 text-center",
                  stage.active ? "text-gray-200" : "text-gray-600",
                )}
              >
                {stage.label}
              </span>
              <span
                className={clsx(
                  "text-[10px] mt-0.5 text-center whitespace-nowrap",
                  stage.active ? "text-gray-400" : "text-gray-700",
                )}
              >
                {stage.timestamp
                  ? formatTimestamp(stage.timestamp)
                  : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
