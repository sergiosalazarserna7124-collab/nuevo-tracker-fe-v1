/**
 * DemoSessionContext
 * Provee un contexto de sesión falso para las páginas de demo.
 * Reemplaza UserFilterContext con datos mock para que los componentes
 * reales funcionen sin auth ni BD.
 */

"use client";

import { useMemo, useState, type ReactNode } from "react";
import { UserFilterContext, type AsesorOption, type UserFilterContextValue } from "@/contexts/UserFilterContext";

const DEMO_SESSION = {
  email: "demo@leadmaster.com.co",
  name: "Demo User",
  rol: "admin",
  permisos: null,
  permisosArray: [
    "ver_dashboard", "ver_performance", "ver_asesor", "ver_comisiones",
    "ver_bandeja", "ver_adquisicion", "ver_ads", "ver_sistema",
    "ver_documentacion", "ver_configuracion", "editar_registros",
  ],
  id_cuenta: 999,
  platformAdmin: false,
  tipoUsuario: "analista" as const,
};

const DEMO_ASESORES: AsesorOption[] = [
  { id: "1", name: "Valentina Ríos", email: "valentina@demo.leadmaster.com.co" },
  { id: "2", name: "Sebastián Mora", email: "sebastian@demo.leadmaster.com.co" },
  { id: "3", name: "Camila Torres", email: "camila@demo.leadmaster.com.co" },
  { id: "4", name: "Diego Herrera", email: "diego@demo.leadmaster.com.co" },
  { id: "5", name: "Mariana Castro", email: "mariana@demo.leadmaster.com.co" },
];

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [soloMisDatos, setSoloMisDatos] = useState(false);
  const [asesoresSeleccionados, setAsesoresSeleccionados] = useState<string[]>([]);

  const toggleAsesor = (email: string) => {
    setAsesoresSeleccionados((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const setAsesorSeleccionado = (email: string) => {
    setAsesoresSeleccionados(email ? [email] : []);
  };

  const value = useMemo<UserFilterContextValue>(() => ({
    session: DEMO_SESSION,
    sessionLoading: false,
    soloMisDatos,
    toggleSoloMisDatos: () => setSoloMisDatos((v) => !v),
    canViewAll: true,
    canEdit: true,
    effectiveCloserEmail: undefined,
    effectiveCloserEmails: [],
    asesoresSeleccionados,
    toggleAsesor,
    asesorSeleccionado: asesoresSeleccionados[0] ?? "",
    setAsesorSeleccionado,
    asesores: DEMO_ASESORES,
  }), [soloMisDatos, asesoresSeleccionados]);

  return (
    <UserFilterContext.Provider value={value}>
      {children}
    </UserFilterContext.Provider>
  );
}


