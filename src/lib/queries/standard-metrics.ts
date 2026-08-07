import { db } from "@/lib/db";
import { cuentas, logLlamadas, resumenesDiariosAgendas } from "@/lib/db/schema";
import { normalizeEmbudoEtapas } from "@/lib/db/schema";
import type { EmbudoEtapa } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, or, isNull, isNotNull, gt } from "drizzle-orm";
import { zonedDayRange } from "@/lib/date-range";
import { buildFunnelSets } from "./dashboard";
import { agendaDedupKey } from "./agenda-dedup-key";
import { esLlamadaContestada } from "./llamadas";
import { DEFAULT_EMBUDO_CONFIG } from "@/lib/metricas-engine";

export interface StandardMetricDef {
  id: string;
  nombre: string;
  formato: "numero" | "porcentaje" | "tiempo";
  fija: true;
}

export const STANDARD_METRICS: StandardMetricDef[] = [
  { id: "std:leads_generados", nombre: "Leads generados", formato: "numero", fija: true },
  { id: "std:leads_reactivados", nombre: "Leads reactivados", formato: "numero", fija: true },
  { id: "std:llamadas_realizadas", nombre: "Llamadas realizadas", formato: "numero", fija: true },
  { id: "std:llamadas_contestadas", nombre: "Llamadas contestadas", formato: "numero", fija: true },
  { id: "std:speed_to_lead", nombre: "Speed to Lead", formato: "tiempo", fija: true },
  { id: "std:tasa_contestacion", nombre: "Tasa de contestación", formato: "porcentaje", fija: true },
  { id: "std:reuniones_agendadas", nombre: "Citas agendadas", formato: "numero", fija: true },
  { id: "std:reuniones_asistidas", nombre: "Citas asistidas", formato: "numero", fija: true },
];

export async function computeStandardMetrics(
  idCuenta: number,
  dateFrom: string,
  dateTo: string,
): Promise<Record<string, number>> {
  const [cuentaRow] = await db
    .select({
      embudo_personalizado: cuentas.embudo_personalizado,
      zona_horaria_iana: cuentas.zona_horaria_iana,
    })
    .from(cuentas)
    .where(eq(cuentas.id_cuenta, idCuenta))
    .limit(1);

  const tz = cuentaRow?.zona_horaria_iana;
  const { fromDate, toDate } = zonedDayRange(dateFrom, dateTo, tz);

  const embudoRawArr = Array.isArray(cuentaRow?.embudo_personalizado)
    ? normalizeEmbudoEtapas(cuentaRow.embudo_personalizado as EmbudoEtapa[])
    : [];
  const embudoRaw = embudoRawArr.length > 0 ? embudoRawArr : DEFAULT_EMBUDO_CONFIG;
  const { attendedSet } = buildFunnelSets(embudoRaw);

  const TIPOS_NO_LLAMADA = ["pdte", "contacto_creado"];

  const fechaFilter = or(
    and(
      isNotNull(resumenesDiariosAgendas.fecha_reunion),
      gte(resumenesDiariosAgendas.fecha_reunion, fromDate),
      lte(resumenesDiariosAgendas.fecha_reunion, toDate),
    ),
    and(
      eq(resumenesDiariosAgendas.categoria, "PDTE"),
      isNotNull(resumenesDiariosAgendas.fecha_reunion),
      gt(resumenesDiariosAgendas.fecha_reunion, sql`NOW()`),
      gte(resumenesDiariosAgendas.fecha, dateFrom),
      lte(resumenesDiariosAgendas.fecha, dateTo),
    ),
    and(
      isNull(resumenesDiariosAgendas.fecha_reunion),
      gte(resumenesDiariosAgendas.fecha, dateFrom),
      lte(resumenesDiariosAgendas.fecha, dateTo),
    ),
  )!;

  const [agendas, callsRaw, newLeadEventsRaw, reactivadosResult, noTrackeadoContactIds] = await Promise.all([
    db
      .select()
      .from(resumenesDiariosAgendas)
      .where(and(eq(resumenesDiariosAgendas.id_cuenta, idCuenta), fechaFilter)),
    db
      .select()
      .from(logLlamadas)
      .where(
        and(
          eq(logLlamadas.id_cuenta, idCuenta),
          gte(logLlamadas.ts, fromDate),
          lte(logLlamadas.ts, toDate),
          sql`${logLlamadas.tipo_evento} NOT IN (${sql.join(
            TIPOS_NO_LLAMADA.map((t) => sql`${t}`),
            sql`, `,
          )})`,
        ),
      ),
    db
      .select({
        id: logLlamadas.id,
        mail_lead: logLlamadas.mail_lead,
        phone: logLlamadas.phone,
        contact_id_ghl: logLlamadas.contact_id_ghl,
      })
      .from(logLlamadas)
      .where(
        and(
          eq(logLlamadas.id_cuenta, idCuenta),
          gte(logLlamadas.ts, fromDate),
          lte(logLlamadas.ts, toDate),
          sql`${logLlamadas.tipo_evento} IN (${sql.join(
            TIPOS_NO_LLAMADA.map((t) => sql`${t}`),
            sql`, `,
          )})`,
        ),
      ),
    db
      .execute<{ nuevos: string; reactivados: string }>(
        sql`
        SELECT
          SUM(CASE WHEN fecha_primera_llamada BETWEEN ${fromDate} AND ${toDate} THEN 1 ELSE 0 END)::text AS nuevos,
          SUM(CASE WHEN fecha_primera_llamada < ${fromDate} THEN 1 ELSE 0 END)::text AS reactivados
        FROM registros_de_llamada
        WHERE id_cuenta::text = ${String(idCuenta)}
          AND fecha_evento BETWEEN ${fromDate} AND ${toDate}
          AND calificacion_manual IS DISTINCT FROM 'no_trackeado'
      `,
      )
      .then((r) => ({
        nuevos: Number((r.rows[0] as { nuevos?: string })?.nuevos ?? 0),
        reactivados: Number((r.rows[0] as { reactivados?: string })?.reactivados ?? 0),
      })),
    // Contactos 'no_trackeado' (etiqueta no_trackearlead): nunca fueron leads →
    // fuera de todas las métricas. log_llamadas no tiene bandera propia; se
    // resuelve el set desde registros_de_llamada y se filtra en memoria.
    db
      .execute(
        sql`SELECT DISTINCT ghl_contact_id FROM registros_de_llamada
            WHERE id_cuenta::text = ${String(idCuenta)}
              AND calificacion_manual = 'no_trackeado'
              AND ghl_contact_id IS NOT NULL`,
      )
      .then((r) => new Set(r.rows.map((x) => String((x as { ghl_contact_id: string }).ghl_contact_id)))),
  ]);

  const esNoTrackeado = (contactId: string | null | undefined) =>
    !!contactId && noTrackeadoContactIds.has(contactId.trim());
  const calls = callsRaw.filter((c) => !esNoTrackeado(c.contact_id_ghl));
  const newLeadEvents = newLeadEventsRaw.filter((nl) => !esNoTrackeado(nl.contact_id_ghl));

  const effectiveCallLeadKeys = new Set<string>();
  for (const c of calls) {
    if (!(c.tipo_evento ?? "").startsWith("efectiva_")) continue;
    if (c.mail_lead?.trim()) effectiveCallLeadKeys.add(c.mail_lead.trim().toLowerCase());
    if (c.phone?.trim()) effectiveCallLeadKeys.add(c.phone.trim());
    if (c.contact_id_ghl?.trim()) effectiveCallLeadKeys.add(c.contact_id_ghl.trim());
  }
  const hasRealInteraction = (a: (typeof agendas)[0]): boolean => {
    if (a.transcripcion_fathom && a.transcripcion_fathom.trim() !== "") return true;
    if (a.link_llamada && a.link_llamada.trim() !== "") return true;
    if (a.email_lead?.trim() && effectiveCallLeadKeys.has(a.email_lead.trim().toLowerCase()))
      return true;
    if (a.idcliente?.trim() && effectiveCallLeadKeys.has(a.idcliente.trim())) return true;
    if (a.ghl_contact_id?.trim() && effectiveCallLeadKeys.has(a.ghl_contact_id.trim()))
      return true;
    return false;
  };

  const asistidas = agendas.filter(
    (a) =>
      attendedSet.has((a.categoria ?? "").toLowerCase().trim()) && hasRealInteraction(a),
  ).length;

  const contestadas = calls.filter((c) =>
    esLlamadaContestada(c.tipo_evento ?? "", c.estado_resultado),
  ).length;

  const normLeadKey = (
    mail: string | null | undefined,
    phone: string | null | undefined,
    id: string | number,
  ) => mail?.trim().toLowerCase() || phone?.trim() || String(id);

  const leadsNuevosSet = new Set(
    newLeadEvents.map((nl) => normLeadKey(nl.mail_lead, nl.phone, nl.id)),
  );
  const leadsFromCalls = new Set(calls.map((c) => normLeadKey(c.mail_lead, c.phone, c.id)));
  const leadsFromAgendas = new Set(
    agendas.map((a) => normLeadKey(a.email_lead, null, a.id_registro_agenda)),
  );
  const leadsConActividad = new Set([...leadsFromCalls, ...leadsFromAgendas]);
  const totalLeads =
    leadsNuevosSet.size > 0 ? leadsNuevosSet.size : leadsConActividad.size;

  const speedVals = calls
    .filter((c) => c.speed_to_lead)
    .map((c) => parseFloat(c.speed_to_lead!) || 0)
    .filter((v) => v > 0);
  const speedAvg =
    speedVals.length > 0 ? speedVals.reduce((s, v) => s + v, 0) / speedVals.length : 0;

  const uniqueBookedLeads = new Set(agendas.map((a) => agendaDedupKey(a)));

  return {
    "std:leads_generados": totalLeads,
    "std:leads_reactivados": reactivadosResult.reactivados,
    "std:llamadas_realizadas": calls.length,
    "std:llamadas_contestadas": contestadas,
    "std:speed_to_lead": speedAvg,
    "std:tasa_contestacion": calls.length > 0 ? contestadas / calls.length : 0,
    "std:reuniones_agendadas": uniqueBookedLeads.size,
    "std:reuniones_asistidas": asistidas,
  };
}
