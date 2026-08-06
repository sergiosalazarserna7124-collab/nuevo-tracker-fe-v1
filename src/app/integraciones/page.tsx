"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Zap, Shield, Database, FileJson } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-config";

const LOGO_URL =
  "https://i.postimg.cc/pXJdGQmv/Gemini-Generated-Image-4vedz84vedz84ved.png";

export default function IntegracionesPage() {
  const webhookUrl = `${API_BASE_URL.replace(/\/$/, "")}/webhooks/external-data/{tu-subdominio}`;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-[Inter,sans-serif]">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-0.5">
              <Image
                src={LOGO_URL}
                alt="LeadMaster"
                width={40}
                height={40}
                className="scale-110 object-contain"
              />
            </span>
            <span className="text-lg font-bold">LeadMaster</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-12 flex items-center gap-3">
          <div className="rounded-xl bg-blue-500/20 p-3">
            <Zap className="h-8 w-8 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Integraciones</h1>
            <p className="text-slate-400">
              Conecta tu facturación real con el dashboard vía API
            </p>
          </div>
        </div>

        <section className="mb-16">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <Database className="h-5 w-5 text-blue-400" />
            ¿Para qué sirve esta API?
          </h2>
          <p className="mb-4 leading-relaxed text-slate-300">
            Hasta hoy, el sistema dependía de que la IA escuchara citas
            o llamadas y extrajera si se vendieron $500 o $1.000. Pero en la vida
            real, los dueños de negocio quieren ver en su dashboard la plata
            exacta que entró a su banco (Stripe, PayPal, su propio CRM).
          </p>
          <p className="leading-relaxed text-slate-300">
            Esta API <strong>no envía</strong> llamadas, chats ni citas. Esos
            canales siguen funcionando igual (Twilio, Fathom, GHL). Sirve única y
            exclusivamente para inyectar los números finales del negocio:
            ingresos, facturación real, cash collected, etc.
          </p>
        </section>

        <section className="mb-16">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <FileJson className="h-5 w-5 text-blue-400" />
            Endpoint y autenticación
          </h2>
          <p className="mb-4 text-slate-300">
            Cuando vendes el software a una empresa, generas una API Key desde tu
            panel de admin. Luego le indicas al cliente (o a quien maneje
            Zapier/Make):
          </p>
          <blockquote className="mb-6 rounded-xl border border-white/10 bg-slate-900/50 p-6 italic text-slate-300">
            &quot;Para que el dashboard muestre tu facturación real, envía un POST
            a esta URL todos los días:&quot;
          </blockquote>

          <div className="mb-4 rounded-xl border border-white/10 bg-slate-900/80 p-4 font-mono text-sm">
            <div className="mb-2 text-slate-500">URL:</div>
            <code className="break-all text-blue-400">{webhookUrl}</code>
          </div>
          <p className="mb-4 text-sm text-slate-400">
            Reemplaza <code className="rounded bg-slate-800 px-1.5 py-0.5">{`{tu-subdominio}`}</code> por el
            subdominio del cliente (ej. si accede a{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5">acme.leadmaster.com.co</code>, usa{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5">acme</code>).
          </p>

          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="mb-2 flex items-center gap-2 font-medium text-amber-400">
              <Shield className="h-4 w-4" />
              Header de seguridad
            </div>
            <p className="text-sm text-slate-300">
              Deben enviar el header <code className="rounded bg-slate-800 px-1.5 py-0.5">x-api-key</code> con el
              token que les generaste (ej. <code className="rounded bg-slate-800 px-1.5 py-0.5">lm_live_abc123...</code>).
              Si no lo envían, el Cerebro rechaza la petición.
            </p>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <FileJson className="h-5 w-5 text-blue-400" />
            Cuerpo del request (JSON)
          </h2>
          <p className="mb-4 text-slate-300">
            Los datos se guardan por día para que el filtro de fechas del
            dashboard funcione correctamente (Hoy, Últimos 7 días, Último mes).
          </p>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/80 p-6 text-sm text-slate-300">
{`{
  "data": [
    {
      "fecha": "2026-03-02",
      "metricas": {
        "facturacion": 1500,
        "cash_collected": 500,
        "ingresos_extra": 200
      }
    }
  ]
}`}
          </pre>
          <ul className="mt-4 space-y-2 text-sm text-slate-400">
            <li>
              • <strong className="text-slate-300">fecha</strong>: formato{" "}
              <code>YYYY-MM-DD</code>
            </li>
            <li>
              • <strong className="text-slate-300">metricas</strong>: objeto con
              claves numéricas. Las más usadas:{" "}
              <code>facturacion</code>, <code>cash_collected</code>,{" "}
              <code>ingresos</code>
            </li>
            <li>
              • Puedes enviar varios días en un solo request (array de objetos)
            </li>
          </ul>
        </section>

        <section className="rounded-xl border border-white/10 bg-slate-900/30 p-6">
          <h3 className="mb-2 font-semibold">Ejemplo con cURL</h3>
          <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-400">
{`curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: lm_live_TU_TOKEN_AQUI" \\
  -d '{
    "data": [
      { "fecha": "2026-03-02", "metricas": { "facturacion": 1500, "cash_collected": 500 } }
    ]
  }'`}
          </pre>
        </section>

        <div className="mt-12 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-medium transition-colors hover:bg-blue-500"
          >
            Iniciar Sesión
          </Link>
        </div>
      </main>
    </div>
  );
}
