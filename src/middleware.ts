import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decode } from "@auth/core/jwt";
import { normalizeSubdominio } from "@/lib/subdomain";

// Dominios GHL estándar permitidos para embedding como iframe
const GHL_FRAME_ORIGINS = [
  "https://*.myghl.com",
  "https://*.gohighlevel.com",
  "https://*.leadconnectorhq.com",
  "https://*.msgsndr.com",
].join(" ");

// Dominios embed personalizados por subdominio (para clientes WL y CRMs externos).
let embedDomainsMap: Record<string, string> = {};
try {
  embedDomainsMap = JSON.parse(process.env.EMBED_DOMAINS ?? "{}");
} catch {
  // Env var malformada — continuar sin dominios custom
}

function buildFrameAncestorsCsp(subdomain: string): string {
  const extra = embedDomainsMap[subdomain];
  const origins = extra ? `${GHL_FRAME_ORIGINS} ${extra}` : GHL_FRAME_ORIGINS;
  return `frame-ancestors 'self' ${origins}`;
}

function setCspHeaders(response: NextResponse, subdomain: string | null): NextResponse {
  response.headers.set("Content-Security-Policy", buildFrameAncestorsCsp(subdomain ?? ""));
  return response;
}

const isProduction = process.env.NODE_ENV === "production";
const COOKIE_NAME = isProduction
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

type SessionPayload = {
  subdominio?: string | null;
  rol?: string;
  id_cuenta?: number | null;
  platformAdmin?: boolean;
  tipoUsuario?: string;
  mustChangePassword?: boolean;
  [key: string]: unknown;
};

async function getSession(req: NextRequest): Promise<SessionPayload | null> {
  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue) return null;
  try {
    const decoded = await decode({
      token: cookieValue,
      secret: process.env.AUTH_SECRET!,
      salt: COOKIE_NAME,
    });
    return decoded as SessionPayload | null;
  } catch {
    return null;
  }
}

// Primeros segmentos reservados del sistema (NO son slugs de cuenta de cliente)
const RESERVED_FIRST = new Set([
  "login", "super", "api", "webhooks", "demo", "app", "_next",
  "cambiar-password", "enfoque", "favicon.ico", "integraciones",
]);

// ─────────────────────────────────────────────────────────────────────────────
// RUTEO DE ACCESO
//
//   • Clientes → login.leadmaster.com.co/{id-cuenta}
//       El primer segmento del path es el slug de la cuenta. Muestra el login
//       de esa cuenta; tras autenticar, el tenant se resuelve desde la SESIÓN.
//
//   • Admin (tú) → host oculto en PANEL_ADMIN_HOST (subdominio raro)
//       Solo sirve /super. Nadie más lo encuentra. El /super del host de
//       clientes queda bloqueado (redirige a /login) salvo en desarrollo local.
// ─────────────────────────────────────────────────────────────────────────────
export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const adminHost = (process.env.PANEL_ADMIN_HOST || "").toLowerCase();
  const isLocalhost =
    host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");

  // Passthrough técnico (APIs)
  if (pathname.startsWith("/api")) return setCspHeaders(NextResponse.next(), null);

  // ── Host ADMIN oculto: SOLO panel /super ──────────────────────────────────
  if (adminHost && host === adminHost) {
    if (pathname.startsWith("/super")) return setCspHeaders(NextResponse.next(), null);
    return NextResponse.redirect(new URL("/super", req.url));
  }

  // ── Host de CLIENTES ──────────────────────────────────────────────────────
  if (pathname.startsWith("/webhooks")) return setCspHeaders(NextResponse.next(), null);
  if (pathname === "/demo" || pathname.startsWith("/demo/")) {
    return setCspHeaders(NextResponse.next(), null);
  }
  // El panel admin no se ve desde el host de clientes (solo dev local)
  if (pathname.startsWith("/super")) {
    if (isLocalhost) return setCspHeaders(NextResponse.next(), null);
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const session = await getSession(req);
  const sessionSlug = session ? normalizeSubdominio(session.subdominio) : null;

  // Login genérico
  if (pathname === "/login") {
    if (session?.platformAdmin) return NextResponse.redirect(new URL("/super", req.url));
    if (sessionSlug) return NextResponse.redirect(new URL("/dashboard", req.url));
    return setCspHeaders(NextResponse.next(), null);
  }

  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0] ?? "";

  // ── NO autenticado ────────────────────────────────────────────────────────
  if (!session || !sessionSlug) {
    // Página inicial → login directo (sin landing de marketing)
    if (segments.length === 0) return NextResponse.redirect(new URL("/login", req.url));
    // Entrada del cliente: /{slug} → renderizar el login (el form lee el slug del path)
    if (segments.length === 1 && !RESERVED_FIRST.has(first)) {
      const slug = normalizeSubdominio(first) ?? first;
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return setCspHeaders(NextResponse.rewrite(url), slug);
    }
    // /{slug}/pagina sin sesión → a la entrada de esa cuenta
    if (segments.length > 1 && !RESERVED_FIRST.has(first)) {
      const slug = normalizeSubdominio(first) ?? first;
      return NextResponse.redirect(new URL(`/${slug}`, req.url));
    }
    // Ruta reservada sin sesión → login
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // ── Autenticado (tenant desde la SESIÓN) ──────────────────────────────────
  if (session.mustChangePassword && pathname !== "/cambiar-password") {
    return NextResponse.redirect(new URL("/cambiar-password", req.url));
  }
  if (session.tipoUsuario === "enfoque" && pathname !== "/enfoque") {
    return NextResponse.redirect(new URL("/enfoque", req.url));
  }
  // Raíz, o entrada /{su-propio-slug} estando logueado → su dashboard
  if (segments.length === 0) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (segments.length === 1 && normalizeSubdominio(first) === sessionSlug) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Rewrite por sesión: /pagina → /app/{sessionSlug}/pagina
  const url = req.nextUrl.clone();
  url.pathname = `/app/${sessionSlug}${pathname}`;
  return setCspHeaders(NextResponse.rewrite(url), sessionSlug);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
