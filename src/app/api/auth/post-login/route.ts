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
import { usuariosDashboard } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usuariosDashboard)
    .where(and(eq(usuariosDashboard.email, email), eq(usuariosDashboard.activo, true)));

  if (count > 1) {
    return NextResponse.redirect(new URL("/login?seleccionar=1", req.url));
  }
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
