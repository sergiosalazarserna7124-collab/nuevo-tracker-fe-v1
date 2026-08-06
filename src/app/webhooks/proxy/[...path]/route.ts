/**
 * Proxy transparente hacia el Cerebro.
 * Mantiene oculta la URL real de Cloud Run.
 *
 * Rutas cubiertas (via next.config rewrite o directamente):
 *   /webhooks/metricas/:subdominio   → handler interno (direct call)
 *   /webhooks/external-data/:sub     → handler interno (direct call)
 *   /webhooks/config/:locationId     → Ya existe nativo en /webhooks/config/[locationId]
 *
 * Usage: acceso via POST leadmaster.com.co/webhooks/proxy/metricas/:sub
 * (La documentación apunta al proxy, nunca al Cerebro directamente)
 */

import { NextResponse } from "next/server";
import { POST as metricasHandler } from "@/app/webhooks/metricas/[locationId]/route";
import { POST as externalDataHandler } from "@/app/webhooks/external-data/[locationId]/route";

const CEREBRO_BASE = process.env.CEREBRO_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const ALLOWED_PREFIXES = ["twilio", "ghl", "fathom", "chat", "retry-orphan"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const prefix = path[0] ?? "";

  // metricas y external-data viven en la app Next.js — llamar al handler directo
  if (prefix === "metricas" || prefix === "external-data") {
    const locationId = path[1] ?? "";
    if (!locationId) {
      return NextResponse.json({ error: "locationId requerido" }, { status: 400 });
    }
    try {
      const handler = prefix === "metricas" ? metricasHandler : externalDataHandler;
      return await handler(req, { params: Promise.resolve({ locationId }) });
    } catch (err) {
      console.error(`[WebhookProxy] Error calling ${prefix} handler:`, err);
      return NextResponse.json({ error: "Internal handler error" }, { status: 500 });
    }
  }

  if (!ALLOWED_PREFIXES.includes(prefix)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!CEREBRO_BASE) {
    console.error("[WebhookProxy] CEREBRO_INTERNAL_URL no configurado");

    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const target = `${CEREBRO_BASE}/webhooks/${path.join("/")}`;

  try {
    const body = await req.text();
    const headers: Record<string, string> = {
      "content-type": req.headers.get("content-type") ?? "application/json",
    };
    // Pasar x-api-key si viene
    const apiKey = req.headers.get("x-api-key");
    if (apiKey) headers["x-api-key"] = apiKey;

    const response = await fetch(target, {
      method: "POST",
      headers,
      body,
    });

    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[WebhookProxy] Error forwarding to Cerebro:", err);
    return NextResponse.json({ error: "Upstream error" }, { status: 502 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const prefix = path[0] ?? "";

  if (!ALLOWED_PREFIXES.includes(prefix)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!CEREBRO_BASE) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const target = `${CEREBRO_BASE}/webhooks/${path.join("/")}`;
  const qs = new URL(req.url).search;

  try {
    const headers: Record<string, string> = {};
    const apiKey = req.headers.get("x-api-key");
    if (apiKey) headers["x-api-key"] = apiKey;

    const response = await fetch(`${target}${qs}`, { method: "GET", headers });
    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[WebhookProxy] Error forwarding to Cerebro:", err);
    return NextResponse.json({ error: "Upstream error" }, { status: 502 });
  }
}
