// Edge-runtime middleware. Gates the entire app behind sign-in; the
// `authorized` callback in src/lib/auth.config.ts maintains the public
// allow-list (/login, /login/*, /api/auth/*).
//
// CRITICAL: this file runs on Next.js's Edge runtime, which forbids Node-only
// modules (mongoose, mongodb, crypto, fs, etc.). Importing `@/lib/auth` here
// would pull Mongoose in transitively and break the Edge bundle — so we wire
// up the edge-safe `auth.config` directly and let the `authorized` callback
// decide whether to let the request through.

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Run on every path EXCEPT:
  //   - Next.js internals (_next/static, _next/image)
  //   - The Auth.js endpoints themselves (otherwise sign-in callbacks would
  //     redirect to /login before the magic-link token can be verified)
  //   - Common static assets at the root of /public
  // The authorized() callback in auth.config.ts handles the rest of the
  // public allow-list (e.g. /login) so deep-linked routes get a clean
  // ?callbackUrl=<original-path> redirect when the user isn't signed in.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon\\.ico|gallantree-logo\\.png|robots\\.txt|sitemap\\.xml).*)",
  ],
};
