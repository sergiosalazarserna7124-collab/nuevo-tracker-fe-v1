/**
 * POST /api/auth/switch-account
 * Cambia la cuenta activa en el JWT sin requerir contraseña.
 * Solo funciona si el usuario ya tiene sesión y el subdominio pertenece a su email.
 *
 * Flujo:
 * 1. Valida que el subdominio destino pertenece al usuario autenticado
 * 2. Reescribe la cookie de sesión con el nuevo subdominio + id_cuenta + permisos
 * 3. El cliente navega directo al subdominio — el middleware ya ve la cookie correcta
 */
import { NextResponse } from "next/server";
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
  { id: "superadmin", nombre: "Administrador General", permisos: ["ver_todo", "editar_registros", "configurar_sistema", "gestionar_usuarios", "gestionar_roles"] },
  { id: "usuario", nombre: "Usuario", permisos: ["ver_solo_propios", "ver_dashboard", "ver_rendimiento", "ver_asesor", "ver_bandeja", "ver_acquisition", "ver_documentacion"] },
];

function resolvePermisos(rol: string, rolesConfig: RolConfig[] | null): string[] {
  if (rol === "superadmin") return ALL_PERMISOS;
  const config = Array.isArray(rolesConfig) && rolesConfig.length > 0 ? rolesConfig : DEFAULT_ROLES_CONFIG;
  const match = config.find((r) => r.id === rol);
  if (match) return match.permisos;
  if (rol === "usuario") return DEFAULT_ROLES_CONFIG[1]!.permisos;
  return [];
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json() as { subdominio?: string };
  const subdominio = body.subdominio?.trim();
  if (!subdominio) return NextResponse.json({ error: "subdominio requerido" }, { status: 400 });

  // Normalizar: aceptar el slug o el dominio completo (ej. "tracker-credivit" o "tracker-credivit.leadmaster.com.co")
  const subdominioSlug = normalizeSubdominio(subdominio) ?? subdominio;
  const subdominioFull = `${subdominioSlug}.${ROOT_DOMAIN}`;

  // Verificar que ese subdominio pertenece al email del usuario y obtener sus datos
  // La condición OR cubre cuentas que almacenan el dominio completo en lugar del slug (ej. credivit id=25)
  const [row] = await db
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
    .where(and(eq(usuariosDashboard.email, email), or(eq(cuentas.subdominio, subdominioSlug), eq(cuentas.subdominio, subdominioFull))))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Cuenta no autorizada para este usuario" }, { status: 403 });
  }

  const subdominioNorm = normalizeSubdominio(row.subdominio) ?? row.subdominio;
  const permisosArray = resolvePermisos(row.rol, row.roles_config);

  // Construir nuevo JWT con el subdominio/cuenta destino
  const newToken = {
    id: String(row.id_evento),
    id_cuenta: row.id_cuenta,
    email,
    name: row.nombre,
    rol: row.rol,
    subdominio: subdominioNorm,
    permisos: row.permisos,
    permisosArray,
    platformAdmin: false,
    // Mantener tiempos estándar de NextAuth (30 días)
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };

  const encodedToken = await encode({
    token: newToken,
    secret: process.env.AUTH_SECRET!,
    salt: COOKIE_NAME,
  });

  const response = NextResponse.json({ ok: true, subdominio: subdominioNorm });

  // Reescribir la cookie con el nuevo JWT — mismas opciones que auth.ts
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
