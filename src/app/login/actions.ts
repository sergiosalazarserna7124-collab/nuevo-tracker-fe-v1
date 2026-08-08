"use server";

import { signIn, auth } from "@/lib/auth";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { randomInt } from "crypto";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { usuariosDashboard, cuentas, accesosDashboard, loginCodes } from "@/lib/db/schema";
import { sendLoginCodeEmail } from "@/lib/email";
import { normalizeSubdominio } from "@/lib/subdomain";
import { eq, and, gt, sql } from "drizzle-orm";

export interface AccountOption {
  id_cuenta: number;
  nombre_cuenta: string | null;
  subdominio: string;
}

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_CODES = 3;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findCuentasForEmail(email: string): Promise<AccountOption[]> {
  const results = await db
    .select({
      id_cuenta: cuentas.id_cuenta,
      nombre_cuenta: cuentas.nombre_cuenta,
      subdominio: cuentas.subdominio,
    })
    .from(usuariosDashboard)
    .innerJoin(cuentas, eq(usuariosDashboard.id_cuenta, cuentas.id_cuenta))
    .where(and(eq(usuariosDashboard.email, email), eq(usuariosDashboard.activo, true)))
    .orderBy(cuentas.id_cuenta);

  return results.map((r) => ({
    id_cuenta: r.id_cuenta,
    nombre_cuenta: r.nombre_cuenta ?? null,
    subdominio: normalizeSubdominio(r.subdominio) ?? r.subdominio,
  }));
}

/**
 * Paso 1: enviar código de verificación de 6 dígitos al correo.
 */
export async function requestLoginCodeAction(rawEmail: string): Promise<{ ok?: true; error?: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email || !email.includes("@")) {
    return { error: "Ingresa un correo válido." };
  }

  const cuentasUsuario = await findCuentasForEmail(email);
  if (cuentasUsuario.length === 0) {
    return {
      error: "Este correo no tiene acceso a LeadMaster. Pide a tu administrador que te agregue.",
    };
  }

  // Rate limit: máximo N códigos por email en la ventana
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginCodes)
    .where(
      and(
        eq(loginCodes.email, email),
        gt(loginCodes.created_at, new Date(Date.now() - RATE_LIMIT_WINDOW_MS)),
      ),
    );
  if (count >= RATE_LIMIT_MAX_CODES) {
    return { error: "Demasiados códigos solicitados. Espera unos minutos e intenta de nuevo." };
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = await hash(code, 10);

  // Un solo código activo a la vez: invalidar los anteriores
  await db
    .update(loginCodes)
    .set({ consumed_at: new Date() })
    .where(and(eq(loginCodes.email, email), sql`${loginCodes.consumed_at} IS NULL`));

  await db.insert(loginCodes).values({
    email,
    code_hash: codeHash,
    expires_at: new Date(Date.now() + CODE_TTL_MS),
  });

  const sent = await sendLoginCodeEmail({ to: email, code });
  if (!sent) {
    return { error: "No se pudo enviar el correo. Intenta de nuevo en unos minutos." };
  }

  return { ok: true };
}

/**
 * Paso 2: verificar el código e iniciar sesión.
 */
export async function verifyLoginCodeAction(formData: {
  email: string;
  code: string;
  subdominio_override?: string;
}): Promise<{ error?: string; subdominio?: string; accounts?: AccountOption[] }> {
  const email = normalizeEmail(formData.email);

  try {
    await signIn("email-otp", {
      email,
      code: formData.code.trim(),
      subdominio_override: formData.subdominio_override ?? "",
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { error: "Código incorrecto o expirado. Solicita uno nuevo si es necesario." };
      }
      console.error("[login] AuthError type:", error.type);
      return { error: "Error de autenticación. Intenta de nuevo." };
    }
    throw error;
  }

  // Registrar acceso (AUT-1875: directo en BD, la cookie aún no está en este request)
  try {
    const userRows = await db
      .select({ id_cuenta: usuariosDashboard.id_cuenta, nombre: usuariosDashboard.nombre })
      .from(usuariosDashboard)
      .where(eq(usuariosDashboard.email, email))
      .limit(1);
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? hdrs.get("x-real-ip")
      ?? null;
    await db.insert(accesosDashboard).values({
      id_cuenta: userRows[0]?.id_cuenta ?? null,
      email,
      nombre: userRows[0]?.nombre ?? null,
      ip,
      user_agent: hdrs.get("user-agent") ?? null,
    });
  } catch (e) {
    console.error("[login] error registrando acceso:", e);
  }

  // Si entró escopado a una cuenta, el JWT ya quedó en la correcta
  if (formData.subdominio_override) {
    const slug = normalizeSubdominio(formData.subdominio_override) ?? formData.subdominio_override;
    return { subdominio: slug };
  }

  const accounts = await findCuentasForEmail(email);
  if (accounts.length === 0) {
    return { error: "No se encontró la cuenta asociada." };
  }
  if (accounts.length === 1) {
    return { subdominio: accounts[0].subdominio };
  }
  // Varias cuentas: el selector cambia con /api/auth/switch-account
  return { accounts };
}

/**
 * Cuentas del usuario ya autenticado (para el selector tras login con Google).
 */
export async function listMyAccountsAction(): Promise<{ accounts?: AccountOption[]; error?: string }> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { error: "No autenticado." };
  const accounts = await findCuentasForEmail(normalizeEmail(email));
  return { accounts };
}
