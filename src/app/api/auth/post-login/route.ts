/**
 * GET /api/auth/post-login
 * Destino tras el login con Google. Decide a dónde va el usuario:
 *   - email en varias cuentas → /login?seleccionar=1 (selector de cuenta)
 *   - una sola cuenta        → /dashboard
 *   - sin sesión             → /login
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { usuariosDashboard, accesosDashboard } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET(req: Request) {
  // req.url detrás del proxy (Render) trae el host interno (0.0.0.0:10000):
  // construir los redirects desde la URL pública.
  const publicHost =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const base =
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    (publicHost ? `https://${publicHost}` : req.url);

  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.redirect(new URL("/login", base));
  }

  // Registrar el acceso (los logins con Google pasan siempre por aquí;
  // los de código OTP se registran en verifyLoginCodeAction)
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;
    await db.insert(accesosDashboard).values({
      id_cuenta: session?.user?.id_cuenta ?? null,
      email,
      nombre: session?.user?.name ?? null,
      ip,
      user_agent: req.headers.get("user-agent") ?? null,
    });
  } catch (e) {
    console.error("[post-login] error registrando acceso:", e);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usuariosDashboard)
    .where(and(eq(usuariosDashboard.email, email), eq(usuariosDashboard.activo, true)));

  if (count > 1) {
    return NextResponse.redirect(new URL("/login?seleccionar=1", base));
  }
  return NextResponse.redirect(new URL("/dashboard", base));
}
