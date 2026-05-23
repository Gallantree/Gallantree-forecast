// Auth.js v5 — magic-link auth for /admin routes.
//
// The MongoDB adapter persists Auth.js's standard collections (users,
// accounts, sessions, verification_tokens) into the same database we use for
// the rest of the app. We give the adapter its OWN MongoClient (via
// src/lib/mongoClient.ts) rather than borrowing Mongoose's — Mongoose 9 ships
// with mongodb@7/bson@7 while @auth/mongodb-adapter expects mongodb@6/bson@6,
// and mixing them throws "Unsupported BSON version" at the wire format. The
// two pools coexist fine pointing at the same database.
//
// Magic-link emails go through SendGrid. If SENDGRID_API_KEY is unset we log
// the sign-in URL to the server console — handy in dev when you haven't
// configured email yet.

import { MongoDBAdapter } from "@auth/mongodb-adapter";
import sgMail from "@sendgrid/mail";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { authConfig } from "@/lib/auth.config";
import { authClientPromise } from "@/lib/mongoClient";

interface EmailProviderArgs {
  identifier: string;
  url: string;
  expires: Date;
  provider: { from?: string };
  token: string;
  theme: unknown;
  request: Request;
}

// Variables exposed to a SendGrid Dynamic Template. Multiple aliases for the
// sign-in URL so any naming the template uses works — {{loginUrl}} (the
// Gallantree login email's variable name), {{magic_link}}, {{url}}, or
// {{sign_in_url}}.
//
// `loginCode` is currently empty: Auth.js v5 doesn't expose a short OTP-style
// code to type into a form — the raw verification token in the URL is the
// only credential. If your template's OTP box shows blank, either remove it
// from the template, or ask to wire up full one-time-code entry (separate
// collection + /api/auth/verify-code endpoint + verify-request input).
function templateVars(email: string, url: string, expiresMinutes: number) {
  return {
    // Primary aliases — at least one of these will match any template.
    loginUrl: url,
    magic_link: url,
    url,
    sign_in_url: url,
    // Placeholder so {{loginCode}} renders blank cleanly. Replace with a real
    // OTP once code-entry sign-in is built.
    loginCode: "",
    email,
    expires_minutes: expiresMinutes,
    expires_in: `${expiresMinutes} minutes`,
  };
}

async function sendMagicLink({ identifier, url, expires, provider }: EmailProviderArgs) {
  const from = provider.from || process.env.SENDGRID_FROM_EMAIL;
  const apiKey = process.env.SENDGRID_API_KEY;
  const templateId = process.env.SENDGRID_LOGIN_EMAIL_ID;

  if (!apiKey) {
    // Dev fallback — print the link to the server console so the developer
    // can click through without configuring SendGrid.
    console.log(
      `\n[auth] Magic link for ${identifier}:\n  ${url}\n  (set SENDGRID_API_KEY to send real email)\n`,
    );
    return;
  }
  if (!from) {
    throw new Error("SENDGRID_FROM_EMAIL is not set — magic-link emails cannot be sent.");
  }

  sgMail.setApiKey(apiKey);

  const expiresMinutes = Math.max(1, Math.round((expires.getTime() - Date.now()) / 60_000));

  // Branch 1 — Dynamic Template path. When SENDGRID_LOGIN_EMAIL_ID is set,
  // SendGrid renders the email from the template; subject + HTML/text come
  // from the template editor in the SendGrid UI.
  if (templateId) {
    await sgMail.send({
      to: identifier,
      from,
      templateId,
      dynamicTemplateData: templateVars(identifier, url, expiresMinutes),
    });
    return;
  }

  // Branch 2 — inline HTML fallback (used when no template is configured).
  const subject = "Sign in to Gallantree";
  const html = `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;color:#18181b">
      <h1 style="font-size:20px;margin:0 0 8px;font-weight:600">Sign in to Gallantree</h1>
      <p style="font-size:14px;line-height:1.5;color:#52525b;margin:0 0 24px">
        Click the button below to sign in. This link expires in ${expiresMinutes} minutes and can only be used once.
      </p>
      <p style="margin:0 0 24px">
        <a href="${url}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;font-weight:500">Sign in</a>
      </p>
      <p style="font-size:12px;color:#a1a1aa;margin:0 0 4px">Or copy and paste this URL:</p>
      <p style="font-size:12px;color:#52525b;word-break:break-all;margin:0">${url}</p>
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0 16px" />
      <p style="font-size:11px;color:#a1a1aa;margin:0">If you didn't request this, you can safely ignore it.</p>
    </div>
  `;
  await sgMail.send({
    to: identifier,
    from,
    subject,
    text: `Sign in to Gallantree: ${url}\n\nThis link expires in ${expiresMinutes} minutes.`,
    html,
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: MongoDBAdapter(authClientPromise),
  // session.strategy comes from authConfig ("jwt") — see auth.config.ts for
  // why we don't use the database strategy here.
  callbacks: {
    ...authConfig.callbacks,
    // Server-side gate: block sign-in for any email that isn't an active
    // user. Runs BEFORE the magic-link email is sent (and before any user
    // doc is created), so non-existent / disabled emails never receive a
    // link — even if a request bypasses the client-side pre-check.
    async signIn({ user, account, profile }) {
      // Email magic-link: the address being signed in is `user.email`.
      // Google OAuth: same field, populated from the verified Google profile.
      const raw = (user?.email ?? (profile as { email?: string } | null)?.email ?? "")
        .toString()
        .trim()
        .toLowerCase();
      if (!raw) return false;
      const client = await authClientPromise;
      const db = client.db();
      const doc = await db
        .collection("users")
        .findOne({ email: raw }, { projection: { _id: 1, status: 1 } });
      if (!doc) {
        // No invite on record — refuse silently. Returning false aborts
        // the flow; for email provider this means no email is ever sent.
        // Log so admins can spot brute-force attempts.
        console.warn(
          `[auth] Sign-in blocked: no account for ${raw} (provider=${account?.provider ?? "unknown"})`,
        );
        return false;
      }
      if (doc.status === "disabled") {
        console.warn(
          `[auth] Sign-in blocked: account disabled for ${raw} (provider=${account?.provider ?? "unknown"})`,
        );
        return false;
      }
      return true;
    },
    // Enrich the JWT once, on sign-in: pull our Gallantree-specific user
    // fields (userType, status) onto the token so subsequent decodes have
    // them without re-querying Mongo. Edge-runtime decoding in middleware
    // then surfaces them via the `session` callback in auth.config.
    async jwt({ token, user, trigger }) {
      // `user` is only populated on the initial sign-in callback. After that,
      // subsequent invocations just have `token`.
      const t = token as Record<string, unknown>;
      const isSignIn = Boolean(user) || trigger === "signIn";

      if (isSignIn) {
        const email = user?.email ?? token.email;
        if (email) {
          const client = await authClientPromise;
          const db = client.db();
          const doc = await db
            .collection("users")
            .findOne(
              { email: String(email).toLowerCase() },
              { projection: { _id: 1, userType: 1, status: 1 } },
            );
          if (doc) {
            t.id = String(doc._id);
            t.userType = doc.userType;
            t.status = doc.status;
            t.statusCheckedAt = Date.now();
            // Stamp lastLogin (best-effort, don't block sign-in if it fails).
            await db
              .collection("users")
              .updateOne({ _id: doc._id }, { $set: { lastLogin: new Date() } })
              .catch(() => {});
          }
        }
      } else {
        // On subsequent token reads, re-verify user status every 5 minutes.
        // This ensures a disabled account is kicked out within 5 min rather
        // than waiting the full 2-hour session maxAge.
        const checkedAt = (t.statusCheckedAt as number | undefined) ?? 0;
        if (Date.now() - checkedAt > 5 * 60 * 1000) {
          const email = token.email;
          if (email) {
            try {
              const client = await authClientPromise;
              const db = client.db();
              const doc = await db
                .collection("users")
                .findOne(
                  { email: String(email).toLowerCase() },
                  { projection: { _id: 1, status: 1 } },
                );
              if (!doc || doc.status === "disabled") {
                // Return null to invalidate the session immediately.
                return null;
              }
              t.statusCheckedAt = Date.now();
            } catch {
              // DB unreachable — let the existing token stand rather than
              // kicking out all active users during an outage.
            }
          }
        }
      }
      return token;
    },
  },
  providers: [
    {
      id: "email",
      name: "Email",
      type: "email",
      from: process.env.SENDGRID_FROM_EMAIL,
      maxAge: 60 * 60, // 1-hour link validity
      // biome-ignore lint/suspicious/noExplicitAny: next-auth EmailConfig type signature for sendVerificationRequest is not exported cleanly
      sendVerificationRequest: sendMagicLink as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      server: {}, // unused — sendVerificationRequest handles delivery
      options: {},
    },
    // Google OAuth — only enabled when both env vars are set. Auth.js reads
    // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET automatically via the Google()
    // provider factory; the conditional spread keeps the button hidden on
    // /login when the env isn't configured.
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? [Google] : []),
  ],
});
