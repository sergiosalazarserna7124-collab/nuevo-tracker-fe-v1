import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { cuentas } from "@/lib/db/schema";
import { verifySuperCookie, getSuperCookieName } from "@/lib/super-verify";
import SuperTenantList from "./SuperTenantList";
import SuperLoginForm from "./SuperLoginForm";
import CrearCuentaForm from "./CrearCuentaForm";

export default async function SuperPage() {
  // Panel admin INDEPENDIENTE de next-auth: se autentica solo con la cookie
  // "super" (firmada, validada contra PLATFORM_ADMIN_EMAIL/PASSWORD). Así no
  // depende de la sesión de next-auth, que da problemas entre subdominios.
  const cookieStore = await cookies();
  const superCookie = cookieStore.get(getSuperCookieName())?.value;
  if (!verifySuperCookie(superCookie)) {
    return <SuperLoginForm />;
  }

  const rows = await db
    .select({
      id_cuenta: cuentas.id_cuenta,
      nombre_cuenta: cuentas.nombre_cuenta,
      subdominio: cuentas.subdominio,
      estado_cuenta: cuentas.estado_cuenta,
    })
    .from(cuentas)
    .orderBy(cuentas.subdominio);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Administración Plataforma
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Crea y administra las cuentas de clientes
            </p>
          </div>
          <p className="text-sm text-slate-500">{process.env.PLATFORM_ADMIN_EMAIL}</p>
        </div>
        <CrearCuentaForm />
        <SuperTenantList tenants={rows} />
      </div>
    </div>
  );
}
