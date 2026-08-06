// LeadMaster — Report v2 · Narrativa ejecutiva con Gemini (AUT-1302 / WS2)
// -----------------------------------------------------------------------------
// Genera el resumen ejecutivo a partir de los AGREGADOS del reporte v2 (no de
// 2-3 llamadas). Motor = Gemini (contexto grande + costo, decisión del plan).
// Si no hay API key configurada, cae a un resumen determinista construido desde
// los agregados — NUNCA inventa datos (regla CERO ALUCINACIONES).
// -----------------------------------------------------------------------------

import type { ReportV2, ReportV2Narrativa } from "@/types/reportV2";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
  finishReason?: string;
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

/** Alertas críticas derivadas de umbrales duros sobre los agregados. */
function deriveAlertas(report: ReportV2): string[] {
  const alertas: string[] = [];
  const { kpis, estadoFinal, higieneCRM } = report;
  const total = kpis.leadsAnalizados || 0;
  if (total > 0) {
    const sinRespuesta = estadoFinal.contactadosSinRespuesta + estadoFinal.sinActividad;
    const pctSinRespuesta = sinRespuesta / total;
    if (pctSinRespuesta >= 0.4) {
      alertas.push(
        `${Math.round(pctSinRespuesta * 100)}% de leads sin respuesta o sin actividad`,
      );
    }
  }
  if (kpis.citasAgendadas > 0 && kpis.showRate < 0.5) {
    alertas.push(`Show rate bajo: ${Math.round(kpis.showRate * 100)}%`);
  }
  if (higieneCRM.leadsSinActividadTotal > 0 && total > 0) {
    const pct = higieneCRM.leadsSinActividadTotal / total;
    if (pct >= 0.3) {
      alertas.push(
        `${Math.round(pct * 100)}% de leads sin actividad >${higieneCRM.diasUmbral}d (higiene CRM)`,
      );
    }
  }
  return alertas;
}

/** Resumen determinista desde agregados (fallback sin IA — sin alucinar). */
function fallbackResumen(report: ReportV2): string {
  const { kpis, meta } = report;
  const partes = [
    `En el periodo ${meta.periodo.from}–${meta.periodo.to} se analizaron ${kpis.leadsAnalizados} leads`,
    `(${kpis.nuevos} nuevos, ${kpis.reactivados} reactivados).`,
    `Se agendaron ${kpis.citasAgendadas} citas y se realizaron ${kpis.citasRealizadas}`,
    `(show rate ${Math.round(kpis.showRate * 100)}%).`,
  ];
  if (meta.enriquecimientoParcial) {
    partes.push(
      "Nota: el análisis cualitativo por IA aún es parcial para este periodo.",
    );
  }
  return partes.join(" ");
}

function buildPrompt(report: ReportV2): string {
  const { meta, kpis, funnel, estadoFinal, origen, higieneCRM, porCanal, cobertura, comparativo, rankingAsesores, objeciones, demografia } = report;

  const agregados = {
    meta,
    kpis,
    funnel: funnel.stages,
    estadoFinal,
    origen: { nuevos: origen.nuevos, reactivados: origen.reactivados },
    higieneCRM: {
      leadsSinActividadTotal: higieneCRM.leadsSinActividadTotal,
      porAsesor: higieneCRM.porAsesor,
      diasUmbral: higieneCRM.diasUmbral,
    },
    porCanal,
    cobertura,
    comparativo: comparativo?.filas ?? null,
    rankingAsesores: {
      destacados: rankingAsesores.destacados,
      tabla: rankingAsesores.tabla.slice(0, 8),
    },
    objeciones: objeciones.slice(0, 8),
    demografia: {
      motivo: demografia.motivo.slice(0, 5),
      perfil: demografia.perfil.slice(0, 5),
      iaDenominador: demografia.iaDenominador,
    },
  };

  return [
    "Eres un analista comercial senior. Redacta un RESUMEN EJECUTIVO profesional",
    "(400–500 palabras, español neutro, tono directo y accionable) del desempeño",
    "de ventas del periodo, basándote EXCLUSIVAMENTE en los datos del JSON adjunto.",
    "",
    "REGLAS ESTRICTAS:",
    "- NO inventes cifras ni porcentajes que no estén en el JSON.",
    "- Si un campo es null o no existe, NO lo menciones.",
    "- NO menciones DND (no aplica en este reporte).",
    "- Usa cifras exactas del JSON, no redondees arbitrariamente.",
    "",
    "ESTRUCTURA OBLIGATORIA (usa estos encabezados con ##):",
    "",
    "## Volumen y origen",
    "Leads totales, nuevos vs reactivados, tendencia vs periodo anterior si hay comparativo.",
    "",
    "## Contactabilidad por canal",
    "Para cada canal activo: tasa de contacto, intentos promedio, speed-to-lead (llamadas),",
    "tiempo de primera respuesta (chats), show rate (video). Omitir canales con null.",
    "",
    "## Cobertura de canales",
    "Leads contactados por múltiples canales vs uno solo. A qué intento contestan.",
    "Mejores franjas horarias si hay datos.",
    "",
    "## Calificación y objeciones",
    "Tasa de calificación (calificados / analizados del funnel). Top objeciones con %.",
    "Si hay motivos de no-calificación en el funnel, mencionarlos.",
    "",
    "## Embudo: calificación → cita → show",
    "Recorrer las etapas del funnel con tasas de conversión entre cada paso.",
    "Show rate y causas de no-show si son evidentes.",
    "",
    "## Higiene CRM / fuga de leads",
    "Leads sin actividad (total y por asesor). Porcentaje sobre el total.",
    "Leads con un solo intento de contacto.",
    "",
    "## Acciones recomendadas",
    "3-5 recomendaciones concretas y priorizadas, derivadas de los datos.",
    "",
    "DATOS_AGREGADOS_JSON:",
    JSON.stringify(agregados, null, 0),
  ].join("\n");
}

/**
 * Genera la narrativa ejecutiva. `apiKey` = GEMINI_API_KEY (env) o por-cuenta.
 * Nunca lanza: si falla la IA, devuelve el fallback determinista.
 */
export async function generateNarrativa(
  report: ReportV2,
  apiKey: string | null,
): Promise<ReportV2Narrativa> {
  const alertasCriticas = deriveAlertas(report);
  const key = apiKey?.trim() || process.env.GEMINI_API_KEY?.trim() || null;
  if (!key) {
    console.error("[report-v2 narrativa] Gemini fallback", {
      motivo: "no API key configured (param + env)",
    });
    return { resumenEjecutivo: fallbackResumen(report), alertasCriticas };
  }

  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(report) }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      console.error("[report-v2 narrativa] Gemini fallback", {
        motivo: `HTTP ${res.status}`,
        body: body.slice(0, 300),
      });
      return { resumenEjecutivo: fallbackResumen(report), alertasCriticas };
    }
    const data = (await res.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const texto = candidate?.content?.parts?.[0]?.text?.trim();

    if (finishReason === "MAX_TOKENS") {
      console.error("[report-v2 narrativa] respuesta truncada", {
        finishReason,
        textoLength: texto?.length ?? 0,
      });
    }

    if (!texto) {
      console.error("[report-v2 narrativa] Gemini fallback", {
        motivo: "empty response from Gemini",
        candidates: data.candidates?.length ?? 0,
        finishReason,
      });
    }
    return {
      resumenEjecutivo: texto || fallbackResumen(report),
      alertasCriticas,
    };
  } catch (err) {
    console.error("[report-v2 narrativa] Gemini fallback", {
      motivo: "fetch exception",
      error: err instanceof Error ? err.message : String(err),
    });
    return { resumenEjecutivo: fallbackResumen(report), alertasCriticas };
  }
}
