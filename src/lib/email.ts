import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const EMAIL_FROM = process.env.EMAIL_FROM ?? "no-reply@leadmaster.com.co";

interface ProvisionalEmailParams {
  to: string;
  nombre: string;
  provisional: string;
  loginUrl: string;
}

export async function sendProvisionalPasswordEmail({
  to,
  nombre,
  provisional,
  loginUrl,
}: ProvisionalEmailParams): Promise<void> {
  if (process.env.EMAIL_ENABLED !== "true" || !resend) return;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;padding:24px">
  <h2 style="color:#111827">Bienvenido a LeadMaster</h2>
  <p>Hola <strong>${escapeHtml(nombre)}</strong>,</p>
  <p>Se ha creado tu cuenta en LeadMaster. Usa las siguientes credenciales para iniciar sesión:</p>
  <table style="margin:16px 0;border-collapse:collapse">
    <tr>
      <td style="padding:6px 12px;font-weight:bold">Email</td>
      <td style="padding:6px 12px">${escapeHtml(to)}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px;font-weight:bold">Contraseña provisional</td>
      <td style="padding:6px 12px;font-family:monospace;background:#f3f4f6;border-radius:4px">${escapeHtml(provisional)}</td>
    </tr>
  </table>
  <p>Al iniciar sesión por primera vez se te pedirá que cambies tu contraseña.</p>
  <p style="margin-top:24px">
    <a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">
      Iniciar sesión
    </a>
  </p>
  <p style="margin-top:32px;font-size:13px;color:#6b7280">
    Si no solicitaste esta cuenta, puedes ignorar este correo.
  </p>
</body>
</html>`.trim();

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: "Tu cuenta de LeadMaster — Contraseña provisional",
      html,
    });
  } catch (err) {
    console.error("[email] Error enviando contraseña provisional:", err);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
