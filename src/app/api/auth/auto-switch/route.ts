/**
 * GET /api/auth/auto-switch?to=<subdomain>
 *
 * Cambia automáticamente la cuenta activa del usuario cuando navega a un
 * subdominio diferente al de su sesión actual (p. ej. monitor con sesión
 * sharkrealtor accede a high-line-mexico.leadmaster.com.co).
 *
 * Flujo:
 * 1. El middleware detecta sesión "stale" (JWT de otro subdomain) y redirige aquí.
 * 2. Se valida que el usuario tenga acceso al subdominio destino.
 * 3. Se reescribe el JWT con los datos del subdomain destino.
 * 4. Se redirige al usuario al dashboard del subdominio correcto.
 *
 * Si el usuario no tiene sesión válida o no tiene acceso al subdomain destino,
 * se redirige al login con el parámetro ?from= para pre-seleccionar la cuenta.
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { usuariosDashboard, cuentas } from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";
import { normalizeSubdominio } from "@/lib/subdomain";
import { encode } from "@auth/core/jwt";
import { PERMISOS_DISPONIBLES } from "@/lib/permisos";
import type { RolConfig } from "@/lib/db/schema";

const isProduction = process.env.NODE_ENV === "production";
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "leadmaster.com.co";
const COOKIE_NAME = isProduction
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

const ALL_PERMISOS = PERMISOS_DISPONIBLES.map((p) => p.id);

const DEFAULT_ROLES_CONFIG: RolConfig[] = [
  {
    id: "superadmin",
    nombre: "Administrador General",
    permisos: ["ver_todo", "editar_registros", "configurar_sistema", "gestionar_usuarios", "gestionar_roles"],
  },
  {
    id: "usuario",
    nombre: "Usuario",
    permisos: ["ver_solo_propios", "ver_dashboard", "ver_rendimiento", "ver_asesor", "ver_bandeja", "ver_acquisition", "ver_documentacion"],
  },
];

function resolvePermisos(rol: string, rolesConfig: RolConfig[] | null): string[] {
  if (rol === "superadmin") return ALL_PERMISOS;
  const config = Array.isArray(rolesConfig) && rolesConfig.length > 0 ? rolesConfig : DEFAULT_ROLES_CONFIG;
  const match = config.find((r) => r.id === rol);
  if (match) return match.permisos;
  if (rol === "usuario") return DEFAULT_ROLES_CONFIG[1]?.permisos ?? [];
  return [];
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const to = url.searchParams.get("to")?.trim();

  const isLocalDev = (req.headers.get("host") ?? "").includes("localhost");
  const protocol = url.protocol;
  const port = url.port ? `:${url.port}` : "";

  const buildLoginUrl = (subdomain: string | null) => {
    const loginHost = isLocalDev ? `localhost${port}` : ROOT_DOMAIN;
    const loginUrl = new URL(`${protocol}//${loginHost}/login`);
    if (subdomain) loginUrl.searchParams.set("from", subdomain);
    return loginUrl;
  };

  if (!to) {
    return NextResponse.redirect(buildLoginUrl(null));
  }

  const subdominioSlug = normalizeSubdominio(to) ?? to;
  const subdominioFull = `${subdominioSlug}.${ROOT_DOMAIN}`;

  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.redirect(buildLoginUrl(subdominioSlug));
  }

  let row: {
    id_evento: number;
    id_cuenta: number;
    subdominio: string;
    nombre: string | null;
    rol: string;
    permisos: Record<string, boolean> | null;
    roles_config: RolConfig[] | null;
    tipo_usuario: string;
  } | undefined;

  try {
    const rows = await db
      .select({
        id_evento: usuariosDashboard.id_evento,
        id_cuenta: cuentas.id_cuenta,
        subdominio: cuentas.subdominio,
        nombre: usuariosDashboard.nombre,
        rol: usuariosDashboard.rol,
        permisos: usuariosDashboard.permisos,
        roles_config: cuentas.roles_config,
        tipo_usuario: usuariosDashboard.tipo_usuario,
      })
      .from(usuariosDashboard)
      .innerJoin(cuentas, eq(usuariosDashboard.id_cuenta, cuentas.id_cuenta))
      .where(
        and(
          eq(usuariosDashboard.email, email),
          eq(usuariosDashboard.activo, true),
          or(
            eq(cuentas.subdominio, subdominioSlug),
            eq(cuentas.subdominio, subdominioFull),
          ),
        ),
      )
      .limit(1);
    row = rows[0];
  } catch (err) {
    console.error("[auto-switch] DB error:", err);
    return NextResponse.redirect(buildLoginUrl(subdominioSlug));
  }

  if (!row) {
    // Usuario no tiene acceso a este subdomain — ir al login para que elija su cuenta
    return NextResponse.redirect(buildLoginUrl(subdominioSlug));
  }

  const subdominioNorm = normalizeSubdominio(row.subdominio) ?? row.subdominio;
  const permisosArray = resolvePermisos(row.rol, row.roles_config);

  const newToken = {
    id: String(row.id_evento),
    id_cuenta: row.id_cuenta,
    email,
    name: row.nombre ?? email,
    rol: row.rol,
    subdominio: subdominioNorm,
    permisos: row.permisos,
    permisosArray,
    platformAdmin: false,
    tipoUsuario: row.tipo_usuario === "enfoque" ? "enfoque" : "analista",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    console.error("[auto-switch] AUTH_SECRET not configured");
    return NextResponse.redirect(buildLoginUrl(subdominioSlug));
  }

  let encodedToken: string;
  try {
    encodedToken = await encode({
      token: newToken,
      secret: authSecret,
      salt: COOKIE_NAME,
    });
  } catch (err) {
    console.error("[auto-switch] encode error:", err);
    return NextResponse.redirect(buildLoginUrl(subdominioSlug));
  }

  const targetHost = isLocalDev
    ? `${subdominioSlug}.localhost${port}`
    : `${subdominioSlug}.${ROOT_DOMAIN}`;
  const landingPath = row.tipo_usuario === "enfoque" ? "/enfoque" : "/dashboard";
  const targetUrl = new URL(`${protocol}//${targetHost}${landingPath}`);

  const response = NextResponse.redirect(targetUrl);

  response.cookies.set({
    name: COOKIE_NAME,
    value: encodedToken,
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    path: "/",
    domain: isProduction ? `.${ROOT_DOMAIN}` : undefined,
    maxAge: 30 * 24 * 60 * 60,
  });

  return response;
}

