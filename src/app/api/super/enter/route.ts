import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encode } from "@auth/core/jwt";
import { db } from "@/lib/db";
import { cuentas } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { normalizeSubdominio } from "@/lib/subdomain";
import { verifySuperCookie, getSuperCookieName } from "@/lib/super-verify";
import { PERMISOS_DISPONIBLES } from "@/lib/permisos";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "autokpi.net";
const isProduction = process.env.NODE_ENV === "production";
const COOKIE_NAME = isProduction
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";
const cookieDomain = isProduction ? `.${ROOT_DOMAIN}` : undefined;

/**
 * "Entrar" a una cuenta desde el panel admin (impersonación).
 * Autenticado con la cookie "super" (independiente de next-auth). Crea una
 * sesión next-auth para el tenant y redirige al dashboard del cliente
 * (login.<root>/dashboard — el tenant se resuelve desde la sesión).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const subdominio = searchParams.get("subdominio")?.trim().toLowerCase();
  if (!subdominio) {
    return NextResponse.json({ error: "Falta subdominio" }, { status: 400 });
  }

  // Auth: cookie super del admin
  const cookieStore = await cookies();
  if (!verifySuperCookie(cookieStore.get(getSuperCookieName())?.value)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Buscar tenant
  type CuentaRow = { id_cuenta: number; subdominio: string };
  const primera = await db
    .select({ id_cuenta: cuentas.id_cuenta, subdominio: cuentas.subdominio })
    .from(cuentas)
    .where(eq(cuentas.subdominio, subdominio))
    .limit(1);
  let cuenta: CuentaRow | null = primera[0] ?? null;

  if (!cuenta) {
    const slug = normalizeSubdominio(subdominio);
    if (slug) {
      const todas = await db
        .select({ id_cuenta: cuentas.id_cuenta, subdominio: cuentas.subdominio })
        .from(cuentas);
      cuenta = todas.find((c) => normalizeSubdominio(c.subdominio) === slug) ?? null;
    }
  }

  if (!cuenta) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  const subdominioSlug = normalizeSubdominio(cuenta.subdominio) ?? cuenta.subdominio;

  // Token de impersonación: sesión next-auth con acceso total al tenant
  const allPermisos = PERMISOS_DISPONIBLES.map((p) => p.id);
  const now = Math.floor(Date.now() / 1000);
  const newToken = {
    id: "platform-admin",
    email: process.env.PLATFORM_ADMIN_EMAIL ?? "admin@plataforma",
    name: "Administrador Plataforma",
    subdominio: subdominioSlug,
    id_cuenta: cuenta.id_cuenta,
    rol: "superadmin",
    permisos: null,
    permisosArray: allPermisos,
    platformAdmin: true,
    tipoUsuario: "analista" as const,
    mustChangePassword: false,
    iat: now,
    exp: now + 30 * 24 * 60 * 60,
  };

  const encoded = await encode({
    token: newToken,
    secret: process.env.AUTH_SECRET!,
    salt: COOKIE_NAME,
  });

  // Dashboard del cliente en el host de clientes (ruteo por sesión)
  const redirectUrl = `https://login.${ROOT_DOMAIN}/dashboard`;

  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set(COOKIE_NAME, encoded, {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    secure: isProduction,
    domain: cookieDomain,
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
