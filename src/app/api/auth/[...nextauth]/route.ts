// Auth.js v5 catch-all route — exposes /api/auth/signin, /api/auth/callback,
// /api/auth/session, /api/auth/signout, etc.
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
export const runtime = "nodejs";
