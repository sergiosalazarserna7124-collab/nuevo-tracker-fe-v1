"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { DEMO_GENERATORS } from "@/lib/demo-data";
import { useUserFilter } from "@/contexts/UserFilterContext";

export function useApiData<T>(
  url: string,
  params?: Record<string, string | undefined>,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const pathname = usePathname();
  const isDemo = pathname?.startsWith("/demo") ?? false;

  const [data, setData] = useState<T | null>(() => {
    if (isDemo) {
      const path = url.split("?")[0];
      const gen = DEMO_GENERATORS[path];
      return gen ? (gen() as T) : null;
    }
    return null;
  });
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  let effectiveCloserEmails: string[] = [];
  try {
    const ctx = useUserFilter();
    effectiveCloserEmails = ctx.effectiveCloserEmails ?? [];
  } catch {
    effectiveCloserEmails = [];
  }

  const serialized = JSON.stringify(params ?? {});
  // Clave string ESTABLE de los emails: usar el array directo como dependencia
  // del useCallback provoca un loop infinito de refetch, porque `?? []` (y el
  // valor del contexto) crean una referencia nueva en cada render.
  const closerEmailsKey = effectiveCloserEmails.join(",");

  const fetchData = useCallback(async () => {
    // En modo demo: regenerar datos falsos sin fetch
    if (isDemo) {
      const path = url.split("?")[0];
      const gen = DEMO_GENERATORS[path];
      if (gen) setData(gen() as T);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    try {
      const sp = new URLSearchParams();
      const p = JSON.parse(serialized) as Record<string, string | undefined>;
      for (const [k, v] of Object.entries(p)) {
        if (v != null) sp.set(k, v);
      }

      if (closerEmailsKey && !sp.has("closerEmails")) {
        sp.set("closerEmails", closerEmailsKey);
      }

      const res = await fetch(`${url}?${sp.toString()}`, {
        signal: ctrl.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const body = await res.json().catch(() => null) as { error?: string; debug?: string } | null;
        const message = body?.debug ?? body?.error ?? `Error ${res.status}`;
        throw new Error(message);
      }

      const json = (await res.json()) as T;
      if (!ctrl.signal.aborted) setData(json);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (!ctrl.signal.aborted) setError((e as Error).message);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [url, serialized, closerEmailsKey]);

  useEffect(() => {
    if (isDemo || !enabled) return;
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData, isDemo, enabled]);

  return { data, loading, error, refetch: fetchData };
}
