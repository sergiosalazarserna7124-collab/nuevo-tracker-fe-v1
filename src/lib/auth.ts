import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const isProduction = process.env.NODE_ENV === "production";
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "leadmaster.com.co";
const cookieDomain = isProduction ? `.${rootDomain}` : undefined;

// SameSite=none + Secure permite que la cookie funcione dentro de iframes
// (ej. embebido en GHL). En dev no aplicamos none porque requiere HTTPS.
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  cookies: {
    sessionToken: {
      name: isProduction
        ? `__Secure-next-auth.session-token`
        : `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
        secure: isProduction,
        domain: cookieDomain,
      },
    },
  },
});
