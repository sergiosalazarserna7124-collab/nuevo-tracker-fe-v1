"use client";

/**
 * Tracker de actividad del dashboard: registra páginas visitadas (page_view)
 * y clics en botones/links (click). Acumula eventos y los envía en lotes a
 * /api/data/actividad cada 10 s, al llenarse la cola o al ocultarse la pestaña
 * (sendBeacon). Se monta una sola vez en el layout del dashboard.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

interface Evento {
  tipo: "page_view" | "click";
  pagina: string;
  detalle?: string;
}

const FLUSH_INTERVAL_MS = 10_000;
const FLUSH_AT = 10;

export default function ActivityTracker() {
  const pathname = usePathname();
  const queue = useRef<Evento[]>([]);

  useEffect(() => {
    const flush = (useBeacon = false) => {
      if (queue.current.length === 0) return;
      const eventos = queue.current.splice(0, queue.current.length);
      const body = JSON.stringify({ eventos });
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/data/actividad",
          new Blob([body], { type: "application/json" }),
        );
        return;
      }
      fetch("/api/data/actividad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    };

    const push = (e: Evento) => {
      queue.current.push(e);
      if (queue.current.length >= FLUSH_AT) flush();
    };

    const onClick = (ev: MouseEvent) => {
      const target = (ev.target as HTMLElement | null)?.closest?.(
        "button, a, [role='button']",
      ) as HTMLElement | null;
      if (!target) return;
      const label =
        target.getAttribute("aria-label")?.trim() ||
        target.getAttribute("title")?.trim() ||
        target.textContent?.trim().replace(/\s+/g, " ") ||
        "(sin texto)";
      push({
        tipo: "click",
        pagina: window.location.pathname,
        detalle: label.slice(0, 100),
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush(true);
    };

    document.addEventListener("click", onClick, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(() => flush(), FLUSH_INTERVAL_MS);

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
      flush(true);
    };
  }, []);

  // Cada cambio de ruta = page_view (el POST del lote lo recoge después)
  useEffect(() => {
    if (!pathname) return;
    queue.current.push({ tipo: "page_view", pagina: pathname });
  }, [pathname]);

  return null;
}
