import type { Metadata } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeadMaster",
  description: "Panel de control",
};

// Aplica el tema guardado ANTES del primer paint para evitar el "flash".
const themeInitScript = `
try {
  var t = localStorage.getItem("lm_theme");
  document.documentElement.dataset.theme = (t === "light") ? "light" : "dark";
} catch (e) { document.documentElement.dataset.theme = "dark"; }
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
