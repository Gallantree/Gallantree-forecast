// Edge-safe Auth.js config. Imported by middleware (Edge runtime, no
// Node.js modules allowed) AND by auth.ts (Node runtime, which extends it
// with the MongoDB adapter + real email-provider implementation).
//
// Keep this file dependency-free of Mongoose, the MongoDB adapter,
// SendGrid, and anything else that touches Node's `crypto`/`fs`/`net`.

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify-request",
    error: "/login",
  },
  // JWT sessions are required for middleware-based gating: the session cookie
  // is self-contained and edge-decodable, no DB lookup needed per request.
  // Database sessions would force every middleware hit through the adapter
  // (which can't run in the Edge runtime).
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 }, // 30 days
  callbacks: {
    // Runs in middleware to decide whether to let the request through.
    // Returning `false` triggers a redirect to `pages.signIn`.
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const path = request.nextUrl.pathname;
      const isAdminRoute = path.startsWith("/admin");
      if (isAdminRoute) return isLoggedIn;
      return true;
    },
    // Map JWT → session object that components see via `await auth()`.
    // The enriching `jwt` callback (in auth.ts) puts userType/status onto the
    // token at sign-in; here we just surface them.
    async session({ session, token }) {
      if (session.user && token) {
        type EnrichedToken = {
          sub?: string;
          id?: string;
          userType?: string;
          status?: string;
        };
        const t = token as EnrichedToken;
        const u = session.user as unknown as {
          id?: string;
          userType?: string;
          status?: string;
        };
        u.id = t.id ?? t.sub;
        if (t.userType) u.userType = t.userType;
        if (t.status) u.status = t.status;
      }
      return session;
    },
  },
  // Empty in the edge config; auth.ts adds the real email provider with the
  // MongoDB adapter behind it.
  providers: [],
} satisfies NextAuthConfig;
