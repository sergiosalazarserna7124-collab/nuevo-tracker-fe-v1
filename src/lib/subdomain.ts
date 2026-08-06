const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "leadmaster.com.co";

/**
 * Normaliza un valor de subdominio que puede venir de la BD en muchos formatos
 * y devuelve siempre solo el slug para comparaciones y construcción de URLs.
 *
 * Acepta por ejemplo:
 * - "tracker-grupomexa"
 * - "tracker-grupomexa.leadmaster.com.co"
 * - "https://tracker-grupomexa.leadmaster.com.co"
 * - "https//tracker-grupomexa.leadmaster.com.co" (sin dos puntos)
 * - "http://tracker-grupomexa.leadmaster.com.co"
 * - "https://tracker-grupomexa.leadmaster.com.co/"
 */
export function normalizeSubdominio(
  raw: string | null | undefined,
  rootDomain: string = ROOT_DOMAIN
): string | null {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/\/+$/, "");

  try {
    if (s.includes("//")) {
      if (!s.includes("://")) {
        s = s.replace(/^(https?)\/\//, "$1://");
      }
      const url = new URL(s.startsWith("http") ? s : "https://" + s);
      const host = url.hostname;
      if (host.endsWith("." + rootDomain)) {
        return host.slice(0, -(rootDomain.length + 1));
      }
      if (host === rootDomain) return null;
      return host;
    }
    if (s.endsWith("." + rootDomain)) {
      return s.slice(0, -(rootDomain.length + 1));
    }
    return s;
  } catch {
    return s;
  }
}
