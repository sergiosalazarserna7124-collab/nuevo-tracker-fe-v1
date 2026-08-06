import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { usuariosDashboard, cuentas } from "@/lib/db/schema";
import type { RolConfig } from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";
import { PERMISOS_DISPONIBLES } from "@/lib/permisos";
import { normalizeSubdominio } from "@/lib/subdomain";

const ALL_PERMISOS = PERMISOS_DISPONIBLES.map((p) => p.id);

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

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        subdominio_override: { label: "Subdominio Override", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).trim().toLowerCase();
        const password = (credentials.password as string).trim();
        const rawOverride = (credentials.subdominio_override as string | undefined)?.trim() || null;
        // Normalizar: aceptar slug o dominio completo (ej. "tracker-credivit" o "tracker-credivit.leadmaster.com.co")
        const subdominioOverride = rawOverride ? (normalizeSubdominio(rawOverride) ?? rawOverride) : null;
        const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "leadmaster.com.co";
        const subdominioOverrideFull = subdominioOverride ? `${subdominioOverride}.${rootDomain}` : null;

        // Usuario plataforma (super admin global): credenciales desde env
        const platformEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
        const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD;
        if (platformEmail && platformPassword && email === platformEmail && password === platformPassword) {
          return {
            id: "platform-admin",
            id_cuenta: null,
            email: platformEmail,
            name: "Administrador Plataforma",
            rol: "superadmin",
            subdominio: null,
            permisos: null,
            permisosArray: ALL_PERMISOS,
            platformAdmin: true,
            tipoUsuario: "analista" as const,
          };
        }

        try {
          const selectFields = {
            id_evento: usuariosDashboard.id_evento,
            id_cuenta: usuariosDashboard.id_cuenta,
            nombre: usuariosDashboard.nombre,
            email: usuariosDashboard.email,
            pass: usuariosDashboard.pass,
            rol: usuariosDashboard.rol,
            permisos: usuariosDashboard.permisos,
            subdominio: cuentas.subdominio,
            roles_config: cuentas.roles_config,
            tipo_usuario: usuariosDashboard.tipo_usuario,
            must_change_password: usuariosDashboard.must_change_password,
          };

          let user: {
            id_evento: number;
            id_cuenta: number | null;
            nombre: string | null;
            email: string;
            pass: string;
            rol: string;
            permisos: Record<string, boolean> | null;
            subdominio: string;
            roles_config: RolConfig[] | null;
            tipo_usuario: string;
            must_change_password: boolean;
          } | undefined;

          if (subdominioOverride) {
            const result = await db
              .select(selectFields)
              .from(usuariosDashboard)
              .innerJoin(cuentas, eq(usuariosDashboard.id_cuenta, cuentas.id_cuenta))
              .where(
                and(
                  eq(usuariosDashboard.email, email),
                  or(
                    eq(cuentas.subdominio, subdominioOverride),
                    ...(subdominioOverrideFull ? [eq(cuentas.subdominio, subdominioOverrideFull)] : []),
                  ),
                ),
              )
              .limit(1);

            if (result.length === 0) {
              console.error("[auth] usuario no encontrado:", email, `(subdominio: ${subdominioOverride})`);
              return null;
            }

            const matched = await compare(password.trim(), result[0].pass).catch(() => false);
            if (!matched) {
              console.error("[auth] password incorrecta para:", email, `(subdominio: ${subdominioOverride})`);
              return null;
            }
            user = result[0];
          } else {
            // Sin subdominio: el email puede existir en múltiples tenants.
            // Probar compare() contra cada fila para encontrar la correcta.
            const rows = await db
              .select(selectFields)
              .from(usuariosDashboard)
              .innerJoin(cuentas, eq(usuariosDashboard.id_cuenta, cuentas.id_cuenta))
              .where(eq(usuariosDashboard.email, email));

            if (rows.length === 0) {
              console.error("[auth] usuario no encontrado:", email);
              return null;
            }

            const trimmedPassword = password.trim();
            for (const row of rows) {
              const matched = await compare(trimmedPassword, row.pass).catch(() => false);
              if (matched) {
                user = row;
                break;
              }
            }

            if (!user) {
              console.error("[auth] password incorrecta para:", email, `(${rows.length} filas probadas)`);
              return null;
            }
          }

          if (!user) {
            return null;
          }

          const permisosArray = resolvePermisos(user.rol, user.roles_config);

          const subdominioFinal = normalizeSubdominio(user.subdominio) ?? user.subdominio;

          return {
            id: String(user.id_evento),
            id_cuenta: user.id_cuenta!,
            email: user.email,
            name: user.nombre,
            rol: user.rol,
            subdominio: subdominioFinal,
            permisos: user.permisos,
            permisosArray,
            tipoUsuario: (user.tipo_usuario === "enfoque" ? "enfoque" : "analista") as "analista" | "enfoque",
            mustChangePassword: user.must_change_password,
          };
        } catch (dbErr) {
          console.error("[auth] error de DB en authorize:", dbErr);
          return null;
        }
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user, trigger }) {
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
        token.mustChangePassword = (user as any).mustChangePassword ?? false;
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
              .select({ tipo_usuario: usuariosDashboard.tipo_usuario, must_change_password: usuariosDashboard.must_change_password })
              .from(usuariosDashboard)
              .where(
                and(
                  eq(usuariosDashboard.id_cuenta, token.id_cuenta as number),
                  eq(usuariosDashboard.email, token.email),
                ),
              )
              .limit(1);

            if (rows.length > 0) {
              const fresh = rows[0].tipo_usuario === "enfoque" ? "enfoque" : "analista";
              token.tipoUsuario = fresh as "analista" | "enfoque";
              token.mustChangePassword = rows[0].must_change_password;
            }
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
      session.user.mustChangePassword = token.mustChangePassword ?? false;
      return session;
    },
  },
};
