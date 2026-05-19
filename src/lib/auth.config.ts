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
  // JWT sessions: Auth.js v5 signs the cookie with jose's SignJWT and verifies
  // it on every request via jose's jwtVerify — so the "use jose" requirement
  // is met by the framework itself. We just tune lifetime here.
  //
  // maxAge = 2h hard expiry. updateAge = 30min — within that window, an active
  // session is silently rotated forward, so a user who keeps working doesn't
  // get kicked out mid-task; but a session that's been idle for 2h is dead.
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 2,
    updateAge: 60 * 30,
  },
  callbacks: {
    // Runs in middleware to decide whether to let the request through.
    // Returning `false` triggers a redirect to `pages.signIn` with a
    // ?callbackUrl=<original-path> appended so the user lands back where they
    // were after signing in.
    //
    // Default: deny. Public allow-list below.
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const path = request.nextUrl.pathname;
      // Public routes — accessible without a session.
      if (path === "/login" || path.startsWith("/login/") || path.startsWith("/api/auth/")) {
        return true;
      }
      return isLoggedIn;
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
