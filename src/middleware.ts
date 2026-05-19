// Edge-runtime middleware. Gates /admin behind sign-in.
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
  // Run on /admin and /login. Forecast routes stay open.
  matcher: ["/admin/:path*", "/login"],
};
