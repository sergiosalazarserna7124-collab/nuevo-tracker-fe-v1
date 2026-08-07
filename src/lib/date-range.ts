/**
 * Utilidades de rango de fechas conscientes de la zona horaria del tenant.
 *
 * AUT-1446: Los filtros por fecha del dashboard construían los límites del día
 * en UTC (`${fecha}T00:00:00Z` … `${fecha}T23:59:59.999Z`). Como las columnas
 * de tiempo (`fecha_reunion`, `ts`, …) son `timestamptz` y la UI muestra las
 * horas en la zona local del tenant (`cuentas.zona_horaria_iana`), una reunión
 * de la tarde/noche cruzaba la medianoche UTC y se contaba en el día siguiente.
 *
 * Ejemplo real (Shark re, America/Cancun = UTC-5): una cita del 08/07 19:30
 * local se guarda como 2026-07-09 00:30Z y aparecía bajo el filtro "Hoy" del 09.
 *
 * Estas funciones interpretan el día calendario en la zona del tenant y
 * devuelven los instantes UTC correspondientes, de modo que el filtro coincide
 * con lo que ve el usuario.
 */

/**
 * Offset (en ms) de la zona `tz` respecto a UTC para el instante `date`.
 * Positivo al este de UTC, negativo al oeste (p. ej. America/Cancun = -18000000).
 */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = parseInt(p.value, 10);
  }
  // `hour` puede venir como 24 para medianoche en algunos entornos.
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return asUtc - date.getTime();
}

/**
 * Convierte una hora de pared (`YYYY-MM-DD` + `HH:mm:ss.SSS`) interpretada en la
 * zona `tz` al instante UTC correspondiente.
 */
export function zonedWallTimeToUtc(dateStr: string, timeStr: string, tz: string): Date {
  // Interpretación ingenua como si fuera UTC, corregida por el offset de la zona
  // en ese instante. Suficientemente exacto salvo en el salto exacto de DST.
  const naive = new Date(`${dateStr}T${timeStr}Z`);
  const offset = tzOffsetMs(naive, tz);
  return new Date(naive.getTime() - offset);
}

/**
 * Devuelve los límites UTC del rango de días `[dateFrom, dateTo]` interpretados
 * en la zona horaria del tenant. Si `tz` es nulo/ inválido, cae a UTC (comportamiento previo).
 *
 * @param dateFrom `YYYY-MM-DD` (inicio inclusivo, 00:00:00 local)
 * @param dateTo   `YYYY-MM-DD` (fin inclusivo, 23:59:59.999 local)
 * @param tz       IANA timezone del tenant (`cuentas.zona_horaria_iana`)
 */
export function zonedDayRange(
  dateFrom: string,
  dateTo: string,
  tz: string | null | undefined,
): { fromDate: Date; toDate: Date } {
  if (!tz) {
    return {
      fromDate: new Date(`${dateFrom}T00:00:00Z`),
      toDate: new Date(`${dateTo}T23:59:59.999Z`),
    };
  }
  try {
    return {
      fromDate: zonedWallTimeToUtc(dateFrom, "00:00:00.000", tz),
      toDate: zonedWallTimeToUtc(dateTo, "23:59:59.999", tz),
    };
  } catch {
    // Zona inválida → fallback a UTC para no romper la consulta.
    return {
      fromDate: new Date(`${dateFrom}T00:00:00Z`),
      toDate: new Date(`${dateTo}T23:59:59.999Z`),
    };
  }
}
