import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { usuariosDashboard, cuentas, loginCodes } from "@/lib/db/schema";
import type { RolConfig } from "@/lib/db/schema";
import { eq, and, or, isNull, gt, desc, sql } from "drizzle-orm";
import { PERMISOS_DISPONIBLES } from "@/lib/permisos";
import { normalizeSubdominio } from "@/lib/subdomain";

const ALL_PERMISOS = PERMISOS_DISPONIBLES.map((p) => p.id);

const MAX_CODE_ATTEMPTS = 5;

const DEFAULT_ROLES_CONFIG: RolConfig[] = [
  { id: "superadmin", nombre: "Administrador General", permisos: ["ver_todo", "editar_registros", "configurar_sistema", "gestionar_usuarios", "gestionar_roles"] },
  { id: "usuario", nombre: "Usuario", permisos: ["ver_solo_propios", "ver_dashboard", "ver_rendimiento", "ver_asesor", "ver_bandeja", "ver_acquisition", "ver_documentacion"] },
];

function resolvePermisos(rol: string, rolesConfig: RolConfig[] | null): string[] {
  if (rol === "superadmin") return ALL_PERMISOS;
  const hasCustomConfig = Array.isArray(rolesConfig) && rolesConfig.length > 0;
  const config = hasCustomConfig ? rolesConfig : DEFAULT_ROLES_CONFIG;
  const match = config.find((r) => r.id === rol);
  if (match) return match.permisos;
  // Si hay config personalizada pero el rol del usuario no existe en ella,
  // dar acceso de lectura completo (ver_todo) sin permisos de edición ni restricción
  // a datos propios. Evita que usuarios legítimos vean 0 data por rol desconocido.
  if (hasCustomConfig) {
    return ["ver_todo", "ver_dashboard", "ver_rendimiento", "ver_asesor", "ver_bandeja", "ver_acquisition", "ver_documentacion"];
  }
  if (rol === "usuario") return DEFAULT_ROLES_CONFIG[1]!.permisos;
  return [];
}

interface UsuarioConCuenta {
  id_evento: number;
  id_cuenta: number | null;
  nombre: string | null;
  email: string;
  rol: string;
  permisos: Record<string, boolean> | null;
  subdominio: string;
  roles_config: RolConfig[] | null;
  tipo_usuario: string;
}

/**
 * Filas activas de usuarios_dashboard para un email, con su cuenta.
 * Si se pasa subdominio, se limita a esa cuenta (acepta slug o dominio completo).
 */
async function findUsuariosActivos(
  email: string,
  subdominio?: string | null,
): Promise<UsuarioConCuenta[]> {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "leadmaster.com.co";
  const slug = subdominio ? (normalizeSubdominio(subdominio) ?? subdominio) : null;
  const conditions = [
    eq(usuariosDashboard.email, email),
    eq(usuariosDashboard.activo, true),
  ];
  if (slug) {
    conditions.push(
      or(eq(cuentas.subdominio, slug), eq(cuentas.subdominio, `${slug}.${rootDomain}`))!,
    );
  }
  return db
    .select({
      id_evento: usuariosDashboard.id_evento,
      id_cuenta: usuariosDashboard.id_cuenta,
      nombre: usuariosDashboard.nombre,
      email: usuariosDashboard.email,
      rol: usuariosDashboard.rol,
      permisos: usuariosDashboard.permisos,
      subdominio: cuentas.subdominio,
      roles_config: cuentas.roles_config,
      tipo_usuario: usuariosDashboard.tipo_usuario,
    })
    .from(usuariosDashboard)
    .innerJoin(cuentas, eq(usuariosDashboard.id_cuenta, cuentas.id_cuenta))
    .where(and(...conditions))
    .orderBy(usuariosDashboard.id_evento);
}

/** Construye el objeto user de NextAuth a partir de una fila de usuarios_dashboard. */
function buildSessionUser(row: UsuarioConCuenta) {
  return {
    id: String(row.id_evento),
    id_cuenta: row.id_cuenta!,
    email: row.email,
    name: row.nombre,
    rol: row.rol,
    subdominio: normalizeSubdominio(row.subdominio) ?? row.subdominio,
    permisos: row.permisos,
    permisosArray: resolvePermisos(row.rol, row.roles_config),
    tipoUsuario: (row.tipo_usuario === "enfoque" ? "enfoque" : "analista") as "analista" | "enfoque",
    mustChangePassword: false,
  };
}

/**
 * Verifica el código de login más reciente para un email.
 * Consume el código si es correcto; incrementa intentos si no.
 */
async function verifyAndConsumeLoginCode(email: string, code: string): Promise<boolean> {
  const [row] = await db
    .select({
      id: loginCodes.id,
      code_hash: loginCodes.code_hash,
      attempts: loginCodes.attempts,
    })
    .from(loginCodes)
    .where(
      and(
        eq(loginCodes.email, email),
        isNull(loginCodes.consumed_at),
        gt(loginCodes.expires_at, new Date()),
      ),
    )
    .orderBy(desc(loginCodes.created_at))
    .limit(1);

  if (!row) return false;
  if (row.attempts >= MAX_CODE_ATTEMPTS) return false;

  const matched = await compare(code, row.code_hash).catch(() => false);
  if (!matched) {
    await db
      .update(loginCodes)
      .set({ attempts: sql`${loginCodes.attempts} + 1` })
      .where(eq(loginCodes.id, row.id));
    return false;
  }

  await db.update(loginCodes).set({ consumed_at: new Date() }).where(eq(loginCodes.id, row.id));
  return true;
}

const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

export const authConfig: NextAuthConfig = {
  providers: [
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    Credentials({
      id: "email-otp",
      name: "email-otp",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Código", type: "text" },
        subdominio_override: { label: "Subdominio Override", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.code) return null;

        const email = (credentials.email as string).trim().toLowerCase();
        const code = (credentials.code as string).trim();
        const subdominioOverride =
          (credentials.subdominio_override as string | undefined)?.trim() || null;

        try {
          const codeOk = await verifyAndConsumeLoginCode(email, code);
          if (!codeOk) {
            console.error("[auth] código inválido o expirado para:", email);
            return null;
          }

          let rows = await findUsuariosActivos(email, subdominioOverride);
          // Si el scope de subdominio no matchea (ej. slug inválido), caer al global
          if (rows.length === 0 && subdominioOverride) {
            rows = await findUsuariosActivos(email);
          }
          if (rows.length === 0) {
            console.error("[auth] usuario no encontrado o inactivo:", email);
            return null;
          }

          // Si el email existe en varias cuentas entra por la primera; el
          // selector post-login cambia de cuenta vía /api/auth/switch-account.
          return buildSessionUser(rows[0]);
        } catch (dbErr) {
          console.error("[auth] error de DB en authorize (email-otp):", dbErr);
          return null;
        }
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;
      try {
        const rows = await findUsuariosActivos(email);
        if (rows.length === 0) {
          console.error("[auth] login Google rechazado — sin acceso:", email);
          return false;
        }
        return true;
      } catch (err) {
        console.error("[auth] error de DB en signIn (google):", err);
        return false;
      }
    },
    async jwt({ token, user, account, trigger }) {
      if (user && account?.provider === "google") {
        // Google solo trae email/nombre: cargar el usuario desde la BD
        const email = user.email?.trim().toLowerCase();
        const rows = email ? await findUsuariosActivos(email).catch(() => []) : [];
        if (rows.length > 0) {
          const su = buildSessionUser(rows[0]);
          token.id = su.id;
          token.email = su.email;
          token.id_cuenta = su.id_cuenta;
          token.rol = su.rol;
          token.subdominio = su.subdominio;
          token.permisos = su.permisos;
          token.permisosArray = su.permisosArray;
          token.platformAdmin = false;
          token.tipoUsuario = su.tipoUsuario;
          token.tipoUsuarioCheckedAt = Date.now();
          token.mustChangePassword = false;
          token.multiCuenta = rows.length > 1;
        }
        return token;
      }

      if (user) {
        token.id = user.id!;
        token.id_cuenta = (user as any).id_cuenta ?? null;
        token.rol = (user as any).rol;
        token.subdominio = (user as any).subdominio ?? null;
        token.permisos = (user as any).permisos;
        token.permisosArray = (user as any).permisosArray;
        token.platformAdmin = (user as any).platformAdmin ?? false;
        token.tipoUsuario = (user as any).tipoUsuario ?? "analista";
        token.tipoUsuarioCheckedAt = Date.now();
        token.mustChangePassword = false;
      } else if (
        token.id_cuenta != null &&
        token.email &&
        !token.platformAdmin
      ) {
        const TIPO_USUARIO_TTL_MS = 60_000;
        const forceRefresh = trigger === "update";
        const lastChecked = (token.tipoUsuarioCheckedAt as number | undefined) ?? 0;
        if (forceRefresh || Date.now() - lastChecked > TIPO_USUARIO_TTL_MS) {
          try {
            const rows = await db
              .select({
                tipo_usuario: usuariosDashboard.tipo_usuario,
                activo: usuariosDashboard.activo,
              })
              .from(usuariosDashboard)
              .where(
                and(
                  eq(usuariosDashboard.id_cuenta, token.id_cuenta as number),
                  eq(usuariosDashboard.email, token.email),
                ),
              )
              .limit(1);

            // Usuario eliminado o desactivado (ej. removido de GHL) → cerrar sesión
            if (rows.length === 0 || !rows[0].activo) return null;

            const fresh = rows[0].tipo_usuario === "enfoque" ? "enfoque" : "analista";
            token.tipoUsuario = fresh as "analista" | "enfoque";
            token.tipoUsuarioCheckedAt = Date.now();
          } catch {
            // Fail-open: keep current tipoUsuario, retry on next TTL expiry
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.id_cuenta = token.id_cuenta as number | null;
      session.user.rol = token.rol as string;
      session.user.subdominio = token.subdominio as string | null;
      session.user.permisos = token.permisos as Record<string, boolean> | null;
      session.user.permisosArray = (token.permisosArray as string[]) ?? [];
      session.user.platformAdmin = token.platformAdmin as boolean | undefined;
      session.user.tipoUsuario = token.tipoUsuario ?? "analista";
      session.user.mustChangePassword = false;
      return session;
    },
  },
};
