import { NextResponse } from "next/server";
import { withAuthAndPermission } from "@/lib/api-auth";
import { createUsuario } from "@/lib/queries/usuarios";

const VALID_ROLES = new Set(["superadmin", "usuario"]);
const MAX_BATCH = 100;

export async function POST(req: Request) {
  return withAuthAndPermission(req, "gestionar_usuarios", async (idCuenta) => {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Se esperaba FormData con campo 'file'" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Campo 'file' (CSV) es obligatorio" }, { status: 400 });
    }

    const text = await (file as File).text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    if (lines.length < 2) {
      return NextResponse.json({ error: "El CSV debe tener al menos una fila de datos (después del header)" }, { status: 400 });
    }

    // Remove header row
    const [_header, ...dataLines] = lines;
    const rows = dataLines.slice(0, MAX_BATCH);

    const creados: number[] = [];
    const errores: Array<{ email: string; error: string }> = [];

    for (const line of rows) {
      const cols = line.split(",").map((c) => c.trim());
      const [nombre = "", email = "", rolRaw = "", fathom_api_key = ""] = cols;

      if (!email) {
        errores.push({ email: "(vacío)", error: "Email es obligatorio" });
        continue;
      }
      if (!nombre) {
        errores.push({ email, error: "Nombre es obligatorio" });
        continue;
      }

      const rol = VALID_ROLES.has(rolRaw) ? rolRaw : "usuario";

      try {
        const { user } = await createUsuario(idCuenta, {
          nombre,
          email,
          rol,
          fathom: fathom_api_key || undefined,
        });
        creados.push(user.id);
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        if (err?.code === "23505") {
          errores.push({ email, error: "Email ya registrado" });
        } else {
          errores.push({ email, error: err?.message ?? "Error desconocido" });
        }
      }
    }

    return NextResponse.json({ creados: creados.length, errores });
  });
}
