/**
 * Cálculo de minutos DENTRO del horario laboral (para el "speed to lead asesor").
 * Respeta la zona horaria de la cuenta y los días/horas configurados.
 */
import { zonedWallTimeToUtc } from "./date-range";

export interface HorarioLaboral {
  /** Días laborales en formato ISO: 1=Lunes … 7=Domingo. */
  dias: number[];
  /** Hora de inicio "HH:MM" (hora local de la cuenta). */
  hora_inicio: string;
  /** Hora de fin "HH:MM". */
  hora_fin: string;
}

export const HORARIO_LABORAL_DEFAULT: HorarioLaboral = {
  dias: [1, 2, 3, 4, 5], // Lun–Vie
  hora_inicio: "08:00",
  hora_fin: "18:00",
};

const DOW_MAP: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Fecha local (YYYY-MM-DD) + día ISO (1-7) de un instante en una zona horaria. */
function localDateParts(d: Date, tz: string): { ymd: string; isoDow: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, isoDow: DOW_MAP[get("weekday")] ?? 0 };
}

function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function normHora(h: string): string {
  // "8:0" → "08:00", "08:00" → "08:00"
  const [hh = "0", mm = "0"] = (h || "").split(":");
  return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
}

/**
 * Minutos de horario laboral entre `start` y `end` (instantes UTC), en la zona
 * horaria `tz`, según el horario configurado. Iterativo por día local (DST-safe
 * vía Intl / zonedWallTimeToUtc). Devuelve 0 si el rango es inválido.
 */
export function businessMinutesBetween(
  start: Date, end: Date, horario: HorarioLaboral, tz?: string | null,
): number {
  if (!(end.getTime() > start.getTime())) return 0;
  const zona = tz || "UTC";
  const hi = normHora(horario.hora_inicio);
  const hf = normHora(horario.hora_fin);
  const dias = horario.dias?.length ? horario.dias : HORARIO_LABORAL_DEFAULT.dias;

  let total = 0;
  let cursor = new Date(start);
  for (let i = 0; i < 400 && cursor.getTime() < end.getTime(); i++) {
    const { ymd, isoDow } = localDateParts(cursor, zona);
    if (dias.includes(isoDow)) {
      try {
        const winStart = zonedWallTimeToUtc(ymd, `${hi}:00.000`, zona);
        const winEnd = zonedWallTimeToUtc(ymd, `${hf}:00.000`, zona);
        const os = Math.max(start.getTime(), winStart.getTime());
        const oe = Math.min(end.getTime(), winEnd.getTime());
        if (oe > os) total += (oe - os) / 60000;
      } catch { /* zona inválida → saltar el día */ }
    }
    // Avanzar al siguiente día local (medianoche local en UTC).
    try {
      cursor = zonedWallTimeToUtc(addDaysYmd(ymd, 1), "00:00:00.000", zona);
    } catch {
      cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
    }
  }
  return Math.round(total);
}
