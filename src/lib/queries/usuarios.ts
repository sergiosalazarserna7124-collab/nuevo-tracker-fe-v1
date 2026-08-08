import { db } from "@/lib/db";
import { usuariosDashboard } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { registrarWebhookFathom } from "@/lib/fathom-webhook";

export type TipoUsuario = "analista" | "enfoque";

export interface UsuarioRow {
  id: number;
  nombre: string | null;
  email: string;
  rol: string;
  permisos: Record<string, boolean> | null;
  fathom: string | null;
  id_webhook_fathom: string | null;
  tipo_usuario: TipoUsuario;
  origen: string;
  activo: boolean;
}

export async function listUsuarios(idCuenta: number): Promise<UsuarioRow[]> {
  const rows = await db
    .select({
      id: usuariosDashboard.id_evento,
      nombre: usuariosDashboard.nombre,
      email: usuariosDashboard.email,
      rol: usuariosDashboard.rol,
      permisos: usuariosDashboard.permisos,
      fathom: usuariosDashboard.fathom,
      id_webhook_fathom: usuariosDashboard.id_webhook_fathom,
      tipo_usuario: usuariosDashboard.tipo_usuario,
      origen: usuariosDashboard.origen,
      activo: usuariosDashboard.activo,
    })
    .from(usuariosDashboard)
    .where(and(eq(usuariosDashboard.id_cuenta, idCuenta), eq(usuariosDashboard.activo, true)));

  return rows as UsuarioRow[];
}

export interface CreateUsuarioResult {
  user: UsuarioRow;
  /** Si hubo API key Fathom pero el registro del webhook falló */
  fathomWarning: string | null;
}

// Login sin contraseña: los usuarios entran con Google o código por email,
// así que crear un usuario es solo insertar la fila (sin pass ni provisional).
export async function createUsuario(
  idCuenta: number,
  data: { nombre: string; email: string; rol: string; permisos?: Record<string, boolean>; fathom?: string; tipo_usuario?: TipoUsuario },
): Promise<CreateUsuarioResult> {
  const fathomKey = data.fathom?.trim() || null;
  const tipoUsuario = data.tipo_usuario === "enfoque" ? "enfoque" : "analista";
  const [row] = await db
    .insert(usuariosDashboard)
    .values({
      id_cuenta: idCuenta,
      nombre: data.nombre,
      email: data.email.trim().toLowerCase(),
      pass: null,
      rol: data.rol as "superadmin" | "usuario",
      permisos: data.permisos ?? null,
      fathom: fathomKey,
      id_webhook_fathom: null,
      tipo_usuario: tipoUsuario,
      origen: "manual",
      activo: true,
    })
    .returning({
      id: usuariosDashboard.id_evento,
      nombre: usuariosDashboard.nombre,
      email: usuariosDashboard.email,
      rol: usuariosDashboard.rol,
      permisos: usuariosDashboard.permisos,
      fathom: usuariosDashboard.fathom,
      id_webhook_fathom: usuariosDashboard.id_webhook_fathom,
      tipo_usuario: usuariosDashboard.tipo_usuario,
      origen: usuariosDashboard.origen,
      activo: usuariosDashboard.activo,
    });

  let fathomWarning: string | null = null;
  if (fathomKey) {
    const reg = await registrarWebhookFathom(fathomKey, idCuenta);
    if (reg.ok) {
      await db
        .update(usuariosDashboard)
        .set({ id_webhook_fathom: reg.webhookId })
        .where(
          and(eq(usuariosDashboard.id_evento, row.id), eq(usuariosDashboard.id_cuenta, idCuenta)),
        );
      return {
        user: { ...row, id_webhook_fathom: reg.webhookId } as UsuarioRow,
        fathomWarning: null,
      };
    }
    fathomWarning = reg.error;
  }

  return { user: row as UsuarioRow, fathomWarning };
}

export async function updateUsuario(
  idCuenta: number,
  idEvento: number,
  data: { nombre?: string; rol?: string; permisos?: Record<string, boolean>; fathom?: string; tipo_usuario?: TipoUsuario; activo?: boolean },
): Promise<{ fathomWarning: string | null }> {
  let fathomWarning: string | null = null;

  const [current] = await db
    .select({
      fathom: usuariosDashboard.fathom,
      id_webhook_fathom: usuariosDashboard.id_webhook_fathom,
    })
    .from(usuariosDashboard)
    .where(and(eq(usuariosDashboard.id_evento, idEvento), eq(usuariosDashboard.id_cuenta, idCuenta)))
    .limit(1);

  if (!current) return { fathomWarning: null };

  const set: Record<string, unknown> = {};
  if (data.nombre !== undefined) set.nombre = data.nombre;
  if (data.rol !== undefined) set.rol = data.rol;
  if (data.permisos !== undefined) set.permisos = data.permisos;
  if (data.activo !== undefined) set.activo = data.activo;
  if (data.tipo_usuario !== undefined) set.tipo_usuario = data.tipo_usuario === "enfoque" ? "enfoque" : "analista";

  if (data.fathom !== undefined) {
    const newF = data.fathom.trim() || null;
    if (!newF) {
      set.fathom = null;
      set.id_webhook_fathom = null;
    } else if (newF === (current.fathom?.trim() || null) && current.id_webhook_fathom) {
      set.fathom = newF;
    } else {
      const reg = await registrarWebhookFathom(newF, idCuenta);
      set.fathom = newF;
      if (reg.ok) {
        set.id_webhook_fathom = reg.webhookId;
      } else {
        set.id_webhook_fathom = null;
        fathomWarning = reg.error;
      }
    }
  }

  if (Object.keys(set).length === 0) return { fathomWarning: null };

  await db
    .update(usuariosDashboard)
    .set(set)
    .where(and(eq(usuariosDashboard.id_evento, idEvento), eq(usuariosDashboard.id_cuenta, idCuenta)));

  return { fathomWarning };
}

export async function deleteUsuario(idCuenta: number, idEvento: number): Promise<void> {
  await db
    .delete(usuariosDashboard)
    .where(
      and(
        eq(usuariosDashboard.id_evento, idEvento),
        eq(usuariosDashboard.id_cuenta, idCuenta),
      ),
    );
}
