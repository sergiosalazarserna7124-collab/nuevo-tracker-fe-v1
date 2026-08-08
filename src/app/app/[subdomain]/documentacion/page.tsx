"use client";

/**
 * Documentación del sistema: qué hace LeadMaster en GHL y en el dashboard.
 * Contenido fiel al comportamiento del backend (webhooks + IA + crons).
 */
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tag,
  Phone,
  Video,
  MessageSquare,
  Calendar,
  Bot,
  StickyNote,
  ListChecks,
  EyeOff,
  Trash2,
  PenLine,
} from "lucide-react";

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface-700 border border-surface-500 px-1.5 py-0.5 text-xs font-mono text-accent-cyan whitespace-nowrap">
      {children}
    </code>
  );
}

function Fila({ etiqueta, cuando }: { etiqueta: string; cuando: string }) {
  return (
    <tr className="border-b border-surface-700 last:border-0">
      <td className="py-2 pr-4 align-top"><Etiqueta>{etiqueta}</Etiqueta></td>
      <td className="py-2 text-gray-400">{cuando}</td>
    </tr>
  );
}

function TablaEtiquetas({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default function DocumentacionPage() {
  return (
    <>
      <PageHeader
        title="Documentación"
        subtitle="Qué hace el sistema: etiquetas, notas, tareas y cómo procesa llamadas, chats y citas"
      />
      <div className="p-3 md:p-4 max-w-4xl mx-auto space-y-4 text-sm">

        {/* ── Cómo funciona ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="w-4 h-4 text-accent-cyan" />
              Cómo procesa la información
            </CardTitle>
            <CardDescription>
              LeadMaster escucha lo que pasa en GoHighLevel y lo convierte en métricas,
              etiquetas, notas y tareas — sin que el equipo tenga que registrar nada a mano.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-gray-400">
            <div className="flex gap-3">
              <Phone className="w-4 h-4 mt-0.5 shrink-0 text-accent-blue" />
              <p><span className="text-white font-medium">Llamadas:</span> cada llamada que entra o sale por GHL se registra automáticamente. Si hay transcripción, la IA la analiza: clasifica el resultado (interesado, no interesado, programó cita…), escribe el resumen en una nota del contacto y aplica la etiqueta correspondiente.</p>
            </div>
            <div className="flex gap-3">
              <MessageSquare className="w-4 h-4 mt-0.5 shrink-0 text-accent-green" />
              <p><span className="text-white font-medium">Chats (WhatsApp, SMS, Instagram, Facebook…):</span> cada conversación se registra y la IA la clasifica según los criterios de calificación de tu cuenta. Con esto se calculan speed-to-lead de chat y las métricas de conversación.</p>
            </div>
            <div className="flex gap-3">
              <Calendar className="w-4 h-4 mt-0.5 shrink-0 text-accent-purple" />
              <p><span className="text-white font-medium">Citas:</span> cuando se agenda, cancela o reagenda una cita en GHL, el sistema la sincroniza y etiqueta al contacto. Un barrido diario marca como no-show las citas del día que quedaron sin videollamada.</p>
            </div>
            <div className="flex gap-3">
              <Video className="w-4 h-4 mt-0.5 shrink-0 text-accent-amber" />
              <p><span className="text-white font-medium">Videollamadas (Fathom):</span> al terminar una reunión grabada, la IA lee la transcripción y determina el resultado: si se ofertó, si se cerró, las objeciones del lead y el resumen — y actualiza la cita, las etiquetas y las notas.</p>
            </div>
          </CardContent>
        </Card>

        {/* ── Etiquetas ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="w-4 h-4 text-accent-cyan" />
              Etiquetas que pone el sistema
            </CardTitle>
            <CardDescription>
              Todas terminan en <Etiqueta>autoia</Etiqueta> o <Etiqueta>callai</Etiqueta> para
              distinguirlas de las etiquetas manuales del equipo. Se aplican solas según lo que llega.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-1.5 font-medium text-white flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-accent-purple" /> Por el estado de la cita</p>
              <TablaEtiquetas>
                <Fila etiqueta="pdteautoia" cuando="Se agendó una cita y está pendiente de realizarse" />
                <Fila etiqueta="canceladaautoia" cuando="La cita fue cancelada" />
                <Fila etiqueta="reagendadoautoia" cuando="La cita fue reagendada (por el lead o por la IA de voz)" />
                <Fila etiqueta="noshowautoia" cuando="El lead no se presentó (lo detecta Fathom o el barrido diario de citas vencidas)" />
                <Fila etiqueta="perdidoautoia" cuando="La cita se dio por perdida" />
              </TablaEtiquetas>
            </div>
            <div>
              <p className="mb-1.5 font-medium text-white flex items-center gap-1.5"><Video className="w-3.5 h-3.5 text-accent-amber" /> Por el resultado de la videollamada (IA + Fathom)</p>
              <TablaEtiquetas>
                <Fila etiqueta="videollamada_efectiva_autoia" cuando="La reunión ocurrió con interacción real (hay grabación/transcripción)" />
                <Fila etiqueta="ofertadaautoia" cuando="La IA detectó que se presentó una oferta en la reunión" />
                <Fila etiqueta="noofertadaautoia" cuando="La reunión ocurrió pero no se llegó a ofertar" />
                <Fila etiqueta="cerradaautoia" cuando="La IA detectó cierre de venta en la reunión" />
              </TablaEtiquetas>
            </div>
            <div>
              <p className="mb-1.5 font-medium text-white flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-accent-blue" /> Por el resultado de la llamada telefónica (IA)</p>
              <TablaEtiquetas>
                <Fila etiqueta="contestada_autoia_llamada" cuando="La llamada fue contestada" />
                <Fila etiqueta="no_contestallamadaautoia" cuando="La llamada no fue contestada" />
                <Fila etiqueta="interesadollamadaautoia" cuando="La IA clasificó al lead como interesado en la llamada" />
                <Fila etiqueta="no_interesadollamadaautoia" cuando="La IA clasificó al lead como no interesado" />
                <Fila etiqueta="programadollamadaautoia" cuando="En la llamada se programó una cita" />
              </TablaEtiquetas>
            </div>
            <div>
              <p className="mb-1.5 font-medium text-white flex items-center gap-1.5"><Bot className="w-3.5 h-3.5 text-accent-green" /> Por el agente de voz IA</p>
              <TablaEtiquetas>
                <Fila etiqueta="interesadocallai" cuando="El agente de voz detectó interés" />
                <Fila etiqueta="nointeresadocallai" cuando="El agente de voz detectó que no hay interés" />
                <Fila etiqueta="agendadocallai" cuando="El agente de voz agendó una cita" />
                <Fila etiqueta="confirmadocallai" cuando="El agente de voz confirmó la cita existente" />
                <Fila etiqueta="llamardespuescallai" cuando="El lead pidió que lo llamen después" />
              </TablaEtiquetas>
            </div>
            <div>
              <p className="mb-1.5 font-medium text-white flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-accent-green" /> Por chats</p>
              <TablaEtiquetas>
                <Fila etiqueta="sin_responder_chat" cuando="El lead escribió y el equipo no ha respondido (cron periódico). Se quita sola cuando el equipo responde" />
                <Fila etiqueta="llamada-en-progreso" cuando="Marca temporal mientras se procesa una llamada; se quita al terminar" />
              </TablaEtiquetas>
            </div>
          </CardContent>
        </Card>

        {/* ── Descartar leads ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trash2 className="w-4 h-4 text-accent-red" />
              1. Cómo se descartan los leads
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-gray-400">
            <p>
              Poniéndole al contacto la etiqueta <Etiqueta>descartar-lead</Etiqueta> (en GHL o
              desde el dashboard). El lead <span className="text-white font-medium">sigue visible</span> en
              el dashboard, pero:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sale de las métricas globales (leads, llamadas, conversiones…)</li>
              <li>Queda marcado como <Badge variant="outline" className="text-accent-red border-accent-red/40">descartado</Badge> y cuenta en la métrica de &quot;leads descartados&quot;</li>
            </ul>
            <p>
              Es <span className="text-white font-medium">reversible</span>: al quitarle la etiqueta, el
              lead vuelve a contar en métricas. También puedes configurar etiquetas de descarte
              propias por cuenta (además de la estándar).
            </p>
          </CardContent>
        </Card>

        {/* ── Excluir del dashboard ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <EyeOff className="w-4 h-4 text-accent-amber" />
              2. Cómo se excluyen los leads del dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-gray-400">
            <p>
              Poniéndole al contacto la etiqueta <Etiqueta>no_trackearlead</Etiqueta>. A diferencia del
              descarte, el lead se <span className="text-white font-medium">oculta por completo</span>:
              desaparece del dashboard y de todas las métricas, como si no existiera. Útil para números
              de prueba, personal interno o spam.
            </p>
            <p>
              También es reversible: al quitar la etiqueta el lead vuelve a aparecer y a contar.
            </p>
            <div className="rounded-lg border border-surface-500 bg-surface-700/50 p-3 text-xs">
              <p className="text-white font-medium mb-1">Resumen de las dos etiquetas:</p>
              <p><Etiqueta>descartar-lead</Etiqueta> → visible, fuera de métricas, cuenta como descartado</p>
              <p className="mt-1"><Etiqueta>no_trackearlead</Etiqueta> → oculto por completo, fuera de todo</p>
            </div>
          </CardContent>
        </Card>

        {/* ── Notas ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <StickyNote className="w-4 h-4 text-accent-green" />
              3. Notas que escribe en el contacto
            </CardTitle>
            <CardDescription>Se agregan automáticamente en GHL, en el timeline del contacto.</CardDescription>
          </CardHeader>
          <CardContent>
            <TablaEtiquetas>
              <Fila etiqueta="📞 Llamada GHL — Análisis IA" cuando="Resumen de la llamada generado por la IA (qué se habló, resultado)" />
              <Fila etiqueta="📞 Llamada GHL — Transcripción" cuando="Transcripción completa de la llamada (si está activada en la cuenta)" />
              <Fila etiqueta="Llamada no contestada" cuando="Nota simple cuando la llamada no fue contestada" />
              <Fila etiqueta="🎥 Videollamada — Análisis IA" cuando="Resumen de la reunión: resultado, facturación detectada, objeciones y etiquetas" />
              <Fila etiqueta="📞 Agente de voz — LeadMaster" cuando="Estado final de la llamada del agente IA, resumen, reagendamiento y transcript" />
              <Fila etiqueta="⚠️ Alerta speed-to-lead" cuando="El lead lleva demasiado tiempo sin ser contactado (incluye asesor asignado)" />
              <Fila etiqueta="🚨 Escalación a manager" cuando="El lead sigue sin contacto después de la primera alerta" />
            </TablaEtiquetas>
          </CardContent>
        </Card>

        {/* ── Tareas ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="w-4 h-4 text-accent-blue" />
              4. Tareas que crea
            </CardTitle>
            <CardDescription>
              Tareas de GHL asignadas al asesor de la cita, con fecha límite.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TablaEtiquetas>
              <Fila etiqueta="Tarea de seguimiento (LeadMaster)" cuando="Tras una cita o llamada, cuando la IA detecta un compromiso pendiente (ej. enviar info, volver a llamar). Se asigna al asesor dueño de la cita" />
              <Fila etiqueta="Coach IA — Score" cuando="Cuando una llamada queda por debajo del umbral de calidad del Coach IA: tarea para revisar la llamada con el score obtenido" />
            </TablaEtiquetas>
          </CardContent>
        </Card>

        {/* ── Campos ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PenLine className="w-4 h-4 text-accent-purple" />
              5. Campos que completa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TablaEtiquetas>
              <Fila etiqueta="Tipo de interés" cuando="Campo personalizado de la oportunidad: la IA escribe por qué el lead califica (si la cuenta lo tiene configurado)" />
              <Fila etiqueta="Razón de no calificado" cuando="Campo personalizado de la oportunidad: la IA escribe por qué el lead NO califica (si está configurado)" />
              <Fila etiqueta="Datos del contacto" cuando="Nombre, email, teléfono y asesor asignado se sincronizan de GHL al dashboard en cada actualización" />
              <Fila etiqueta="Estado de la cita" cuando="Confirmada / cancelada / reagendada se sincronizan a la agenda del dashboard; Fathom luego escribe el resultado real de la reunión" />
            </TablaEtiquetas>
          </CardContent>
        </Card>

      </div>
    </>
  );
}
