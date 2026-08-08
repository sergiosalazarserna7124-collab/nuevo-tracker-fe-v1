/**
 * POST /api/data/lead-resumen
 * Genera on-demand un resumen IA "en qué quedó el lead" cruzando TODOS los canales
 * (chats, llamadas, citas). El cliente envía un contexto compacto ya armado con los
 * resúmenes/últimos mensajes de cada canal; aquí solo se llama a OpenAI.
 *
 * Body: { contexto: string; leadName?: string }
 * Resp: { resumen: string } | { error: string }
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { cuentas } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface Body {
  contexto?: string;
  leadName?: string;
}

const SYSTEM = `Eres un analista de ventas. Te dan lo hablado con un lead a través de varios
canales (chats de WhatsApp, llamadas telefónicas y videollamadas/citas), con sus resúmenes
y últimos mensajes. Devuelve SOLO un JSON {"resumen": "..."} con un resumen BREVE (2-3 frases,
máx 320 chars) de EN QUÉ QUEDÓ el lead considerando TODOS los canales en conjunto: el último
acuerdo y los próximos pasos concretos (ej: enviar Zoom, enviar videos, el lead está buscando
los documentos), y quién debe dar el siguiente paso. No inventes; si algún dato no está, no lo
menciones. Escribe en español, directo, sin viñetas.`;

export async function POST(req: Request) {
  return withAuth(req, async (idCuenta: number) => {
    try {
      const { contexto, leadName } = (await req.json()) as Body;
      if (!contexto || !contexto.trim()) {
        return NextResponse.json({ error: "contexto es requerido" }, { status: 400 });
      }

      const cuenta = await db
        .select({ openai_api_key: cuentas.openai_api_key })
        .from(cuentas)
        .where(eq(cuentas.id_cuenta, idCuenta))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      const apiKey = cuenta?.openai_api_key?.trim() || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: "No hay OpenAI API key configurada." }, { status: 503 });
      }

      const userContent = `${leadName ? `Lead: ${leadName}\n\n` : ""}${contexto.slice(0, 8000)}`;

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          max_tokens: 300,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userContent },
          ],
        }),
      });

      if (!openaiRes.ok) {
        const errBody = await openaiRes.text();
        console.error("[lead-resumen] OpenAI error:", openaiRes.status, errBody);
        return NextResponse.json({ error: `Error de OpenAI: ${openaiRes.status}` }, { status: 502 });
      }

      const completion = (await openaiRes.json()) as { choices: Array<{ message: { content: string } }> };
      const raw = completion.choices[0]?.message?.content ?? "{}";
      let resumen = "";
      try {
        resumen = (JSON.parse(raw).resumen ?? "").trim();
      } catch {
        resumen = raw.trim();
      }

      return NextResponse.json({ resumen: resumen || null });
    } catch (err) {
      console.error("[lead-resumen] Error:", err);
      return NextResponse.json({ error: "Error generando el resumen" }, { status: 500 });
    }
  });
}
