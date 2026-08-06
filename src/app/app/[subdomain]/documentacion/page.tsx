"use client";

// AUT-1737: ocultar "Costos de IA". Cambiar a `true` para reactivar.
const MOSTRAR_COSTOS_IA = false;

import { useState } from "react";
import PageHeader from "@/components/dashboard/PageHeader";
import { useApiData } from "@/hooks/useApiData";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Zap,
  Globe,
  Brain,
  Key,
  Copy,
  Check,
  MessageSquare,
  ArrowRight,
  Shield,
  Cpu,
  BarChart3,
  Tag,
  HelpCircle,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { WEBHOOK_PROXY_URL } from "@/lib/api-config";

interface SystemConfig {
  chat_triggers: { trigger: string; accion: string; valor: string }[];
  embudo_personalizado: { id: string; nombre: string; color?: string; orden: number }[];
  has_openai_key: boolean;
}

function CodeBlock({ code, language = "json" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg overflow-hidden border border-surface-500 bg-[#0d1117]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-700/80 border-b border-surface-500">
        <span className="text-[10px] font-mono text-gray-400 uppercase">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-accent-green" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[12px] leading-relaxed font-mono text-gray-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function TriggerSection({ triggers }: { triggers: SystemConfig["chat_triggers"] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-purple/20 flex items-center justify-center shrink-0">
          <MessageSquare className="w-5 h-5 text-accent-purple" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Triggers de Chat por Emoji</h3>
          <p className="text-sm text-gray-400 mt-1">
            Los asesores pueden cambiar el estado de un lead directamente desde el chat enviando un emoji configurado.
            Sin necesidad de IA, sin latencia, sin costo adicional.
          </p>
        </div>
      </div>

      <Card className="bg-surface-700/50 border-surface-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent-amber" />
            ¿Cómo funciona?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-accent-cyan/20 text-accent-cyan flex items-center justify-center text-xs font-bold">1</span>
            <span>El asesor envía un emoji como mensaje en el chat de WhatsApp.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-accent-cyan/20 text-accent-cyan flex items-center justify-center text-xs font-bold">2</span>
            <span>LeadMaster detecta automáticamente el trigger en los mensajes del agente.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-accent-cyan/20 text-accent-cyan flex items-center justify-center text-xs font-bold">3</span>
            <span>El estado del lead se actualiza dinámicamente sin intervención de IA.</span>
          </div>
        </CardContent>
      </Card>

      {triggers.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Tus triggers configurados
          </h4>
          <div className="rounded-lg border border-surface-500 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-700 text-left text-gray-400">
                  <th className="px-3 py-2 font-medium">Trigger</th>
                  <th className="px-3 py-2 font-medium">Acción</th>
                  <th className="px-3 py-2 font-medium">Nuevo estado</th>
                </tr>
              </thead>
              <tbody>
                {triggers.map((t, i) => (
                  <tr key={i} className="border-t border-surface-500">
                    <td className="px-3 py-2">
                      <span className="text-2xl">{t.trigger}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-400">{t.accion}</td>
                    <td className="px-3 py-2">
                      <Badge>{t.valor}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <Card className="bg-surface-700/30 border-surface-500 border-dashed">
          <CardContent className="py-6 text-center text-gray-500 text-sm">
            No tienes triggers configurados aún. Ve a <strong className="text-accent-cyan">Control del sistema</strong> → paso 8 para crearlos.
          </CardContent>
        </Card>
      )}

      <Card className="bg-accent-purple/5 border-accent-purple/20">
        <CardContent className="py-3 text-sm text-gray-300 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-accent-purple shrink-0 mt-0.5" />
          <span>
            <strong>Ejemplo:</strong> Si el asesor envía <span className="text-xl mx-1">💰</span> en el chat,
            el estado del lead cambia automáticamente a <Badge className="mx-1">Cerrada</Badge> en tu panel.
          </span>
        </CardContent>
      </Card>
    </div>
  );
}

function WebhookMetricasSection() {
  const subdominio = typeof window !== "undefined"
    ? window.location.hostname.replace(`.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "leadmaster.com.co"}`, "").replace(".localhost", "")
    : "tu-subdominio";
  const webhookUrl = `${WEBHOOK_PROXY_URL}/metricas/${subdominio}`;

  const [apiKeys, setApiKeys] = useState<{ id_key: number; nombre_key: string; token: string; activa: boolean }[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadKeys = async () => {
    setLoadingKeys(true);
    try {
      const res = await fetch("/api/data/api-keys");
      if (res.ok) {
        const data = await res.json() as { keys: typeof apiKeys };
        setApiKeys(data.keys ?? []);
      }
    } finally { setLoadingKeys(false); }
  };

  useState(() => { void loadKeys(); });

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const res = await fetch("/api/data/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_key: newKeyName.trim() }),
      });
      if (res.ok) { setNewKeyName(""); await loadKeys(); }
    } finally { setCreatingKey(false); }
  };

  const copyKey = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedKey(token);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const firstKey = apiKeys[0]?.token ?? "TU_API_KEY";

  const exampleBody = JSON.stringify({
    ventas_cerradas: 3,
    facturacion_total: 15000,
    leads_calificados: 12,
    fecha: "2026-04-08T14:30:00-05:00"
  }, null, 2);

  const exampleBodyAtribuido = JSON.stringify({
    ventas_cerradas: 1,
    fecha: "2026-04-08T14:30:00-05:00",
    userId: "GHL_USER_ID_DEL_ASESOR",
    customerId: "GHL_CONTACT_ID_DEL_CLIENTE"
  }, null, 2);

  const curlExample = `curl -X POST \\
  "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${firstKey}" \\
  -d '${exampleBody}'`;

  const curlAtribuidoExample = `# Con atribución a asesor (userId) y/o cliente (customerId):
curl -X POST \\
  "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${firstKey}" \\
  -d '${exampleBodyAtribuido}'`;

  const n8nExample = `// En n8n → nodo HTTP Request:
URL: ${webhookUrl}
Method: POST
Headers:
  x-api-key: ${firstKey}
  Content-Type: application/json
Body (JSON):
{
  "ventas_cerradas": {{ $json.cierres }},
  "leads_nuevos": {{ $json.leads }},
  "fecha": "{{ $now.toISO() }}",
  "userId": "{{ $json.ghl_user_id }}",
  "customerId": "{{ $json.ghl_contact_id }}"
}`;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-accent-cyan" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Webhook de Métricas Personalizadas</h3>
          <p className="text-sm text-gray-400 mt-1">
            Envía cualquier número desde cualquier sistema externo (n8n, GHL, Zapier, tu código) y aparece automáticamente como métrica en tu panel.
          </p>
        </div>
      </div>

      {/* URL + API Key juntas */}
      <Card className="bg-surface-700/50 border-surface-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-300">Tu URL de webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-[#0d1117] px-3 py-2 border border-surface-500">
            <Badge variant="default" className="shrink-0">POST</Badge>
            <code className="text-sm text-accent-cyan font-mono break-all">{webhookUrl}</code>
          </div>

          {/* Gestor de API Keys inline */}
          <div className="space-y-2 pt-1">
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-accent-amber" />
              Incluye el header <code className="bg-surface-700 px-1 py-0.5 rounded text-accent-cyan">x-api-key</code> con una de tus API Keys:
            </p>
            {loadingKeys ? (
              <p className="text-xs text-gray-500 animate-pulse pl-1">Cargando keys...</p>
            ) : apiKeys.length === 0 ? (
              <p className="text-xs text-amber-400 pl-1">⚠️ No tienes API Keys — crea una abajo para poder usar el webhook.</p>
            ) : (
              <div className="space-y-1.5">
                {apiKeys.map((k) => (
                  <div key={k.id_key} className="flex items-center gap-2 rounded-lg bg-surface-600/60 px-3 py-1.5 text-xs">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-white mr-2">{k.nombre_key}</span>
                      <span className="font-mono text-gray-500">{k.token.slice(0, 24)}...</span>
                    </div>
                    <button type="button" onClick={() => copyKey(k.token)} title="Copiar token completo"
                      className="shrink-0 text-gray-400 hover:text-accent-cyan transition-colors">
                      {copiedKey === k.token ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void createKey()}
                placeholder="Nombre de la nueva key (ej: n8n producción)"
                className="flex-1 rounded-lg bg-surface-600 border border-surface-500 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-accent-cyan"
              />
              <button type="button" onClick={() => void createKey()} disabled={creatingKey || !newKeyName.trim()}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-amber/80 text-black text-xs font-semibold disabled:opacity-50 hover:bg-accent-amber transition-colors">
                <Plus className="w-3.5 h-3.5" /> {creatingKey ? "..." : "Crear key"}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-surface-700/50 border-surface-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-300">¿Cómo funciona?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-400 space-y-2">
          <p>Envía un JSON con los campos que quieras. Los nombres de los campos son libres — el sistema los guarda tal cual y los muestra en tus métricas personalizadas.</p>
          <div className="space-y-1 text-xs">
            <div className="flex items-start gap-2">
              <span className="text-accent-cyan font-bold shrink-0">1.</span>
              <span>Crea una métrica personalizada de tipo "Manual" en <strong className="text-white">Sistema → Paso 5</strong> con el mismo nombre del campo que vas a enviar.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-accent-cyan font-bold shrink-0">2.</span>
              <span>Configura tu sistema externo (n8n, GHL automation, Zapier) para hacer POST a esta URL con los campos correspondientes.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-accent-cyan font-bold shrink-0">3.</span>
              <span>Los datos llegan en segundos y aparecen en tu panel ejecutivo y de rendimiento.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Ejemplo de body</h4>
        <CodeBlock code={exampleBody} language="json" />
      </div>

      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Ejemplo cURL — listo para copiar</h4>
        <CodeBlock code={curlExample} language="bash" />
      </div>

      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Ejemplo n8n</h4>
        <CodeBlock code={n8nExample} language="javascript" />
      </div>

      {/* Atribución a asesor/cliente */}
      <Card className="bg-accent-purple/5 border-accent-purple/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white flex items-center gap-2">
            <span>👤</span> Atribución a asesor o cliente <span className="text-[10px] font-normal text-accent-cyan bg-accent-cyan/10 px-1.5 py-0.5 rounded-full ml-1">Nuevo</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-gray-400 space-y-3">
          <p>Si activas <strong className="text-white">"Atribuible a asesor / cliente"</strong> en la configuración de la métrica (Sistema → Paso 5), puedes incluir dos campos reservados en el body del webhook:</p>
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <code className="shrink-0 bg-surface-600 px-1.5 py-0.5 rounded text-accent-cyan font-mono">userId</code>
              <span>ID del asesor/closer en GHL. La métrica se suma a esa persona y podrás ver el desglose por asesor.</span>
            </div>
            <div className="flex items-start gap-2">
              <code className="shrink-0 bg-surface-600 px-1.5 py-0.5 rounded text-accent-cyan font-mono">customerId</code>
              <span>ID del contacto/cliente en GHL. Permite saber a qué cliente corresponde cada entrada.</span>
            </div>
          </div>
          <p className="text-[11px]">Cuando envías <code className="text-accent-cyan">userId</code>, el sistema guarda la entrada individualmente <strong className="text-white">y</strong> acumula en el total global de la cuenta. Cambiar el rango de fechas en el panel siempre muestra el total correcto.</p>
          <CodeBlock code={curlAtribuidoExample} language="bash" />
        </CardContent>
      </Card>

      <Card className="bg-accent-cyan/5 border-accent-cyan/20">
        <CardContent className="pt-4 text-xs text-gray-400 space-y-1">
          <p>✅ El campo <code className="text-accent-cyan">fecha</code> es opcional — si no lo envías, se usa la fecha de hoy.</p>
          <p>✅ Sin <code className="text-accent-cyan">userId</code>: si envías la misma fecha dos veces, el valor se actualiza (no se duplica).</p>
          <p>✅ Con <code className="text-accent-cyan">userId</code>: cada envío es una entrada nueva acumulable.</p>
          <p>✅ Puedes enviar múltiples campos en el mismo request.</p>
          <p>✅ Los valores deben ser números (enteros o decimales).</p>
          <p>⚠️ Para que aparezcan en el panel, crea primero la métrica en <strong className="text-white">Sistema → Paso 5</strong> con el mismo nombre del campo.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function FaqSection() {
  const faqs = [
    {
      q: "Pongo las mismas fechas en el panel ejecutivo, en llamadas y en el panel asesor, pero me salen números distintos. ¿Está fallando algo?",
      a: "No, es que cada panel mide una cosa diferente y usa su propia fecha de referencia. El panel ejecutivo cuenta las citas por la fecha en que está programada la cita. El panel de llamadas cuenta por la fecha en que se realizó la llamada. El panel asesor cuenta por la fecha en que el lead tuvo actividad. Si un lead entró el lunes, lo llamaste el miércoles y la cita quedó para el viernes, ese lead aparece en distintos paneles según qué rango de fechas uses. Lo más confiable es usar el mismo rango amplio en todos los paneles (por ejemplo, todo el mes) para ver el cuadro completo.",
    },
    {
      q: "Tengo un asesor que aparece dos veces en la lista (ej: Héctor y Héctor). ¿Por qué?",
      a: "Pasa cuando el mismo asesor tiene el nombre escrito de formas distintas en distintos flujos de GHL: con tilde y sin tilde, con mayúscula y sin ella, con apellido completo en unos y abreviado en otros (ej: 'François González' vs 'Francois Gonzalez'). El sistema lo detecta como dos personas. Para unificarlos, escríbenos indicando el nombre 'incorrecto' y el nombre 'correcto' y lo fusionamos en todos los registros.",
    },
    {
      q: "En chats sale 'Sin asignar' o aparece el nombre 'Agente' en todos los clientes. ¿Por qué?",
      a: "El nombre 'Agente' aparece cuando el primer mensaje del chat es del bot o del sistema, no de un asesor real. Cuando el asesor humano retoma la conversación, el registro se actualiza automáticamente. Si persiste 'Sin asignar', revisa que el asesor esté correctamente asignado en GHL al contacto. No necesitas hacer nada manual, el sistema se actualiza solo cuando llega el siguiente mensaje del asesor.",
    },
    {
      q: "Los datos no llegan o parece que llevan mucho tiempo sin actualizarse. ¿Qué hago?",
      a: "Si notas que un cliente lleva más de 24 horas sin datos nuevos (sin llamadas, sin citas, sin chats) y sí hubo actividad real en GHL, comunícate con el equipo técnico indicando el nombre del cliente y aproximadamente desde cuándo dejaron de llegar datos. Puede ser que la automatización de GHL se desactivó o el webhook dejó de apuntar a la URL correcta.",
    },
    {
      q: "Los ingresos dicen $0 pero sí hubo ventas. ¿Por qué?",
      a: "El sistema toma los ingresos de las citas marcadas como 'cerradas' con su facturación registrada. Si el campo de facturación no se llenó en GHL al momento del cierre, o si la cita quedó en una etapa diferente a 'Cerrada/Ganada', los ingresos aparecen en $0. Verifica que al marcar una venta en GHL se esté enviando también el valor de facturación en el webhook.",
    },
    {
      q: "Tengo la API Externa activada y el Panel Ejecutivo muestra ingresos, pero las comisiones aparecen en $0. ¿Por qué?",
      a: "El módulo de comisiones siempre calcula sobre los datos nativos del sistema (citas y llamadas registradas vía Fathom/Twilio), sin importar si tienes activada la fuente de datos externa. La API Externa solo afecta cómo se muestran los KPIs de ingresos en el Panel Ejecutivo, no la base de cálculo de comisiones. Para que las comisiones funcionen, los cierres deben estar registrados como citas en el sistema nativo con el valor de facturación correspondiente.",
    },
    {
      q: "¿Por qué el análisis de IA no siempre clasifica las llamadas?",
      a: "El análisis de IA solo se activa en llamadas efectivas (contestadas). Las llamadas muy cortas (menos de 80 caracteres de transcripción), los buzones de voz y las llamadas donde solo habla el asesor sin respuesta real del cliente se clasifican automáticamente como 'seguimiento' sin consumir IA. Esto es intencional para ahorrar costos.",
    },
    {
      q: "¿Con qué frecuencia se actualizan los datos?",
      a: "Las llamadas y citas llegan en tiempo real (máximo 1-2 minutos de demora). El análisis de IA de chats se hace una vez al día a las 9 AM hora Colombia. Los no-shows se marcan automáticamente cada noche a las 2 AM hora local de cada cuenta. Los datos de ads se sincronizan cada día a las 6 AM hora Colombia.",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-amber/20 flex items-center justify-center shrink-0">
          <HelpCircle className="w-5 h-5 text-accent-amber" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Preguntas frecuentes</h3>
          <p className="text-sm text-gray-400 mt-1">Las dudas más comunes sobre cómo funciona el sistema.</p>
        </div>
      </div>
      <div className="space-y-3">
        {faqs.map((faq, i) => (
          <Card key={i} className="bg-surface-700/50 border-surface-500">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm text-white font-medium leading-snug">❓ {faq.q}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-400 leading-relaxed">{faq.a}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ApiSection() {
  const [apiKeys, setApiKeys] = useState<{ id_key: number; nombre_key: string; token: string; activa: boolean; created_at: string }[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadKeys = async () => {
    setLoadingKeys(true);
    try {
      const res = await fetch("/api/data/api-keys");
      if (res.ok) {
        const data = await res.json() as { keys: typeof apiKeys };
        setApiKeys(data.keys);
      }
    } finally { setLoadingKeys(false); }
  };

  useState(() => { void loadKeys(); });

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const res = await fetch("/api/data/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_key: newKeyName.trim() }),
      });
      if (res.ok) { setNewKeyName(""); await loadKeys(); }
    } finally { setCreatingKey(false); }
  };

  const deleteKey = async (id: number) => {
    await fetch(`/api/data/api-keys?id=${id}`, { method: "DELETE" });
    await loadKeys();
  };

  const copyKey = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedKey(token);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const examplePayload = JSON.stringify({
    data: [{ fecha: "2025-12-15", metricas: { facturacion: 15000000, cash_collected: 8500000, ingresos: 15000000 } }]
  }, null, 2);

  const subdominio = typeof window !== "undefined"
    ? window.location.hostname.replace(`.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "leadmaster.com.co"}`, "").replace(".localhost", "")
    : "tu-subdominio";
  const webhookUrl = `${WEBHOOK_PROXY_URL}/external-data/${subdominio}`;
  const curlExample = `curl -X POST \\
  "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: TU_API_KEY_AQUÍ" \\
  -d '${examplePayload}'`;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-green/20 flex items-center justify-center shrink-0">
          <Globe className="w-5 h-5 text-accent-green" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">API Externa de Ingresos</h3>
          <p className="text-sm text-gray-400 mt-1">
            Conecta tu sistema de facturación, CRM o ERP para inyectar datos financieros reales a tu panel LeadMaster.
          </p>
        </div>
      </div>

      {/* Gestor de API Keys */}
      <Card className="bg-surface-700/50 border-surface-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
            <Key className="w-4 h-4 text-accent-amber" />
            Tus API Keys
            <button type="button" onClick={() => void loadKeys()} className="ml-auto text-gray-500 hover:text-white transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingKeys ? (
            <p className="text-xs text-gray-500 animate-pulse">Cargando...</p>
          ) : apiKeys.length === 0 ? (
            <p className="text-xs text-gray-500">No tienes API keys todavía. Crea una abajo.</p>
          ) : (
            <div className="space-y-2">
              {apiKeys.map((k) => (
                <div key={k.id_key} className="flex items-center gap-2 rounded-lg bg-surface-600/60 px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{k.nombre_key}</p>
                    <p className="font-mono text-gray-500 truncate">{k.token.slice(0, 20)}...</p>
                  </div>
                  <button type="button" onClick={() => copyKey(k.token)} title="Copiar token" className="shrink-0 text-gray-400 hover:text-accent-cyan transition-colors">
                    {copiedKey === k.token ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button type="button" onClick={() => void deleteKey(k.id_key)} title="Eliminar" className="shrink-0 text-gray-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void createKey()}
              placeholder="Nombre de la key (ej: n8n producción)"
              className="flex-1 rounded-lg bg-surface-600 border border-surface-500 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-accent-cyan"
            />
            <button type="button" onClick={() => void createKey()} disabled={creatingKey || !newKeyName.trim()}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-green text-black text-xs font-semibold disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" /> {creatingKey ? "..." : "Crear"}
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-surface-700/50 border-surface-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-300">Endpoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-[#0d1117] px-3 py-2 border border-surface-500">
            <Badge variant="default" className="shrink-0">POST</Badge>
            <code className="text-sm text-accent-cyan font-mono break-all">
              {webhookUrl}
            </code>
          </div>
          <p className="text-xs text-gray-500">
            Esta es tu URL exacta. Incluye el header <code className="bg-surface-700 px-1.5 py-0.5 rounded text-accent-cyan">x-api-key</code> con el token de arriba.
          </p>
        </CardContent>
      </Card>

      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Payload de ejemplo</h4>
        <CodeBlock code={examplePayload} language="json" />
      </div>

      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Ejemplo cURL</h4>
        <CodeBlock code={curlExample} language="bash" />
      </div>

      <Card className="bg-accent-green/5 border-accent-green/20">
        <CardContent className="pt-4 text-xs text-gray-400 space-y-1">
          <p>✅ Puedes enviar múltiples fechas en un solo request (array <code className="text-accent-cyan">data</code>).</p>
          <p>✅ Los campos de métricas son flexibles — usa los nombres que quieras: <code className="text-accent-cyan">ingresos</code>, <code className="text-accent-cyan">facturacion</code>, <code className="text-accent-cyan">cash_collected</code>, etc.</p>
          <p>✅ Si envías la misma fecha dos veces, se crea un registro adicional (no sobreescribe).</p>
          <p>⚠️ Activa la fuente de datos externa en <strong className="text-white">Control del sistema → paso 3</strong> para que el panel muestre estos datos en lugar de los nativos.</p>
        </CardContent>
      </Card>

      <Card className="bg-accent-amber/5 border-accent-amber/30">
        <CardContent className="pt-4 text-xs text-amber-300 space-y-1.5">
          <p className="font-semibold text-accent-amber">⚠️ Limitación actual: Comisiones y API Externa</p>
          <p>El módulo de <strong className="text-white">Comisiones</strong> siempre calcula sobre los datos nativos del sistema (llamadas y citas de Fathom/Twilio), independientemente de si tienes API Externa activada.</p>
          <p>Si tu equipo registra cierres <strong className="text-white">exclusivamente</strong> vía API externa, las comisiones aparecerán en $0. Para que las comisiones funcionen, los cierres deben estar registrados como citas o llamadas en el sistema nativo.</p>
          <p className="text-gray-500">Para ventas por closer vía API externa, contacta al equipo técnico.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function EmbudoSection() {
  const flujos = [
    {
      icon: "📞",
      titulo: "Llamadas telefónicas",
      pasos: [
        "Asesor llama desde Twilio o GHL",
        "Al finalizar, GHL envía el audio o la transcripción al sistema",
        "IA transcribe (si es necesario) y clasifica la llamada: contestó/no contestó, estado del lead",
        "El resultado aparece en tu panel en segundos",
      ],
      color: "accent-cyan",
    },
    {
      icon: "🎥",
      titulo: "Citas (Fathom)",
      pasos: [
        "Asesor realiza la cita con Fathom activo",
        "Fathom genera automáticamente el resumen y la transcripción",
        "El sistema recibe la transcripción y la analiza con IA",
        "Se registra el resultado en el panel: asistió, propuesta enviada, cerrada, etc.",
      ],
      color: "accent-purple",
    },
    {
      icon: "💬",
      titulo: "Chats (WhatsApp / Instagram)",
      pasos: [
        "El lead escribe por WhatsApp o Instagram a tu número en GHL",
        "El mensaje llega en tiempo real al sistema",
        "Cada noche a las 9 AM, la IA analiza las conversaciones del día y clasifica el estado de cada lead",
        "El asesor asignado aparece automáticamente según quién respondió",
      ],
      color: "accent-green",
    },
    {
      icon: "📅",
      titulo: "Citas y agendas",
      pasos: [
        "Cuando un lead agenda en GHL, se envía automáticamente al sistema",
        "Se registra como 'Agendada' y aparece en el panel",
        "Si la cita pasa sin marcarse como asistida, al día siguiente se marca como 'No Show' automáticamente",
        "Al marcar como asistida/cerrada en GHL, el sistema se actualiza",
      ],
      color: "accent-amber",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 flex items-center justify-center shrink-0">
          <Brain className="w-5 h-5 text-accent-cyan" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Cómo fluye la información</h3>
          <p className="text-sm text-gray-400 mt-1">
            Todo viene de GHL. El sistema recibe los datos, los procesa con IA y los muestra en tu panel en tiempo real.
          </p>
        </div>
      </div>

      {flujos.map((flujo) => (
        <Card key={flujo.titulo} className="bg-surface-700/50 border-surface-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white flex items-center gap-2">
              <span className="text-lg">{flujo.icon}</span> {flujo.titulo}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {flujo.pasos.map((paso, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-gray-400">
                <span className={`text-${flujo.color} font-bold shrink-0`}>{i + 1}.</span>
                <span>{paso}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card className="bg-accent-cyan/5 border-accent-cyan/20">
        <CardContent className="pt-4 text-xs text-gray-400 space-y-1">
          <p>📊 <strong className="text-white">Panel ejecutivo</strong> — resumen de todo: leads, llamadas, citas, ingresos. Fecha de referencia: fecha de la cita.</p>
          <p>📞 <strong className="text-white">Rendimiento → Llamadas</strong> — detalle de cada llamada. Fecha de referencia: cuándo se realizó la llamada.</p>
          <p>🎥 <strong className="text-white">Rendimiento → Citas</strong> — detalle de cada cita. Fecha de referencia: fecha de la cita.</p>
          <p>👤 <strong className="text-white">Panel asesor</strong> — vista individual por asesor. Fecha de referencia: cuándo tuvo actividad el lead.</p>
          <p className="text-gray-500 pt-1">⚠️ Por esto los números pueden variar ligeramente entre paneles con el mismo rango de fechas — cada uno mide un momento diferente del proceso.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function EtiquetasSection() {
  const configEndpoint = `${WEBHOOK_PROXY_URL}/config/:subdominio`;
  const curlConfigExample = `curl -X GET \\
  "${WEBHOOK_PROXY_URL}/config/tu-subdominio" \\
  -H "x-api-key: TU_API_KEY_AQUÍ"`;

  const responseExample = JSON.stringify(
    {
      ok: true,
      id_cuenta: 1,
      subdominio: "tu-subdominio",
      reglas_etiquetas: [
        { id: "r1", condicion: "interes_alto", acciones: [{ tipo: "asignar_etiqueta", valor: "lead_caliente" }, { tipo: "etapa_cambiada", funnelStage: "Ofertada" }], fuentes: ["llamadas", "videollamadas", "chats"] },
        { id: "r2", condicion: "objecion_precio", acciones: [{ tipo: "asignar_etiqueta", valor: "objecion_precio" }], fuentes: ["llamadas"] },
        { id: "r3", condicion: "mencion_precio", acciones: [{ tipo: "incrementar_metrica", metrica_id: "m1", metrica_incremento: 1 }], fuentes: ["videollamadas"] },
      ],
      embudo_personalizado: [
        { id: "e1", nombre: "Agendada", orden: 1 },
        { id: "e2", nombre: "Ofertada", orden: 2 },
        { id: "e3", nombre: "Cerrada", orden: 3 },
      ],
      prompts: { llamadas: "...", videollamadas: "...", ventas: "..." },
    },
    null,
    2,
  );

  const CONDITIONS_DESCRIPTION = [
    { key: "interes_alto", label: "Interés alto", desc: "La IA detecta alto interés en comprar" },
    { key: "mencion_precio", label: "Mención de precio", desc: "El lead preguntó por el precio" },
    { key: "objecion_precio", label: "Objeción de precio", desc: "El lead objetó el precio" },
    { key: "objecion_tiempo", label: "Objeción de tiempo", desc: "\"Ahora no es buen momento\"" },
    { key: "enojo", label: "Enojo / frustración", desc: "Tono negativo detectado" },
    { key: "solicitud_propuesta", label: "Solicita propuesta", desc: "Pide presupuesto o propuesta" },
    { key: "duracion_mayor", label: "Duración extendida", desc: "Llamada más larga de lo habitual" },
    { key: "intentos_mayor", label: "Varios intentos", desc: "Múltiples intentos de contacto" },
    { key: "speed_mayor", label: "Speed to lead alto", desc: "Tardanza en el primer contacto" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-amber/20 flex items-center justify-center shrink-0">
          <Tag className="w-5 h-5 text-accent-amber" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Reglas de Etiquetas — Integración Cerebro</h3>
          <p className="text-sm text-gray-400 mt-1">
            Cómo el Cerebro debe obtener y aplicar las reglas de etiquetas configuradas en este panel.
          </p>
        </div>
      </div>

      <Card className="bg-accent-amber/5 border-accent-amber/30">
        <CardContent className="py-3 text-sm text-gray-300 flex items-start gap-2">
          <Shield className="w-4 h-4 text-accent-amber shrink-0 mt-0.5" />
          <span>
            <strong className="text-accent-amber">Importante:</strong> Las etiquetas que el Cerebro asigna a{" "}
            <code className="bg-surface-700 px-1 py-0.5 rounded text-xs">tags_internos</code> deben
            provenir de las <strong>reglas configuradas en el paso 4 del Sistema</strong>, NO de
            contenido libre generado por la IA. Este endpoint te permite obtener las reglas actuales.
          </span>
        </CardContent>
      </Card>

      <Card className="bg-surface-700/50 border-surface-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
            <Globe className="w-4 h-4 text-accent-cyan" />
            Endpoint: Obtener configuración del tenant
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-[#0d1117] px-3 py-2 border border-surface-500">
            <Badge variant="default" className="shrink-0 bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30">GET</Badge>
            <code className="text-sm text-accent-cyan font-mono break-all">{configEndpoint}</code>
          </div>
          <p className="text-xs text-gray-500">
            Devuelve <code className="bg-surface-700 px-1 py-0.5 rounded text-accent-amber">reglas_etiquetas</code>,{" "}
            <code className="bg-surface-700 px-1 py-0.5 rounded text-accent-amber">embudo_personalizado</code>,{" "}
            <code className="bg-surface-700 px-1 py-0.5 rounded text-accent-amber">chat_triggers</code> y los prompts configurados.
            Requiere header <code className="bg-surface-700 px-1 py-0.5 rounded text-accent-cyan">x-api-key</code>.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-surface-700/50 border-surface-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-accent-cyan" />
            Flujo correcto para aplicar etiquetas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-400">
          {[
            { n: 1, text: "Cerebro recibe webhook de llamada o cita." },
            { n: 2, text: <>Llama a <code className="bg-surface-700 px-1 py-0.5 rounded text-accent-cyan">GET /webhooks/config/:subdominio</code> para obtener las reglas actuales.</> },
            { n: 3, text: "La IA evalúa la transcripción y detecta condiciones (ver tabla abajo)." },
            { n: 4, text: "Para cada regla cuya condición match, ejecutar TODAS las acciones de esa regla (acciones[]): asignar etiquetas, cambiar etapa, incrementar métricas." },
            { n: 5, text: "Verificar que el canal del evento está en fuentes[] de la regla (o que fuentes incluye los 3 canales = todas)." },
            { n: 6, text: "Si aplica, llamar al endpoint de GHL para sincronizar las etiquetas en el CRM." },
          ].map(({ n, text }) => (
            <div key={n} className="flex items-start gap-2">
              <span className="w-6 h-6 rounded-full bg-accent-cyan/20 text-accent-cyan flex items-center justify-center text-xs font-bold shrink-0">{n}</span>
              <span>{text}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Condiciones disponibles</h4>
        <div className="rounded-lg border border-surface-500 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-700 text-left text-gray-400">
                <th className="px-3 py-2 font-medium">Clave</th>
                <th className="px-3 py-2 font-medium">Label</th>
                <th className="px-3 py-2 font-medium hidden sm:table-cell">Descripción</th>
              </tr>
            </thead>
            <tbody>
              {CONDITIONS_DESCRIPTION.map((c, i) => (
                <tr key={c.key} className={i > 0 ? "border-t border-surface-500" : ""}>
                  <td className="px-3 py-2">
                    <code className="bg-surface-700 px-1 py-0.5 rounded text-accent-amber">{c.key}</code>
                  </td>
                  <td className="px-3 py-2 text-gray-300">{c.label}</td>
                  <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{c.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600 mt-1">Condiciones personalizadas: el usuario puede escribir cualquier texto libre — el Cerebro decide cómo evaluarlas.</p>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Ejemplo cURL</h4>
        <CodeBlock code={curlConfigExample} language="bash" />
      </div>

      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Respuesta de ejemplo</h4>
        <CodeBlock code={responseExample} language="json" />
      </div>
    </div>
  );
}

function MetricasSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-green/20 flex items-center justify-center shrink-0">
          <BarChart3 className="w-5 h-5 text-accent-green" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Métricas Personalizadas</h3>
          <p className="text-sm text-gray-400 mt-1">
            Crea métricas manuales (con campos), automáticas (fórmulas con KPIs) o fijas (valor constante).
            Sin IA, solo configuración.
          </p>
        </div>
      </div>

      <Card className="bg-surface-700/50 border-surface-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-300 flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent-green" />
            Tipos de métricas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-400">
          <div>
            <strong className="text-white">Manual:</strong> Define campos (texto, número, fecha, sí/no). Añade datos manualmente.
            Si tienes un campo fecha, se filtra por el rango del panel. Si hay número, se suma; si hay boolean, se cuentan los true.
          </div>
          <div>
            <strong className="text-white">Automática:</strong> Fórmula con KPIs u otras métricas. Operaciones: directo, suma, promedio,
            división, multiplicación, resta, condición (si X &gt; Y entonces Z sino W). Busca por nombre al elegir fuentes.
          </div>
          <div>
            <strong className="text-white">Fija:</strong> Valor constante siempre visible (ej. meta mensual = 100).
          </div>
        </CardContent>
      </Card>

      <Card className="bg-surface-700/50 border-surface-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-300">Ubicación</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-400">
          Cada métrica puede mostrarse en <strong className="text-white">Panel Ejecutivo</strong>, <strong className="text-white">Rendimiento</strong> (citas) o <strong className="text-white">Ambos</strong>.
        </CardContent>
      </Card>

      <Card className="bg-surface-700/50 border-surface-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-300">Orden y edición</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-400">
          Arrastra las métricas para ordenarlas. Haz clic en el icono de lápiz en cada tarjeta en el Dashboard o Rendimiento para editar.
          Al eliminar una métrica que alimenta a otras, verás un aviso: &quot;Esta métrica alimenta a X otras, si la eliminas esas fallarán&quot;.
        </CardContent>
      </Card>

      <Card className="bg-accent-green/5 border-accent-green/20">
        <CardContent className="py-3 text-sm text-gray-300">
          Para configurar métricas: <strong className="text-accent-cyan">Control del sistema</strong> → paso 5 (Métricas custom).
        </CardContent>
      </Card>
    </div>
  );
}

function BYOKSection({ hasKey }: { hasKey: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-amber/20 flex items-center justify-center shrink-0">
          <Key className="w-5 h-5 text-accent-amber" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Bring Your Own Key (OpenAI)</h3>
          <p className="text-sm text-gray-400 mt-1">
            Conecta tu propia API Key de OpenAI para procesar análisis de llamadas y citas sin límites
            ni colas compartidas.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-surface-500 bg-surface-700/50 px-4 py-3">
        <div className={`w-3 h-3 rounded-full ${hasKey ? "bg-accent-green animate-pulse" : "bg-gray-600"}`} />
        <span className="text-sm text-white font-medium">
          {hasKey ? "API Key conectada" : "Sin API Key propia"}
        </span>
        <Badge variant={hasKey ? "default" : "outline"}>
          {hasKey ? "Activa" : "No configurada"}
        </Badge>
      </div>

      <Card className="bg-surface-700/50 border-surface-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-300">Ventajas</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-start gap-2">
              <Zap className="w-4 h-4 text-accent-amber shrink-0 mt-0.5" />
              <span><strong className="text-white">Sin límites de procesamiento</strong> — Tus llamadas se procesan inmediatamente sin esperar cola.</span>
            </li>
            <li className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-accent-amber shrink-0 mt-0.5" />
              <span><strong className="text-white">Control total de costos</strong> — Pagas directamente a OpenAI según tu consumo real.</span>
            </li>
            <li className="flex items-start gap-2">
              <Cpu className="w-4 h-4 text-accent-amber shrink-0 mt-0.5" />
              <span><strong className="text-white">Modelo preferido</strong> — Acceso al modelo GPT más reciente disponible en tu cuenta de OpenAI.</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {!hasKey && (
        <Card className="bg-accent-amber/5 border-accent-amber/20">
          <CardContent className="py-3 text-sm text-gray-300">
            Para conectar tu API Key, ve a <strong className="text-accent-cyan">Control del sistema</strong> → paso 9 (OpenAI Key).
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CostosIASection() {
  const [chatsPerMonth, setChatsPerMonth] = useState(500);
  const [callMinutes, setCallMinutes] = useState(5);

  // GPT-4o-mini: $0.15/1M tokens entrada, $0.60/1M tokens salida
  // Estimado por chat: 500 tokens entrada + 100 tokens salida
  const costPerChat = (500 * 0.15 + 100 * 0.60) / 1_000_000;
  const monthlyChatCost = chatsPerMonth * costPerChat;

  // Whisper: $0.006/min
  const costPerMinuteWhisper = 0.006;
  const monthlyCallCost = callMinutes * costPerMinuteWhisper;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-amber/20 flex items-center justify-center shrink-0 text-xl">
          💰
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">Costos de IA</h3>
          <p className="text-sm text-gray-400 mt-0.5">
            Precios actuales de los modelos de IA que usa el sistema. Si usas tu propia API Key (BYOK), estos costos van directamente a tu cuenta de OpenAI.
          </p>
        </div>
      </div>

      {/* Tabla de precios */}
      <div className="rounded-xl border border-surface-500 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-700/60 text-left">
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">Modelo</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">Uso</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase">Precio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-600">
            <tr>
              <td className="px-4 py-2.5 text-white font-medium">GPT-4o-mini</td>
              <td className="px-4 py-2.5 text-gray-400">Clasificación de llamadas, citas y chats</td>
              <td className="px-4 py-2.5">
                <div className="text-accent-amber font-mono text-xs space-y-0.5">
                  <div>$0.15 / 1M tokens entrada</div>
                  <div>$0.60 / 1M tokens salida</div>
                </div>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-white font-medium">Whisper-1</td>
              <td className="px-4 py-2.5 text-gray-400">Transcripción de llamadas telefónicas (Twilio)</td>
              <td className="px-4 py-2.5 text-accent-amber font-mono text-xs">$0.006 / minuto</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Calculadora */}
      <div className="rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 p-4 space-y-4">
        <h4 className="text-sm font-semibold text-accent-cyan">🧮 Calculadora de costos</h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-300">¿Cuántos chats por mes?</label>
            <input
              type="number"
              min={0}
              value={chatsPerMonth}
              onChange={(e) => setChatsPerMonth(Math.max(0, Number(e.target.value)))}
              className="w-full rounded-lg bg-surface-600 border border-surface-500 px-3 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-cyan/40"
            />
            <p className="text-[11px] text-gray-500">
              Costo estimado: <span className="text-accent-amber font-semibold">~${monthlyChatCost.toFixed(4)} USD/mes</span>
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-300">Duración promedio de llamadas (min)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={callMinutes}
              onChange={(e) => setCallMinutes(Math.max(0, Number(e.target.value)))}
              className="w-full rounded-lg bg-surface-600 border border-surface-500 px-3 py-1.5 text-sm text-white focus:ring-2 focus:ring-accent-cyan/40"
            />
            <p className="text-[11px] text-gray-500">
              Costo Whisper por llamada: <span className="text-accent-amber font-semibold">~${monthlyCallCost.toFixed(4)} USD</span>
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-surface-700/60 border border-surface-500 px-3 py-2 text-xs text-gray-300 space-y-0.5">
          <p>📊 <strong className="text-white">Total estimado mensual (chats):</strong> <span className="text-accent-amber">~${monthlyChatCost.toFixed(3)} USD</span></p>
          <p className="text-gray-500 mt-1">💡 GPT-4o-mini es el modelo más eficiente y económico de OpenAI. Ideal para clasificación masiva.</p>
        </div>
      </div>

      <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/5 px-3 py-2.5 text-sm text-gray-400 space-y-1">
        <p className="font-semibold text-accent-amber">¿Quién paga estos costos?</p>
        <ul className="list-disc list-inside text-gray-500 space-y-0.5 text-xs">
          <li>Sin BYOK: los costos son de la plataforma (incluidos en tu plan).</li>
          <li>Con BYOK (tu API Key): los costos van directamente a tu cuenta de OpenAI. Tú tienes control total.</li>
        </ul>
      </div>
    </div>
  );
}

export default function DocumentacionPage() {
  const { data, loading } = useApiData<SystemConfig>("/api/data/system-config");

  const triggers = data?.chat_triggers ?? [];
  const embudo = data?.embudo_personalizado ?? [];
  const hasOpenAIKey = data?.has_openai_key ?? false;

  return (
    <>
      <PageHeader
        title="Documentación"
        subtitle="Guía de superpoderes de tu panel"
        action={<span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-amber/20 text-accent-amber border border-accent-amber/40 font-medium uppercase shrink-0">Beta</span>}
      />
      <div className="p-3 md:p-6 space-y-6 min-w-0 max-w-full overflow-x-hidden">
        <div className="rounded-2xl bg-gradient-to-br from-accent-purple/10 via-accent-cyan/5 to-transparent border border-surface-500 p-6 md:p-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-purple to-accent-cyan flex items-center justify-center shadow-glow-cyan">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">
                Superpoderes de tu Panel
              </h1>
              <p className="text-sm text-gray-400">
                LeadMaster v2.0 — Marca blanca, embudos dinámicos y triggers inteligentes
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-400 max-w-2xl">
            Tu panel no es solo un dashboard de métricas. Es un ecosistema completo que se adapta
            a tu negocio: embudos personalizados, triggers de chat por emoji, integración de datos
            financieros externos y procesamiento IA con tu propia clave.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="text-gray-400 text-sm animate-pulse">Cargando configuración...</div>
          </div>
        ) : (
          <Tabs defaultValue="triggers" className="w-full">
            <TabsList className="flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="triggers" className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                Triggers de Chat
              </TabsTrigger>
              <TabsTrigger value="etiquetas" className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                Etiquetas
              </TabsTrigger>
              <TabsTrigger value="api" className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                API de Ingresos
              </TabsTrigger>
              <TabsTrigger value="embudo" className="flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" />
                Cómo funciona
              </TabsTrigger>
              <TabsTrigger value="metricas" className="flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" />
                Métricas
              </TabsTrigger>
              <TabsTrigger value="byok" className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                OpenAI Key
              </TabsTrigger>
              {MOSTRAR_COSTOS_IA && (
              <TabsTrigger value="costos" className="flex items-center gap-1.5">
                <span>💰</span>
                Costos de IA
              </TabsTrigger>
              )}
              <TabsTrigger value="webhooks" className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Webhooks
              </TabsTrigger>
              <TabsTrigger value="faq" className="flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" />
                FAQ
              </TabsTrigger>
            </TabsList>

            <Separator className="my-4" />

            <TabsContent value="triggers">
              <TriggerSection triggers={triggers} />
            </TabsContent>

            <TabsContent value="etiquetas">
              <EtiquetasSection />
            </TabsContent>

            <TabsContent value="api">
              <ApiSection />
            </TabsContent>

            <TabsContent value="embudo">
              <EmbudoSection />
            </TabsContent>

            <TabsContent value="metricas">
              <MetricasSection />
            </TabsContent>

            <TabsContent value="byok">
              <BYOKSection hasKey={hasOpenAIKey} />
            </TabsContent>

            {MOSTRAR_COSTOS_IA && (
            <TabsContent value="costos">
              <CostosIASection />
            </TabsContent>
            )}
            <TabsContent value="webhooks">
              <WebhookMetricasSection />
            </TabsContent>
            <TabsContent value="faq">
              <FaqSection />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
}
