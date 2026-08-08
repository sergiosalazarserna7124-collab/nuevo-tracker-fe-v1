import { NextResponse } from "next/server";
import { withAuthAndPermission } from "@/lib/api-auth";
import { listUsuarios, createUsuario, updateUsuario, deleteUsuario } from "@/lib/queries/usuarios";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  return withAuthAndPermission(req, "gestionar_usuarios", async (idCuenta) => {
    const data = await listUsuarios(idCuenta);
    return NextResponse.json(data);
  });
}

export async function POST(req: Request) {
  return withAuthAndPermission(req, "gestionar_usuarios", async (idCuenta, email) => {
    const body = await req.json();
    if (!body.email) {
      return NextResponse.json({ error: "Email es obligatorio" }, { status: 400 });
    }
    try {
      const { user, fathomWarning } = await createUsuario(idCuenta, body);
      void logAudit(idCuenta, email, "CREATE_USER", {
        nuevo_usuario: body.email,
        rol: body.rol ?? "usuario",
      });
      return NextResponse.json({ ...user, fathomWarning }, { status: 201 });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === "23505") {
        return NextResponse.json({ error: "El email ya está registrado" }, { status: 409 });
      }
      throw e;
    }
  });
}

export async function PUT(req: Request) {
  return withAuthAndPermission(req, "gestionar_usuarios", async (idCuenta, email) => {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "Se requiere id del usuario" }, { status: 400 });
    }
    const { fathomWarning } = await updateUsuario(idCuenta, body.id, body);
    void logAudit(idCuenta, email, "EDIT_ROL_USUARIO", {
      id_usuario: body.id,
      campos_editados: {
        ...(body.rol !== undefined && { rol: body.rol }),
        ...(body.permisos !== undefined && { permisos: body.permisos }),
        ...(body.nombre !== undefined && { nombre: body.nombre }),
        ...(body.email !== undefined && { email_nuevo: body.email }),
        ...(body.tipo_usuario !== undefined && { tipo_usuario: body.tipo_usuario }),
      },
    });
    return NextResponse.json({ ok: true, fathomWarning });
  });
}

export async function DELETE(req: Request) {
  return withAuthAndPermission(req, "gestionar_usuarios", async (idCuenta, email) => {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Se requiere ?id=" }, { status: 400 });
    }
    await deleteUsuario(idCuenta, Number(id));
    void logAudit(idCuenta, email, "DELETE_USER", { id_usuario: Number(id) });
    return NextResponse.json({ ok: true });
  });
}
