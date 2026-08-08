import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const EMAIL_FROM = process.env.EMAIL_FROM ?? "no-reply@leadmaster.com.co";

interface LoginCodeEmailParams {
  to: string;
  code: string;
}

/**
 * Envía el código de verificación para el login sin contraseña.
 * @returns true si el correo salió (o se logueó en dev sin RESEND_API_KEY).
 */
export async function sendLoginCodeEmail({ to, code }: LoginCodeEmailParams): Promise<boolean> {
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email] (dev, sin RESEND_API_KEY) Código de login para ${to}: ${code}`);
      return true;
    }
    console.error("[email] RESEND_API_KEY no configurada — no se puede enviar el código de login");
    return false;
  }

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;padding:24px">
  <h2 style="color:#111827">Tu código de acceso a LeadMaster</h2>
  <p>Usa este código para iniciar sesión. Expira en 10 minutos.</p>
  <p style="margin:24px 0;text-align:center">
    <span style="display:inline-block;padding:14px 28px;background:#f3f4f6;border-radius:8px;font-family:monospace;font-size:32px;font-weight:bold;letter-spacing:8px">${escapeHtml(code)}</span>
  </p>
  <p style="margin-top:32px;font-size:13px;color:#6b7280">
    Si no intentaste iniciar sesión, puedes ignorar este correo.
  </p>
</body>
</html>`.trim();

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `${code} es tu código de acceso a LeadMaster`,
      html,
    });
    return true;
  } catch (err) {
    console.error("[email] Error enviando código de login:", err);
    return false;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
