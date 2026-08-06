import { NextResponse } from "next/server";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "autokpi.net";
const isProduction = process.env.NODE_ENV === "production";
const COOKIE_NAME = isProduction
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";
const cookieDomain = isProduction ? `.${ROOT_DOMAIN}` : undefined;

/**
 * Salir de la impersonación: borra la sesión next-auth del tenant y vuelve al
 * panel admin oculto.
 */
export async function GET() {
  const adminHost = process.env.PANEL_ADMIN_HOST;
  const target = adminHost
    ? `https://${adminHost}/super`
    : `https://${ROOT_DOMAIN}`;

  const res = NextResponse.redirect(target);
  // Borrar la cookie de sesión (impersonación)
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    secure: isProduction,
    domain: cookieDomain,
    maxAge: 0,
  });
  return res;
}
