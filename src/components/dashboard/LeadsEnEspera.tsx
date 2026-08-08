"use client";

import { useState } from "react";
import { Clock, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, User, Phone, Mail } from "lucide-react";
import { useApiData } from "@/hooks/useApiData";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { CanalLeadsEnEspera } from "@/lib/queries/leads-en-espera";
import HelpTooltip from "@/components/dashboard/HelpTooltip";

export interface LeadEnEspera {
  nombre_lead: string;
  nombre_closer: string | null;
  closer_mail: string | null;
  creativo_origen: string | null;
  min_sin_llamar: number;
  phone: string | null;
  mail_lead: string | null;
  canal_origen?: "llamada" | "chat";
}

export interface CloserConLeadsEnEspera {
  nombre_closer: string;
  closer_mail: string | null;
  leads: LeadEnEspera[];
  lead_mas_antiguo_min: number;
}

export interface LeadsEnEsperaResponse {
  grupos: CloserConLeadsEnEspera[];
  total: number;
  umbral_min: number;
  canal: CanalLeadsEnEspera;
}

function formatTiempoEspera(minutos: number): string {
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  if (mins === 0) return `${horas}h`;
  return `${horas}h ${mins}min`;
}

type UrgenciaNivel = "amarillo" | "naranja" | "rojo";

function getUrgencia(minutos: number): UrgenciaNivel {
  if (minutos >= 1440) return "rojo";   // +24h
  if (minutos >= 240) return "naranja"; // +4h
  return "amarillo";                    // +60min
}

const URGENCIA_STYLES: Record<UrgenciaNivel, { badge: string; dot: string }> = {
  amarillo: {
    badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    dot: "bg-yellow-400",
  },
  naranja: {
    badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    dot: "bg-orange-400",
  },
  rojo: {
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    dot: "bg-red-400",
  },
};

// Modo ÚNICO (pedido de Sergio 2026-08-08): aquí solo aparecen leads SIN
// NINGÚN contacto — ni una llamada registrada ni una conversación de chat.
// Con cualquiera de las dos, el lead sale de esta lista. Sin selector de canal.

function LeadRow({ lead, asesorBasePath, canal }: { lead: LeadEnEspera; asesorBasePath: string; canal: CanalLeadsEnEspera }) {
  const urgencia = getUrgencia(lead.min_sin_llamar);
  const styles = URGENCIA_STYLES[urgencia];
  const contactInfo = lead.phone ?? lead.mail_lead;
  const asesorLink = lead.closer_mail
    ? `${asesorBasePath}?advisor=${encodeURIComponent(lead.closer_mail)}`
    : null;

  const badgeLabel = canal === "ninguno"
    ? "sin contacto"
    : canal === "chat"
      ? "sin responder"
      : canal === "chat_sin_contestar"
        ? "sin contestar"
        : "sin llamar";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} />
        <div className="min-w-0">
          <span className="truncate text-slate-200 block">{lead.nombre_lead}</span>
          {contactInfo && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400 truncate">
              {lead.phone ? <Phone className="h-3 w-3 shrink-0" /> : <Mail className="h-3 w-3 shrink-0" />}
              {contactInfo}
            </span>
          )}
        </div>
        {lead.creativo_origen && (
          <span className="hidden shrink-0 rounded px-1.5 py-0.5 text-xs bg-slate-700 text-slate-400 sm:inline">
            {lead.creativo_origen}
          </span>
        )}
        {!lead.creativo_origen && (
          <span className="hidden shrink-0 rounded px-1.5 py-0.5 text-xs bg-slate-800 text-slate-600 sm:inline">
            Sin fuente
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${styles.badge}`}
        >
          {formatTiempoEspera(lead.min_sin_llamar)} {badgeLabel}
        </span>
        {asesorLink && (
          <Link
            href={asesorLink}
            className="hidden sm:inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10 transition-colors whitespace-nowrap"
            title={`Ver pipeline de ${lead.nombre_closer ?? lead.closer_mail}`}
          >
            <User className="h-3 w-3" />
            Ver lead
          </Link>
        )}
      </div>
    </div>
  );
}

function CloserCard({ grupo, asesorBasePath, canal }: { grupo: CloserConLeadsEnEspera; asesorBasePath: string; canal: CanalLeadsEnEspera }) {
  const [expandido, setExpandido] = useState(false);
  const urgenciaMayor = getUrgencia(grupo.lead_mas_antiguo_min);
  const styles = URGENCIA_STYLES[urgenciaMayor];

  return (
    <div className="rounded-xl border border-white/10 bg-slate-800/50 overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpandido((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700">
            <User className="h-4 w-4 text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-100">
              {grupo.nombre_closer}
            </p>
            <p className="text-xs text-slate-500">
              {grupo.leads.length} lead{grupo.leads.length !== 1 ? "s" : ""} {canal === "chat_sin_contestar" ? "sin contestar" : "sin contacto"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles.badge}`}
          >
            {formatTiempoEspera(grupo.lead_mas_antiguo_min)} máx
          </span>
          {expandido ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </div>
      </button>

      {expandido && (
        <div className="border-t border-white/10 px-4 py-3 space-y-2">
          {grupo.leads.map((lead, i) => (
            <LeadRow key={`${lead.nombre_lead}-${i}`} lead={lead} asesorBasePath={asesorBasePath} canal={canal} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeadsEnEspera({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const canal: CanalLeadsEnEspera = "ninguno";
  const pathname = usePathname();
  const asesorBasePath = pathname.replace(/\/[^/]*$/, "/asesor");
  const { data, loading, error } = useApiData<LeadsEnEsperaResponse>(
    "/api/data/leads-en-espera",
    { from: dateFrom, to: dateTo, canal },
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Clock className="h-5 w-5 animate-pulse" />
          <span className="text-sm">Verificando leads en espera…</span>
        </div>
      </div>
    );
  }

  if (error) return null;
  const seccionTitulo = "Leads sin contacto inicial";
  const helpTitulo = "Leads sin contacto inicial";
  const helpContenido = `Leads que llevan más de ${data?.umbral_min ?? 60} min SIN NINGÚN tipo de contacto: ni una llamada registrada ni una conversación de chat.\n\nEn cuanto el lead tenga una llamada O un chat, sale de esta lista automáticamente.`;

  if (!data || data.total === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100">{seccionTitulo}</h2>
            <HelpTooltip
              titulo={helpTitulo}
              contenido={helpContenido}
            />
          </div>
        </div>
        <div className="px-5 py-4">
          <span className="text-sm text-emerald-300">
            Todo al día — ningún lead lleva más de {data?.umbral_min ?? 60} min sin ningún tipo de contacto.
          </span>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-orange-500/20 bg-slate-900/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-orange-400" />
          <h2 className="text-base font-semibold text-slate-100">
            {seccionTitulo}
          </h2>
          <HelpTooltip
            titulo={helpTitulo}
            contenido={helpContenido}
          />
          <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
            {data.total}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-slate-500 sm:block">
            Llevan más de {data.umbral_min} min sin ningún tipo de contacto (ni llamada ni chat)
          </p>
        </div>
      </div>

      {/* Grupos por closer */}
      <div className="p-4 space-y-3">
        {data.grupos.map((grupo) => (
          <CloserCard key={grupo.closer_mail ?? grupo.nombre_closer} grupo={grupo} asesorBasePath={asesorBasePath} canal={canal} />
        ))}
      </div>
    </section>
  );
}
