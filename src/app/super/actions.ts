"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  createSuperCookieValue,
  getSuperCookieName,
  verifySuperCookie,
} from "@/lib/super-verify";
import { db } from "@/lib/db";
import { cuentas, type InfoComercial } from "@/lib/db/schema";
import { createUsuario } from "@/lib/queries/usuarios";
import { eq, sql } from "drizzle-orm";

export async function verifySuperAccess(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!platformEmail || !platformPassword) {
    return { error: "Acceso no configurado." };
  }

  if (!email || !password) {
    return { error: "Email y contraseña requeridos." };
  }

  if (email !== platformEmail || password !== platformPassword) {
    return { error: "Credenciales incorrectas." };
  }

  const cookieStore = await cookies();
  cookieStore.set(getSuperCookieName(), createSuperCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 900, // 15 min
  });

  redirect("/super");
}

// ─────────────────────────────────────────────────────────────────────────────
// Crear nueva cuenta de cliente (+ primer usuario admin con contraseña provisional)
// ─────────────────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function randomSuffix(n: number): string {
  const c = "abcdefghijkmnpqrstuvwxyz23456789";
  let r = "";
  for (let i = 0; i < n; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

export interface CrearCuentaInput {
  nombre_cuenta: string;
  token_ghl?: string;
  location_id?: string;
  zona_horaria?: string;
  admin_email: string;
  admin_nombre?: string;
}

export async function crearCuenta(input: CrearCuentaInput) {
  // Autenticado por la cookie "super" (login por env creds), independiente de next-auth
  const cookieStore = await cookies();
  if (!verifySuperCookie(cookieStore.get(getSuperCookieName())?.value)) {
    return { error: "Tu sesión de admin expiró. Vuelve a ingresar." };
  }

  const nombre = input.nombre_cuenta?.trim();
  const email = input.admin_email?.trim().toLowerCase();
  if (!nombre) return { error: "El nombre de la cuenta es obligatorio." };
  if (!email || !email.includes("@")) return { error: "Email de admin inválido." };

  const slug = `${slugify(nombre) || "cuenta"}-${randomSuffix(4)}`;

  try {
    const [cuenta] = await db
      .insert(cuentas)
      .values({
        nombre_cuenta: nombre,
        subdominio: slug,
        token_ghl: input.token_ghl?.trim() || null,
        locationid: input.location_id?.trim() || null,
        ghl_location_id: input.location_id?.trim() || null,
        zona_horaria_iana: input.zona_horaria?.trim() || null,
        estado_cuenta: "activo",
      })
      .returning({ id_cuenta: cuentas.id_cuenta, subdominio: cuentas.subdominio });

    // Primer usuario admin del cliente. Sin password → genera provisional,
    // marca must_change_password=true y envía el correo (si EMAIL_ENABLED=true).
    const result = await createUsuario(cuenta.id_cuenta, {
      nombre: input.admin_nombre?.trim() || email,
      email,
      rol: "superadmin",
    });

    const base =
      process.env.AUTH_URL ||
      `https://login.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || "leadmaster.com.co"}`;
    const loginUrl = `${base.replace(/\/$/, "")}/${cuenta.subdominio}`;

    return {
      ok: true as const,
      subdominio: cuenta.subdominio,
      loginUrl,
      email,
      provisionalPassword: result.provisionalPassword,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate/i.test(msg)) {
      return { error: "Ese email ya está registrado en otra cuenta. Usa otro." };
    }
    return { error: `Error creando la cuenta: ${msg}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Configurar cuenta (editar token/zona/location + ocultar secciones + comercial)
// ─────────────────────────────────────────────────────────────────────────────

async function requireSuper(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySuperCookie(cookieStore.get(getSuperCookieName())?.value);
}

export async function getCuentaConfig(idCuenta: number) {
  if (!(await requireSuper())) return null;
  const [row] = await db
    .select({
      id_cuenta: cuentas.id_cuenta,
      nombre_cuenta: cuentas.nombre_cuenta,
      subdominio: cuentas.subdominio,
      token_ghl: cuentas.token_ghl,
      zona_horaria_iana: cuentas.zona_horaria_iana,
      locationid: cuentas.locationid,
      configuracion_ui: cuentas.configuracion_ui,
      info_comercial: cuentas.info_comercial,
    })
    .from(cuentas)
    .where(eq(cuentas.id_cuenta, idCuenta))
    .limit(1);
  return row ?? null;
}

export interface ConfigurarCuentaInput {
  id_cuenta: number;
  nombre_cuenta?: string | null;
  token_ghl?: string | null;
  zona_horaria_iana?: string | null;
  locationid?: string | null;
  secciones_ocultas?: string[];
  info_comercial?: InfoComercial;
}

export async function configurarCuenta(input: ConfigurarCuentaInput) {
  if (!(await requireSuper())) return { error: "Tu sesión de admin expiró." };
  if (!input.id_cuenta) return { error: "Falta id_cuenta." };
  try {
    const [cur] = await db
      .select({ configuracion_ui: cuentas.configuracion_ui })
      .from(cuentas)
      .where(eq(cuentas.id_cuenta, input.id_cuenta))
      .limit(1);
    const configUi = {
      ...(cur?.configuracion_ui ?? {}),
      secciones_ocultas: input.secciones_ocultas ?? [],
    };
    await db
      .update(cuentas)
      .set({
        nombre_cuenta: input.nombre_cuenta ?? undefined,
        token_ghl: input.token_ghl ?? null,
        zona_horaria_iana: input.zona_horaria_iana ?? null,
        locationid: input.locationid ?? null,
        ghl_location_id: input.locationid ?? null,
        configuracion_ui: configUi,
        info_comercial: input.info_comercial ?? null,
      })
      .where(eq(cuentas.id_cuenta, input.id_cuenta));
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Finanzas: guardar/leer llaves de Stripe y Mercury (plataforma_config)
// ─────────────────────────────────────────────────────────────────────────────

function maskKey(v: string): string {
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

export async function getFinanzasStatus() {
  if (!(await requireSuper())) return { stripe: null as string | null, mercury: null as string | null };
  const res = await db.execute(
    sql`SELECT clave, valor FROM plataforma_config WHERE clave IN ('stripe_api_key','mercury_api_key')`,
  );
  const rows = (res as unknown as { rows: { clave: string; valor: string | null }[] }).rows ?? [];
  const map = new Map(rows.map((r) => [r.clave, r.valor]));
  return {
    stripe: map.get("stripe_api_key") ? maskKey(map.get("stripe_api_key")!) : null,
    mercury: map.get("mercury_api_key") ? maskKey(map.get("mercury_api_key")!) : null,
  };
}

export async function guardarFinanzasKeys(input: { stripe?: string; mercury?: string }) {
  if (!(await requireSuper())) return { error: "Tu sesión de admin expiró." };
  try {
    const pares: [string, string | undefined][] = [
      ["stripe_api_key", input.stripe],
      ["mercury_api_key", input.mercury],
    ];
    for (const [clave, valor] of pares) {
      if (!valor || !valor.trim()) continue; // solo actualiza si se envía valor
      await db.execute(
        sql`INSERT INTO plataforma_config (clave, valor, updated_at)
            VALUES (${clave}, ${valor.trim()}, now())
            ON CONFLICT (clave) DO UPDATE SET valor = ${valor.trim()}, updated_at = now()`,
      );
    }
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
