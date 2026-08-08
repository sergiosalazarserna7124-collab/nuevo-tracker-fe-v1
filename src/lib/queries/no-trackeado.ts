import { sql, type SQL } from "drizzle-orm";

/**
 * Fragmento SQL reutilizable: excluye llamadas/eventos de contactos marcados
 * 'no_trackeado' (etiqueta GHL `no_trackearlead`). Esos contactos NUNCA fueron
 * leads (amigo del cliente, consulta random) → se ocultan de TODAS las vistas
 * y métricas. log_llamadas no tiene bandera de exclusión propia, así que se
 * resuelve contra registros_de_llamada.
 *
 * `contactRef` es la referencia SQL a la columna contact_id_ghl en la query
 * externa (ej. "log_llamadas.contact_id_ghl" o "ll.contact_id_ghl").
 */
export function sinNoTrackeadosSql(
  idCuenta: number | string,
  contactRef = "log_llamadas.contact_id_ghl",
): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM registros_de_llamada _nt
    WHERE _nt.id_cuenta = ${String(idCuenta)}
      AND _nt.ghl_contact_id = ${sql.raw(contactRef)}
      AND _nt.calificacion_manual = 'no_trackeado'
  )`;
}
