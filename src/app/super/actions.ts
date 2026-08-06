"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  createSuperCookieValue,
  getSuperCookieName,
  verifySuperCookie,
} from "@/lib/super-verify";
import { db } from "@/lib/db";
import { cuentas } from "@/lib/db/schema";
import { createUsuario } from "@/lib/queries/usuarios";

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
