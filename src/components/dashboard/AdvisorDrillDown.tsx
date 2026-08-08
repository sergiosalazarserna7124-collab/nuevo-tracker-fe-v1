"use client";

import { useState, useMemo } from "react";
import {
  X,
  Phone,
  Video,
  MessageSquare,
  User,
  Clock,
  Calendar,
  ChevronRight,
  ChevronLeft,
  PhoneCall,
} from "lucide-react";
import { format } from "date-fns";
import { useApiData } from "@/hooks/useApiData";
import HelpTooltip from "@/components/dashboard/HelpTooltip";
import type {
  AsesorResponse,
  AsesorLeadCRM,
  AsesorVideollamada,
  AsesorChat,
  AsesorChatMessage,
} from "@/types";

type ChannelTab = "llamadas" | "chats" | "citas";

interface Props {
  advisorName: string;
  advisorEmail: string | null;
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
}

function KpiMini({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-surface-700 px-3 py-2 text-center">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd/MM/yy HH:mm");
  } catch {
    return d;
  }
}

function estadoLabel(estado: AsesorLeadCRM["estadoNormalizado"]): string {
  const map: Record<string, string> = {
    pendiente: "Pendiente",
    no_contesto: "No contestó",
    buzon: "Buzón",
    seguimiento: "Seguimiento",
    interesado: "Interesado",
    programado: "Programado",
    calificada: "Calificada",
    no_calificada: "No calificada",
    cerrada: "Cerrada",
    no_interesado: "No interesado",
    otro: "Otro",
  };
  return map[estado] ?? estado;
}

function estadoColor(estado: AsesorLeadCRM["estadoNormalizado"]): string {
  const map: Record<string, string> = {
    pendiente: "bg-gray-500/20 text-gray-400",
    no_contesto: "bg-accent-red/20 text-accent-red",
    buzon: "bg-accent-amber/20 text-accent-amber",
    seguimiento: "bg-accent-cyan/20 text-accent-cyan",
    interesado: "bg-accent-purple/20 text-accent-purple",
    programado: "bg-accent-amber/20 text-accent-amber",
    calificada: "bg-accent-green/20 text-accent-green",
    no_calificada: "bg-accent-red/20 text-accent-red",
    cerrada: "bg-accent-green/20 text-accent-green",
    no_interesado: "bg-gray-500/20 text-gray-400",
    otro: "bg-gray-500/20 text-gray-400",
  };
  return map[estado] ?? "bg-gray-500/20 text-gray-400";
}

function categoriaLabel(cat: string): string {
  const map: Record<string, string> = {
    asistio: "Asistió",
    no_asistio: "No asistió",
    cancelada: "Cancelada",
    calificada: "Calificada",
    cerrada: "Cerrada",
    no_show: "No show",
  };
  return map[cat] ?? cat;
}

function categoriaColor(cat: string): string {
  const map: Record<string, string> = {
    asistio: "bg-accent-green/20 text-accent-green",
    calificada: "bg-accent-cyan/20 text-accent-cyan",
    cerrada: "bg-accent-green/20 text-accent-green",
    no_asistio: "bg-accent-red/20 text-accent-red",
    no_show: "bg-accent-red/20 text-accent-red",
    cancelada: "bg-accent-amber/20 text-accent-amber",
  };
  return map[cat] ?? "bg-gray-500/20 text-gray-400";
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function ChatBubble({ msg }: { msg: AsesorChatMessage }) {
  const isLead = msg.role === "lead";
  return (
    <div className={`flex ${isLead ? "justify-start" : "justify-end"} mt-1.5`}>
      <div
        className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs ${
          isLead
            ? "bg-surface-600 text-gray-300"
            : "bg-accent-cyan/20 text-accent-cyan"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{msg.message}</p>
        <p
          className={`text-[10px] mt-0.5 ${isLead ? "text-gray-500" : "text-accent-cyan/60"}`}
        >
          {formatDate(msg.timestamp)}
        </p>
      </div>
    </div>
  );
}

function LeadCallDetail({
  lead,
  onBack,
}: {
  lead: AsesorLeadCRM;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white mb-3 self-start"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Volver
      </button>
      <div className="rounded-lg bg-surface-700 p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-accent-cyan/20 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-accent-cyan" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm truncate">
              {lead.name}
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-400">
              {lead.email && <span>{lead.email}</span>}
              {lead.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {lead.phone}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${estadoColor(lead.estadoNormalizado)}`}
              >
                {estadoLabel(lead.estadoNormalizado)}
              </span>
              {lead.intentosContacto > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-surface-600 text-gray-300">
                  <PhoneCall className="w-3 h-3" /> {lead.intentosContacto}{" "}
                  intentos
                </span>
              )}
              {lead.speedToLead !== "—" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-surface-600 text-gray-300">
                  <Clock className="w-3 h-3" /> {lead.speedToLead}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      {lead.notasLlamadas.length > 0 ? (
        <section>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            <Phone className="w-3.5 h-3.5" /> Historial de llamadas (
            {lead.notasLlamadas.length})
          </h4>
          <div className="space-y-1.5">
            {lead.notasLlamadas.map((nota, i) => (
              <div
                key={`${nota.date}-${i}`}
                className="rounded-lg bg-surface-700 px-3 py-2 text-xs"
              >
                <span className="text-gray-500">{formatDate(nota.date)}</span>
                <p className="text-gray-300 mt-0.5">{nota.text || "—"}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="text-gray-500 text-sm text-center py-6">
          Sin historial de llamadas para este lead.
        </p>
      )}
    </div>
  );
}

function ChatDetail({
  chat,
  onBack,
}: {
  chat: AsesorChat;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white mb-3 self-start"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Volver
      </button>
      <div className="rounded-lg bg-surface-700 p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-accent-amber/20 flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5 text-accent-amber" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm truncate">
              {chat.leadName ?? "—"}
            </h3>
            {chat.leadEmail && (
              <p className="text-xs text-gray-400 mt-0.5">{chat.leadEmail}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  chat.respondido
                    ? "bg-accent-green/20 text-accent-green"
                    : "bg-accent-red/20 text-accent-red"
                }`}
              >
                {chat.respondido ? "Respondido" : "Sin respuesta"}
              </span>
              {chat.estado && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-surface-600 text-gray-300">
                  {chat.estado}
                </span>
              )}
              {chat.speedToLeadSeg !== null && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-surface-600 text-gray-300">
                  <Clock className="w-3 h-3" />{" "}
                  {formatDuration(chat.speedToLeadSeg)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      {chat.messages.length > 0 ? (
        <div className="space-y-0 flex-1 overflow-y-auto">
          {chat.messages.map((msg, mi) => (
            <ChatBubble key={mi} msg={msg} />
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-sm text-center py-6">
          Sin mensajes en este chat.
        </p>
      )}
    </div>
  );
}

function CitaDetail({
  cita,
  onBack,
}: {
  cita: AsesorVideollamada;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white mb-3 self-start"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Volver
      </button>
      <div className="rounded-lg bg-surface-700 p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-accent-purple/20 flex items-center justify-center shrink-0">
            <Video className="w-5 h-5 text-accent-purple" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm truncate">
              {cita.leadName ?? "—"}
            </h3>
            {cita.leadEmail && (
              <p className="text-xs text-gray-400 mt-0.5">{cita.leadEmail}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${categoriaColor(cita.categoria)}`}
              >
                {categoriaLabel(cita.categoria)}
              </span>
              {cita.fechaReunion && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-surface-600 text-gray-300">
                  <Calendar className="w-3 h-3" />{" "}
                  {formatDate(cita.fechaReunion)}
                </span>
              )}
              {cita.facturacion > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-accent-green/20 text-accent-green">
                  ${cita.facturacion.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      {cita.resumenIa && (
        <section className="mb-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Resumen IA
          </h4>
          <div className="rounded-lg bg-surface-700 px-3 py-2 text-xs text-gray-300 whitespace-pre-wrap">
            {cita.resumenIa}
          </div>
        </section>
      )}
      {cita.fathomUrl && (
        <a
          href={cita.fathomUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-accent-cyan hover:underline text-xs"
        >
          <Video className="w-3.5 h-3.5" /> Ver grabación
        </a>
      )}
      {!cita.resumenIa && !cita.fathomUrl && (
        <p className="text-gray-500 text-sm text-center py-6">
          Sin detalles adicionales para esta cita.
        </p>
      )}
    </div>
  );
}

function TabLlamadas({
  data,
  onSelectLead,
}: {
  data: AsesorResponse;
  onSelectLead: (lead: AsesorLeadCRM) => void;
}) {
  const { kpis, leads } = data;
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.phone && l.phone.includes(q)),
    );
  }, [leads, search]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
        <KpiMini
          label="Realizadas"
          value={kpis.llamadasRealizadas}
          color="text-white"
        />
        <KpiMini
          label="Contestadas"
          value={kpis.llamadasContestadas}
          color="text-accent-cyan"
        />
        <KpiMini
          label="Tasa contacto"
          value={`${Math.round(kpis.tasaContacto)}%`}
          color="text-accent-green"
        />
        <KpiMini
          label="Agendadas"
          value={kpis.reunionesAgendadas}
          color="text-accent-purple"
        />
      </div>

      <input
        type="text"
        placeholder="Buscar lead..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-accent-cyan/50 focus:border-accent-cyan outline-none"
      />

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {search ? "Sin resultados." : "Sin leads de llamadas en este período."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => onSelectLead(lead)}
              className="w-full text-left rounded-lg bg-surface-700 hover:bg-surface-600 px-3 py-2.5 transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-surface-600 flex items-center justify-center shrink-0 group-hover:bg-surface-500">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">
                      {lead.name}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {lead.email ?? lead.phone ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${estadoColor(lead.estadoNormalizado)}`}
                  >
                    {estadoLabel(lead.estadoNormalizado)}
                  </span>
                  {lead.intentosContacto > 0 && (
                    <span className="text-[10px] text-gray-500">
                      {lead.intentosContacto} int.
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TabChats({
  data,
  onSelectChat,
}: {
  data: AsesorResponse;
  onSelectChat: (chat: AsesorChat) => void;
}) {
  const { kpis, chats } = data;
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return chats;
    const q = search.toLowerCase();
    return chats.filter(
      (c) =>
        (c.leadName && c.leadName.toLowerCase().includes(q)) ||
        (c.leadEmail && c.leadEmail.toLowerCase().includes(q)),
    );
  }, [chats, search]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
        <KpiMini
          label="Total chats"
          value={kpis.totalChats}
          color="text-white"
        />
        <KpiMini
          label="Respondidos"
          value={kpis.chatsConRespuesta}
          color="text-accent-green"
        />
        <KpiMini
          label="Tasa resp."
          value={`${Math.round(kpis.tasaRespuestaChats)}%`}
          color="text-accent-cyan"
        />
        <KpiMini
          label="Speed to lead"
          value={
            kpis.speedToLeadChatsAvg !== null
              ? formatDuration(Math.round(kpis.speedToLeadChatsAvg))
              : "—"
          }
          color="text-accent-amber"
        />
      </div>

      <input
        type="text"
        placeholder="Buscar chat..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-accent-cyan/50 focus:border-accent-cyan outline-none"
      />

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {search ? "Sin resultados." : "Sin chats en este período."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((chat) => (
            <button
              key={chat.chatId}
              type="button"
              onClick={() => onSelectChat(chat)}
              className="w-full text-left rounded-lg bg-surface-700 hover:bg-surface-600 px-3 py-2.5 transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-surface-600 flex items-center justify-center shrink-0 group-hover:bg-surface-500">
                    <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">
                      {chat.leadName ?? "—"}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {formatDate(chat.fechaUltimoMensaje)} ·{" "}
                      {chat.messages.length} msgs
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      chat.respondido
                        ? "bg-accent-green/20 text-accent-green"
                        : "bg-accent-red/20 text-accent-red"
                    }`}
                  >
                    {chat.respondido ? "Respondido" : "Sin resp."}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TabCitas({
  data,
  onSelectCita,
}: {
  data: AsesorResponse;
  onSelectCita: (cita: AsesorVideollamada) => void;
}) {
  const { kpis, videollamadas } = data;
  const [search, setSearch] = useState("");

  const asistidas = kpis.reunionesAsistidas;
  const noShow = kpis.reunionesNoShow;
  const tasaAsistencia =
    kpis.reunionesAgendadas > 0
      ? Math.round((kpis.reunionesAsistidas / kpis.reunionesAgendadas) * 100)
      : 0;

  const filtered = useMemo(() => {
    if (!search.trim()) return videollamadas;
    const q = search.toLowerCase();
    return videollamadas.filter(
      (v) =>
        (v.leadName && v.leadName.toLowerCase().includes(q)) ||
        (v.leadEmail && v.leadEmail.toLowerCase().includes(q)),
    );
  }, [videollamadas, search]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
        <KpiMini
          label="Agendadas"
          value={kpis.reunionesAgendadas}
          color="text-white"
        />
        <KpiMini
          label="Asistidas"
          value={asistidas}
          color="text-accent-green"
        />
        <KpiMini
          label="No-show"
          value={noShow}
          color="text-accent-red"
        />
        <KpiMini
          label="Tasa asist."
          value={`${tasaAsistencia}%`}
          color="text-accent-cyan"
        />
      </div>

      <input
        type="text"
        placeholder="Buscar cita..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-accent-cyan/50 focus:border-accent-cyan outline-none"
      />

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {search ? "Sin resultados." : "Sin citas en este período."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((cita) => (
            <button
              key={cita.id}
              type="button"
              onClick={() => onSelectCita(cita)}
              className="w-full text-left rounded-lg bg-surface-700 hover:bg-surface-600 px-3 py-2.5 transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-surface-600 flex items-center justify-center shrink-0 group-hover:bg-surface-500">
                    <Video className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">
                      {cita.leadName ?? "—"}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {formatDate(cita.fechaReunion)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${categoriaColor(cita.categoria)}`}
                  >
                    {categoriaLabel(cita.categoria)}
                  </span>
                  {cita.facturacion > 0 && (
                    <span className="text-[10px] text-accent-green">
                      ${cita.facturacion.toLocaleString()}
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Lista unificada de leads del asesor (todos los canales) ─────────────────
interface UnifiedLead {
  key: string;
  name: string;
  subtitle: string;
  channels: { llamada: boolean; chat: boolean; cita: boolean };
  leadRef?: AsesorLeadCRM;
}

function buildUnifiedLeads(data: AsesorResponse): UnifiedLead[] {
  const map = new Map<string, UnifiedLead>();
  const idOf = (name?: string | null, email?: string | null, phone?: string | null) =>
    (email?.trim().toLowerCase() || phone?.trim() || name?.trim().toLowerCase() || "").trim();
  const ensure = (name?: string | null, email?: string | null, phone?: string | null) => {
    const k = idOf(name, email, phone) || `x-${map.size}`;
    let u = map.get(k);
    if (!u) {
      u = { key: k, name: name?.trim() || email?.trim() || phone?.trim() || "—", subtitle: email?.trim() || phone?.trim() || "", channels: { llamada: false, chat: false, cita: false } };
      map.set(k, u);
    }
    if ((!u.name || u.name === "—") && name?.trim()) u.name = name.trim();
    if (!u.subtitle && (email?.trim() || phone?.trim())) u.subtitle = email?.trim() || phone?.trim() || "";
    return u;
  };
  for (const l of data.leads) { const u = ensure(l.name, l.email, l.phone); u.channels.llamada = true; u.leadRef = l; }
  for (const c of data.chats) { const u = ensure(c.leadName, c.leadEmail, null); u.channels.chat = true; }
  for (const v of data.videollamadas) { const u = ensure(v.leadName, v.leadEmail, null); u.channels.cita = true; }
  return [...map.values()];
}

function canalesTexto(ch: UnifiedLead["channels"]): string {
  const parts: string[] = [];
  if (ch.llamada) parts.push("llamada");
  if (ch.chat) parts.push("chat");
  if (ch.cita) parts.push("videollamada");
  return parts.length ? `Con registro de: ${parts.join(", ")}` : "Sin registros de interacción";
}

function LeadsUnificados({ data, onSelectLead }: { data: AsesorResponse; onSelectLead: (lead: AsesorLeadCRM) => void }) {
  const [search, setSearch] = useState("");
  const unified = useMemo(() => buildUnifiedLeads(data), [data]);
  const filtered = useMemo(() => {
    if (!search.trim()) return unified;
    const q = search.toLowerCase();
    return unified.filter((u) => u.name.toLowerCase().includes(q) || u.subtitle.toLowerCase().includes(q));
  }, [unified, search]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="Buscar lead..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg bg-surface-700 border border-surface-500 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-accent-cyan/50 focus:border-accent-cyan outline-none"
      />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">{search ? "Sin resultados." : "Sin leads en este período."}</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((u) => (
            <button
              key={u.key}
              type="button"
              onClick={() => u.leadRef && onSelectLead(u.leadRef)}
              className="w-full text-left rounded-lg bg-surface-700 hover:bg-surface-600 px-3 py-2.5 transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-surface-600 flex items-center justify-center shrink-0 group-hover:bg-surface-500">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">{u.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">{u.subtitle || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {u.channels.llamada && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-accent-cyan/20 text-accent-cyan"><Phone className="w-3 h-3" /></span>}
                  {u.channels.chat && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-accent-amber/20 text-accent-amber"><MessageSquare className="w-3 h-3" /></span>}
                  {u.channels.cita && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-accent-purple/20 text-accent-purple"><Video className="w-3 h-3" /></span>}
                  <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400" />
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-1 ml-9">{canalesTexto(u.channels)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const CHANNEL_TABS: {
  key: ChannelTab;
  label: string;
  icon: typeof Phone;
  tooltip: string;
}[] = [
  {
    key: "llamadas",
    label: "Llamadas",
    icon: Phone,
    tooltip:
      "Métricas de llamadas del asesor: realizadas, contestadas, tasa de contacto y leads agendados desde llamadas.",
  },
  {
    key: "chats",
    label: "Chats",
    icon: MessageSquare,
    tooltip:
      "Métricas de chats del asesor: total de conversaciones, respondidos, tasa de respuesta y velocidad de atención.",
  },
  {
    key: "citas",
    label: "Citas",
    icon: Calendar,
    tooltip:
      "Métricas de citas/videollamadas del asesor: agendadas, asistidas, no-show y tasa de asistencia.",
  },
];

type DetailView =
  | { kind: "lead"; data: AsesorLeadCRM }
  | { kind: "chat"; data: AsesorChat }
  | { kind: "cita"; data: AsesorVideollamada };

export default function AdvisorDrillDown({
  advisorName,
  advisorEmail,
  dateFrom,
  dateTo,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<ChannelTab>("llamadas");
  const [detail, setDetail] = useState<DetailView | null>(null);

  const hasEmail = Boolean(advisorEmail);

  const { data, loading, error } = useApiData<AsesorResponse>(
    "/api/data/asesor",
    {
      from: dateFrom,
      to: dateTo,
      advisorEmail: advisorEmail ?? undefined,
    },
    { enabled: hasEmail },
  );

  const availableTabs = CHANNEL_TABS;
  const validActiveTab = activeTab;

  const tabCounts = useMemo(() => {
    if (!data) return { llamadas: 0, chats: 0, citas: 0 };
    return {
      llamadas: data.leads.length,
      chats: data.chats.length,
      citas: data.kpis.reunionesAgendadas,
    };
  }, [data]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-2xl ml-auto h-full bg-surface-800 border-l border-surface-500 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-surface-500 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-accent-cyan/20 flex items-center justify-center">
              <User className="w-5 h-5 text-accent-cyan" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                {advisorName}
                <HelpTooltip
                  titulo="Detalle del asesor"
                  contenido="Vista por canal de todas las interacciones de este asesor. Navega entre Llamadas, Chats y Citas para ver métricas específicas y la lista de contactos de cada canal. Haz click en cualquier registro para ver su detalle completo."
                  comoProbar="Cambia de pestaña para ver cada canal. Haz click en un lead/chat/cita para ver su detalle."
                />
              </h2>
              <p className="text-xs text-gray-500">
                {advisorEmail ?? "Sin email"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-600 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!hasEmail ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-surface-700 flex items-center justify-center mx-auto">
                <User className="w-6 h-6 text-gray-500" />
              </div>
              <p className="text-sm text-gray-400">
                Este asesor no tiene email registrado.
              </p>
              <p className="text-xs text-gray-600">
                Sin email no es posible cargar sus datos. Verifica que el asesor
                tenga un email asignado en el CRM.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-accent-red/10 border border-accent-red/20 p-4 text-center">
                  <p className="text-sm text-accent-red">
                    Error cargando datos: {error}
                  </p>
                </div>
              )}

              {!loading && !error && detail && detail.kind === "lead" && (
                <LeadCallDetail lead={detail.data} onBack={() => setDetail(null)} />
              )}

              {!loading && !error && !detail && data && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Leads de {advisorName}</p>
                  <LeadsUnificados data={data} onSelectLead={(lead) => setDetail({ kind: "lead", data: lead })} />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
