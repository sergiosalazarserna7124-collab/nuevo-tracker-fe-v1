"use client";

import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { useSession, type SessionInfo } from "@/hooks/useSession";

export interface AsesorOption {
  id: string;
  name: string;
  email?: string;
}

export interface UserFilterContextValue {
  session: SessionInfo | null;
  sessionLoading: boolean;
  soloMisDatos: boolean;
  toggleSoloMisDatos: () => void;
  canViewAll: boolean;
  canEdit: boolean;
  /** Un solo email cuando hay un único seleccionado (legacy/combobox) */
  effectiveCloserEmail: string | undefined;
  /** Lista de emails seleccionados para el filtro (multi-selección); vacío = por defecto Yo */
  effectiveCloserEmails: string[];
  asesoresSeleccionados: string[];
  toggleAsesor: (email: string) => void;
  /** Para combobox de una sola elección: primer seleccionado o vacío */
  asesorSeleccionado: string;
  /** Pone la selección a un solo email (para combobox que no usa multi) */
  setAsesorSeleccionado: (email: string) => void;
  asesores: AsesorOption[];
}

export const UserFilterContext = createContext<UserFilterContextValue | null>(null);

const LS_ASESORES = "lm_asesores_seleccionados";

function parseStoredAsesores(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) && arr.every((x) => typeof x === "string") ? arr : [];
  } catch {
    return [];
  }
}

export function UserFilterProvider({ children }: { children: ReactNode }) {
  const { session, loading: sessionLoading, canViewAll, canEdit } = useSession();

  // "Solo mis datos" es un filtro de VISTA, NO una preferencia persistida.
  // AUT-1563: el código viejo forzaba `true` y lo persistía en un localStorage
  // compartido por origen para CADA no-admin; luego cualquier admin que abriera
  // el dashboard en ese mismo navegador heredaba el `true` y veía TODO en 0
  // (un manager no tiene llamadas propias) sin causa visible. Un filtro que
  // pone en 0 el dashboard entero no debe sobrevivir a un reload.
  // Por eso: los admin arrancan viendo TODO (false) y el toggle vive solo en
  // memoria durante la sesión; los no-admin siempre ven solo lo suyo (derivado).
  const [soloMisDatosPref, setSoloMisDatosPref] = useState(false);

  const soloMisDatos = canViewAll ? soloMisDatosPref : true;

  const [asesoresSeleccionados, setAsesoresSeleccionadosState] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    return parseStoredAsesores(localStorage.getItem(LS_ASESORES));
  });

  const [asesores, setAsesores] = useState<AsesorOption[]>([]);

  const toggleAsesor = useCallback((email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setAsesoresSeleccionadosState((prev) => {
      const next = prev.includes(trimmed) ? prev.filter((e) => e !== trimmed) : [...prev, trimmed];
      if (typeof window !== "undefined") localStorage.setItem(LS_ASESORES, JSON.stringify(next));
      return next;
    });
  }, []);

  const setAsesorSeleccionado = useCallback((email: string) => {
    const trimmed = email.trim();
    const next = trimmed ? [trimmed] : [];
    setAsesoresSeleccionadosState(next);
    if (typeof window !== "undefined") localStorage.setItem(LS_ASESORES, JSON.stringify(next));
  }, []);

  const asesorSeleccionado = asesoresSeleccionados.length > 0 ? asesoresSeleccionados[0] : "";

  useEffect(() => {
    if (!canViewAll || sessionLoading) return;
    fetch("/api/data/asesores")
      .then((r) => (r.ok ? r.json() : []))
      .then(setAsesores)
      .catch(() => setAsesores([]));
  }, [canViewAll, sessionLoading]);

  const toggleSoloMisDatos = () => {
    if (!canViewAll) return;
    setSoloMisDatosPref((prev) => !prev);
  };

  const effectiveCloserEmails = useMemo(() => {
    if (!session) return [];
    if (!canViewAll) return [session.email].filter(Boolean) as string[];
    if (!soloMisDatos) return [];
    if (asesoresSeleccionados.length > 0) return asesoresSeleccionados;
    return [session.email].filter(Boolean) as string[];
  }, [session, canViewAll, soloMisDatos, asesoresSeleccionados]);

  const effectiveCloserEmail = useMemo(() => {
    if (effectiveCloserEmails.length === 0) return undefined;
    if (effectiveCloserEmails.length === 1) return effectiveCloserEmails[0];
    return undefined;
  }, [effectiveCloserEmails]);

  const value = useMemo<UserFilterContextValue>(() => ({
    session,
    sessionLoading,
    soloMisDatos,
    toggleSoloMisDatos,
    canViewAll,
    canEdit,
    effectiveCloserEmail,
    effectiveCloserEmails,
    asesoresSeleccionados,
    toggleAsesor,
    asesorSeleccionado,
    setAsesorSeleccionado,
    asesores,
  }), [session, sessionLoading, soloMisDatos, canViewAll, canEdit, effectiveCloserEmail, effectiveCloserEmails, asesoresSeleccionados, toggleAsesor, asesorSeleccionado, setAsesorSeleccionado, asesores]);

  return (
    <UserFilterContext.Provider value={value}>
      {children}
    </UserFilterContext.Provider>
  );
}

export function useUserFilter() {
  const ctx = useContext(UserFilterContext);
  if (!ctx) throw new Error("useUserFilter must be used within UserFilterProvider");
  return ctx;
}
