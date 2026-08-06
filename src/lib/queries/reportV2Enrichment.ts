// LeadMaster — Report v2 · enrichment provider (AUT-1302 / AUT-1403)
// -----------------------------------------------------------------------------
// `getEnrichmentFromDb` lee la columna JSONB `gemini_enriquecimiento` de las
// tablas de interacción (chats_logs, log_llamadas, resumenes_diarios_agendas,
// registros_de_llamada) y arma el shape `ReportV2Enrichment` que consume
// `buildReportV2`. `parcial` = cobertura enriquecida < 30 % del total.
// -----------------------------------------------------------------------------

import { db } from "@/lib/db";
import { cuentas } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { zonedDayRange } from "@/lib/date-range";
import type {
  ReportV2ConversacionCanal,
  ReportV2Conversaciones,
  ReportV2Demografia,
  ReportV2Distribucion,
} from "@/types/reportV2";

export interface ReportV2Enrichment {
  parcial: boolean;
  demografiaIA: {
    motivo: ReportV2Distribucion[];
    perfil: ReportV2Distribucion[];
    edadDominante: string | null;
    presupuestoProm: number | null;
    iaDenominador: number;
  };
  conversaciones: ReportV2Conversaciones;
  narrativas: {
    reactivacion: string | null;
    rankingAlertas: string | null;
  };
  frasesInsights: Record<string, string>;
  objecionesFraseTextual: Record<string, string>;
  conclusiones: string[];
}

export function getEnrichmentMock(): ReportV2Enrichment {
  const emptyDemografia: ReportV2Demografia["motivo"] = [];
  return {
    parcial: true,
    demografiaIA: {
      motivo: emptyDemografia,
      perfil: [],
      edadDominante: null,
      presupuestoProm: null,
      iaDenominador: 0,
    },
    conversaciones: {
      llamadas: null,
      chats: null,
      video: null,
    },
    narrativas: {
      reactivacion: null,
      rankingAlertas: null,
    },
    frasesInsights: {},
    objecionesFraseTextual: {},
    conclusiones: [],
  };
}

const COVERAGE_THRESHOLD = 0.3;
const TOP_N = 10;

interface EnrichmentRow {
  [key: string]: unknown;
  canal: string;
  motivo_compra: string | null;
  perfil_compra: string | null;
  edad_estimada: string | null;
  presupuesto_detectado: string | null;
  recepcion_lead: string | null;
  engagement: string | null;
  aceptacion_propuesta: string | null;
  calidad_cierre: string | null;
  tono_lead: string | null;
  frases_relevantes: string | null;
  razon_calificacion: string | null;
}

interface CountRow {
  [key: string]: unknown;
  canal: string;
  total: string;
  enriched: string;
}

function toDistribution(counts: Map<string, number>, denominador: number): ReportV2Distribucion[] {
  return [...counts.entries()]
    .filter(([label]) => label !== "")
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([label, count]) => ({
      label,
      count,
      pct: denominador > 0 ? count / denominador : 0,
    }));
}

function canonicalLabelKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:!?"'()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toCanonicalDistribution(
  rawCounts: Map<string, number>,
  denominador: number,
): ReportV2Distribucion[] {
  const canonCount = new Map<string, number>();
  const canonBest = new Map<string, { label: string; count: number }>();
  for (const [label, count] of rawCounts) {
    if (label === "") continue;
    const key = canonicalLabelKey(label);
    if (!key) continue;
    canonCount.set(key, (canonCount.get(key) ?? 0) + count);
    const best = canonBest.get(key);
    if (!best || count > best.count) canonBest.set(key, { label, count });
  }
  return [...canonCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([key, count]) => {
      const best = canonBest.get(key);
      return {
        label: best ? best.label : key,
        count,
        pct: denominador > 0 ? count / denominador : 0,
      };
    });
}

const MAX_PRESUPUESTO = 100_000_000;

function parseFirstNumber(text: string): number | null {
  const millonMatch = text.match(/([\d,.]+)\s*millon/i);
  if (millonMatch) {
    const base = parseFloat(millonMatch[1].replace(/,/g, ""));
    if (!isNaN(base) && base > 0) {
      const val = base * 1_000_000;
      return val <= MAX_PRESUPUESTO ? val : null;
    }
  }
  const milMatch = text.match(/([\d,.]+)\s*mil\b/i);
  if (milMatch) {
    const base = parseFloat(milMatch[1].replace(/,/g, ""));
    if (!isNaN(base) && base > 0) {
      const val = base * 1_000;
      return val <= MAX_PRESUPUESTO ? val : null;
    }
  }
  const match = text.match(/[\d][\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(/,/g, ""));
  if (isNaN(num) || num <= 0 || num > MAX_PRESUPUESTO) return null;
  return num;
}

function incrementMap(map: Map<string, number>, key: string | null | undefined): void {
  if (!key) return;
  const normalized = key.trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function buildConversacionCanal(
  rows: EnrichmentRow[],
): ReportV2ConversacionCanal | null {
  if (rows.length === 0) return null;
  const total = rows.length;
  const recepcion = new Map<string, number>();
  const engagement = new Map<string, number>();
  const aceptacion = new Map<string, number>();
  const calidadCierre = new Map<string, number>();

  for (const r of rows) {
    incrementMap(recepcion, r.recepcion_lead);
    incrementMap(engagement, r.engagement);
    incrementMap(aceptacion, r.aceptacion_propuesta);
    incrementMap(calidadCierre, r.calidad_cierre);
  }

  return {
    totalAnalizadas: total,
    recepcion: toDistribution(recepcion, total),
    entendiaContexto: [],
    aceptacion: toDistribution(aceptacion, total),
    engagement: toDistribution(engagement, total),
    calidadCierre: toDistribution(calidadCierre, total),
    narrativaAsesor: null,
  };
}

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface GeminiClusterResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

async function clusterLabelsWithGemini(
  labels: Map<string, number>,
  apiKey: string,
  campo: string,
): Promise<Map<string, string> | null> {
  if (labels.size <= 1) return null;
  const entries = [...labels.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([l, c]) => `${l} (${c})`);

  const prompt = [
    `Eres un asistente que agrupa etiquetas de "${campo}" que significan lo mismo.`,
    "Recibe una lista de etiquetas con sus conteos.",
    "Devuelve SOLO un JSON válido: un objeto donde cada key es la etiqueta original exacta",
    "y el value es la categoría canónica en español a la que pertenece.",
    "Si una etiqueta ya es su propia categoría, repítela como value.",
    "No inventes categorías que no estén representadas en los datos.",
    "",
    "Etiquetas:",
    entries.join("\n"),
  ].join("\n");

  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GeminiClusterResponse;
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const mapping = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const result = new Map<string, string>();
    for (const [original, canonical] of Object.entries(mapping)) {
      if (typeof canonical === "string" && canonical.trim()) {
        result.set(original, canonical.trim());
      }
    }
    return result.size > 0 ? result : null;
  } catch {
    return null;
  }
}

function applySemanticClustering(
  distribution: ReportV2Distribucion[],
  clusterMap: Map<string, string>,
  denominador: number,
): ReportV2Distribucion[] {
  const grouped = new Map<string, number>();
  for (const item of distribution) {
    const canonical = clusterMap.get(item.label) ?? item.label;
    grouped.set(canonical, (grouped.get(canonical) ?? 0) + item.count);
  }
  return [...grouped.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([label, count]) => ({
      label,
      count,
      pct: denominador > 0 ? count / denominador : 0,
    }));
}

export async function getEnrichmentFromDb(
  idCuenta: number,
  from: string,
  to: string,
  tz?: string | null,
  geminiApiKey?: string | null,
): Promise<ReportV2Enrichment> {
  const { fromDate: fromTs, toDate: toTs } = zonedDayRange(from, to, tz);

  const [enrichedResult, countResult] = await Promise.all([
    db.execute<EnrichmentRow>(sql`
      SELECT
        'llamadas' AS canal,
        ge->>'motivo_compra' AS motivo_compra,
        ge->>'perfil_compra' AS perfil_compra,
        ge->>'edad_estimada' AS edad_estimada,
        ge->>'presupuesto_detectado' AS presupuesto_detectado,
        ge->>'recepcion_lead' AS recepcion_lead,
        ge->>'engagement' AS engagement,
        ge->>'aceptacion_propuesta' AS aceptacion_propuesta,
        ge->>'calidad_cierre' AS calidad_cierre,
        ge->>'tono_lead' AS tono_lead,
        ge->>'frases_relevantes' AS frases_relevantes,
        ge->>'razon_calificacion' AS razon_calificacion
      FROM log_llamadas, LATERAL (SELECT gemini_enriquecimiento AS ge) _
      WHERE id_cuenta = ${idCuenta}
        AND ts BETWEEN ${fromTs} AND ${toTs}
        AND gemini_enriquecimiento IS NOT NULL
      UNION ALL
      SELECT
        'chats' AS canal,
        ge->>'motivo_compra', ge->>'perfil_compra', ge->>'edad_estimada',
        ge->>'presupuesto_detectado', ge->>'recepcion_lead', ge->>'engagement',
        ge->>'aceptacion_propuesta', ge->>'calidad_cierre', ge->>'tono_lead',
        ge->>'frases_relevantes', ge->>'razon_calificacion'
      FROM chats_logs, LATERAL (SELECT gemini_enriquecimiento AS ge) _
      WHERE id_cuenta = ${idCuenta}
        AND fecha_y_hora_z BETWEEN ${fromTs} AND ${toTs}
        AND gemini_enriquecimiento IS NOT NULL
      UNION ALL
      SELECT
        'video' AS canal,
        ge->>'motivo_compra', ge->>'perfil_compra', ge->>'edad_estimada',
        ge->>'presupuesto_detectado', ge->>'recepcion_lead', ge->>'engagement',
        ge->>'aceptacion_propuesta', ge->>'calidad_cierre', ge->>'tono_lead',
        ge->>'frases_relevantes', ge->>'razon_calificacion'
      FROM resumenes_diarios_agendas, LATERAL (SELECT gemini_enriquecimiento AS ge) _
      WHERE id_cuenta = ${idCuenta}
        AND fecha BETWEEN ${from}::date AND ${to}::date
        AND gemini_enriquecimiento IS NOT NULL
    `),
    db.execute<CountRow>(sql`
      SELECT 'llamadas' AS canal,
        COUNT(*) FILTER (WHERE transcripcion IS NOT NULL AND LENGTH(transcripcion) >= 50)::text AS total,
        COUNT(gemini_enriquecimiento)::text AS enriched
      FROM log_llamadas
      WHERE id_cuenta = ${idCuenta} AND ts BETWEEN ${fromTs} AND ${toTs}
      UNION ALL
      SELECT 'chats',
        COUNT(*) FILTER (WHERE chat IS NOT NULL AND jsonb_array_length(chat) > 0)::text,
        COUNT(gemini_enriquecimiento)::text
      FROM chats_logs
      WHERE id_cuenta = ${idCuenta} AND fecha_y_hora_z BETWEEN ${fromTs} AND ${toTs}
      UNION ALL
      SELECT 'video',
        COUNT(*) FILTER (WHERE (transcripcion_fathom IS NOT NULL OR resumen_ia IS NOT NULL) AND LENGTH(COALESCE(transcripcion_fathom, resumen_ia, '')) >= 50)::text,
        COUNT(gemini_enriquecimiento)::text
      FROM resumenes_diarios_agendas
      WHERE id_cuenta = ${idCuenta} AND fecha BETWEEN ${from}::date AND ${to}::date
    `),
  ]);

  const rows = enrichedResult.rows;

  if (rows.length === 0) return getEnrichmentMock();

  // Coverage: enriched / total across all channels
  let totalAll = 0;
  let enrichedAll = 0;
  for (const c of countResult.rows) {
    totalAll += Number(c.total);
    enrichedAll += Number(c.enriched);
  }
  const parcial = totalAll === 0 || enrichedAll / totalAll < COVERAGE_THRESHOLD;

  // Split rows by channel
  const llamadasRows = rows.filter((r) => r.canal === "llamadas");
  const chatsRows = rows.filter((r) => r.canal === "chats");
  const videoRows = rows.filter((r) => r.canal === "video");

  // demografiaIA — aggregate across ALL channels
  const motivoCounts = new Map<string, number>();
  const perfilCounts = new Map<string, number>();
  const edades: string[] = [];
  const presupuestos: number[] = [];

  for (const r of rows) {
    incrementMap(motivoCounts, r.motivo_compra);
    incrementMap(perfilCounts, r.perfil_compra);
    if (r.edad_estimada) edades.push(r.edad_estimada.trim());
    if (r.presupuesto_detectado) {
      const num = parseFirstNumber(r.presupuesto_detectado);
      if (num !== null) presupuestos.push(num);
    }
  }

  const iaDenominador = rows.length;
  const edadDominante = edades.length > 0 ? mode(edades) : null;
  const presupuestoProm =
    presupuestos.length > 0
      ? Math.round(presupuestos.reduce((a, b) => a + b, 0) / presupuestos.length)
      : null;

  // frasesInsights — aggregate frases_relevantes across all rows
  const fraseCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.frases_relevantes) continue;
    try {
      const frases: unknown = JSON.parse(r.frases_relevantes);
      if (Array.isArray(frases)) {
        for (const f of frases) {
          if (typeof f === "string" && f.trim()) {
            incrementMap(fraseCounts, f.trim());
          }
        }
      }
    } catch {
      // frases_relevantes is not JSON — skip
    }
  }
  const frasesInsights: Record<string, string> = {};
  const topFrases = [...fraseCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N);
  for (const [frase, count] of topFrases) {
    frasesInsights[frase] = `Mencionada ${count} ${count === 1 ? "vez" : "veces"}`;
  }

  // conclusiones — top razon_calificacion themes
  const razonCounts = new Map<string, number>();
  for (const r of rows) {
    incrementMap(razonCounts, r.razon_calificacion);
  }
  const conclusiones = [...razonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([razon]) => razon);

  let motivo = toCanonicalDistribution(motivoCounts, iaDenominador);
  let perfil = toCanonicalDistribution(perfilCounts, iaDenominador);

  const gKey = geminiApiKey?.trim() || process.env.GEMINI_API_KEY?.trim() || null;
  if (gKey && motivo.length > 1) {
    const labelCounts = new Map<string, number>();
    for (const m of motivo) labelCounts.set(m.label, m.count);
    const clusterMap = await clusterLabelsWithGemini(labelCounts, gKey, "motivo de interés");
    if (clusterMap) {
      motivo = applySemanticClustering(motivo, clusterMap, iaDenominador);
    }
  }
  if (gKey && perfil.length > 1) {
    const labelCounts = new Map<string, number>();
    for (const p of perfil) labelCounts.set(p.label, p.count);
    const clusterMap = await clusterLabelsWithGemini(labelCounts, gKey, "perfil de comprador");
    if (clusterMap) {
      perfil = applySemanticClustering(perfil, clusterMap, iaDenominador);
    }
  }

  return {
    parcial,
    demografiaIA: {
      motivo,
      perfil,
      edadDominante,
      presupuestoProm,
      iaDenominador,
    },
    conversaciones: {
      llamadas: buildConversacionCanal(llamadasRows),
      chats: buildConversacionCanal(chatsRows),
      video: buildConversacionCanal(videoRows),
    },
    narrativas: {
      reactivacion: null,
      rankingAlertas: null,
    },
    frasesInsights,
    objecionesFraseTextual: {},
    conclusiones,
  };
}

function mode(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}
