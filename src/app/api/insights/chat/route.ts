import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { getDashboard } from "@/lib/queries/dashboard";
import { db } from "@/lib/db";
import { cuentas } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  dateFrom?: string;
  dateTo?: string;
}

const fm = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${n.toLocaleString("es-CO")}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSystemPrompt(nombreCuenta: string, from: string, to: string, data: any, fuenteLlamadas?: string): string {
  const { kpis, advisorRanking, objeciones, chatKpis } = data;

  const sortedAdvisors = [...(advisorRanking ?? [])].sort(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any, b: any) => (b.revenue + b.callsMade) - (a.revenue + a.callsMade),
  );

  const totalAdvisors = sortedAdvisors.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allAdvisorNames = sortedAdvisors.map((a: any) => a.advisorName).join(", ");
  const top3Advisors = sortedAdvisors
    .slice(0, 3)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((a: any, i: number) => `${i + 1}. ${a.advisorName} — ${a.callsMade} llamadas, ${a.meetingsBooked} citas, ${fm(a.revenue)}`)
    .join("\n");

  const top5Objeciones = (objeciones ?? [])
    .slice(0, 5)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((o: any) => `• ${o.name} (${o.count}x)`)
    .join("\n");

  const chatSection = chatKpis
    ? `CHATS: ${chatKpis.total} conversaciones, ${chatKpis.leadsUnicos} leads únicos, ${chatKpis.tasaRespuesta.toFixed(1)}% con respuesta`
    : "CHATS: sin datos disponibles";

  const speedToLeadMin =
    kpis.speedToLeadAvg != null
      ? kpis.speedToLeadAvg < 1
        ? `${Math.round(kpis.speedToLeadAvg * 60)}s`
        : `${kpis.speedToLeadAvg.toFixed(1)} min`
      : "N/D";

  const llamadasNote = "";

  return `Eres el asistente de análisis de ventas de LeadMaster para ${nombreCuenta}.
Aquí están los datos del período ${from} al ${to}:

LLAMADAS: ${kpis.callsMade} totales, ${kpis.contestadas} contestadas (${(kpis.answerRate * 100).toFixed(1)}% contestación), speed to lead promedio ${speedToLeadMin}
CITAS: ${kpis.meetingsBooked} agendadas, ${kpis.meetingsAttended} asistidas, ${kpis.meetingsClosed} cerradas (${kpis.tasaCierre.toFixed(1)}% cierre)
REVENUE: ${fm(kpis.revenue)} facturado, ${fm(kpis.cashCollected)} cobrado
${chatSection}
EQUIPO (${totalAdvisors} asesores en total): ${allAdvisorNames || "Sin datos"}
TOP ASESORES POR ACTIVIDAD:
${top3Advisors || "Sin datos de asesores"}
OBJECIONES FRECUENTES:
${top5Objeciones || "Sin objeciones registradas"}
${llamadasNote}
Responde en español, de forma concisa y directa. Si preguntan sobre datos que no tienes, dilo honestamente. No inventes números.`;
}

export async function POST(req: Request) {
  return withAuth(req, async (idCuenta: number) => {
    try {
      const body = (await req.json()) as RequestBody;
      const { messages, dateFrom, dateTo } = body;

      if (!messages || !Array.isArray(messages)) {
        return NextResponse.json({ error: "messages es requerido" }, { status: 400 });
      }

      // Determinar rango de fechas
      const now = new Date();
      const from = dateFrom ?? new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      const to = dateTo ?? now.toISOString().slice(0, 10);

      // Obtener datos del dashboard y configuración de cuenta en paralelo
      const [dashData, cuenta] = await Promise.all([
        getDashboard(idCuenta, from, to),
        db
          .select({ nombre_cuenta: cuentas.nombre_cuenta, openai_api_key: cuentas.openai_api_key, fuente_llamadas: cuentas.fuente_llamadas })
          .from(cuentas)
          .where(eq(cuentas.id_cuenta, idCuenta))
          .limit(1)
          .then((rows) => rows[0] ?? null),
      ]);

      const nombreCuenta = cuenta?.nombre_cuenta ?? `Cuenta #${idCuenta}`;
      const fuenteLlamadas = cuenta?.fuente_llamadas === "ghl" ? "ghl" : "twilio";

      // Resolver API key: prioridad al tenant, fallback a servidor
      const apiKey = cuenta?.openai_api_key?.trim() || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "No hay OpenAI API key configurada. Configura OPENAI_API_KEY en el servidor o en la cuenta." },
          { status: 503 },
        );
      }

      const systemPrompt = buildSystemPrompt(nombreCuenta, from, to, dashData, fuenteLlamadas);

      // Construir historial para OpenAI (solo user/assistant)
      const chatHistory = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      // Llamada directa a OpenAI REST API (sin SDK)
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, ...chatHistory],
          max_tokens: 500,
          temperature: 0.3,
        }),
      });

      if (!openaiRes.ok) {
        const errBody = await openaiRes.text();
        console.error("[insights/chat] OpenAI error:", openaiRes.status, errBody);
        return NextResponse.json(
          { error: `Error de OpenAI: ${openaiRes.status}` },
          { status: 502 },
        );
      }

      const completion = (await openaiRes.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      const message = completion.choices[0]?.message?.content ?? "No pude generar una respuesta.";

      return NextResponse.json({ message });
    } catch (err) {
      console.error("[insights/chat] Error:", err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: "Error al procesar tu pregunta", debug: message },
        { status: 500 },
      );
    }
  });
}
