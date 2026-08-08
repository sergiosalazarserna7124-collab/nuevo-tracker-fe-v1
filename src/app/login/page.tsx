import LoginForm from "@/components/login-form";
import ThemeToggle from "@/components/theme-toggle";

// Leer las env de Google en cada request (no en build): si se agregan o
// quitan GOOGLE_CLIENT_ID/SECRET, el botón aparece sin rebuild.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">
      <ThemeToggle />
      <LoginForm googleEnabled={googleEnabled} />
    </div>
  );
}
