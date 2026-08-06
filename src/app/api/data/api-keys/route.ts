import { NextResponse } from "next/server";
import { withAuthAndPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { apiKeysCuenta } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { logAudit } from "@/lib/audit";

// GET — listar API keys de la cuenta
export async function GET(req: Request) {
  return withAuthAndPermission(req, "configurar_sistema", async (idCuenta) => {
    const keys = await db
      .select({
        id_key: apiKeysCuenta.id_key,
        nombre_key: apiKeysCuenta.nombre_key,
        token: apiKeysCuenta.token,
        activa: apiKeysCuenta.activa,
        created_at: apiKeysCuenta.created_at,
      })
      .from(apiKeysCuenta)
      .where(eq(apiKeysCuenta.id_cuenta, idCuenta))
      .orderBy(apiKeysCuenta.created_at);

    return NextResponse.json({ keys });
  });
}

// POST — crear nueva API key
export async function POST(req: Request) {
  return withAuthAndPermission(req, "configurar_sistema", async (idCuenta, email) => {
    const body = await req.json() as { nombre_key?: string };
    const nombre = body.nombre_key?.trim() || "API Key";
    const token = "lm_" + randomBytes(24).toString("hex");
    const [created] = await db
      .insert(apiKeysCuenta)
      .values({ id_cuenta: idCuenta, nombre_key: nombre, token, activa: true })
      .returning();
    void logAudit(idCuenta, email, "CREATE_API_KEY", { nombre_key: nombre });
    return NextResponse.json({ key: created });
  });
}

// DELETE — desactivar API key
export async function DELETE(req: Request) {
  return withAuthAndPermission(req, "configurar_sistema", async (idCuenta, email) => {
    const { searchParams } = new URL(req.url);
    const id = parseInt(searchParams.get("id") ?? "0");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    await db
      .update(apiKeysCuenta)
      .set({ activa: false })
      .where(and(eq(apiKeysCuenta.id_key, id), eq(apiKeysCuenta.id_cuenta, idCuenta)));
    void logAudit(idCuenta, email, "DELETE_API_KEY", { id_key: id });
    return NextResponse.json({ ok: true });
  });
}
