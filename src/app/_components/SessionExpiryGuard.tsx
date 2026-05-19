"use client";

// Watches the next-auth session client-side. When the user *was* signed in
// and the session transitions to "unauthenticated" (token expired, signed out
// in another tab, etc.) AND we're not on a public route, we pop a modal
// rather than hard-redirecting — the user keeps their context and just needs
// to re-authenticate.
//
// Server-side gating still happens in middleware: a fresh navigation or
// refresh while expired will be redirected to /login by the `authorized`
// callback in auth.config.ts. This guard is the live-page fallback for users
// who sit on a tab while their token lapses.

import { usePathname } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

const PUBLIC_PREFIXES = ["/login", "/api/auth"];

function isPublicPath(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function SessionExpiryGuard() {
  const { status } = useSession();
  const pathname = usePathname();
  const [wasAuthed, setWasAuthed] = useState(false);
  const [open, setOpen] = useState(false);

  // Track whether we've ever observed an authenticated session in this tab.
  // We only pop the modal when transitioning *out of* authenticated — not
  // for users who simply land on a public page without a session.
  useEffect(() => {
    if (status === "authenticated") {
      setWasAuthed(true);
      setOpen(false);
    } else if (status === "unauthenticated" && wasAuthed && !isPublicPath(pathname)) {
      setOpen(true);
    }
  }, [status, wasAuthed, pathname]);

  // Lock body scroll while modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-[100] bg-zinc-900/50 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expiry-title"
        className="fixed inset-0 z-[101] grid place-items-center p-4"
      >
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
          <h2 id="session-expiry-title" className="text-base font-semibold text-zinc-900">
            Your session has expired
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            For your security, sessions end after 2 hours of inactivity. Please sign in again to
            continue.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                // Send the user through Auth.js's signIn flow with the
                // current path preserved as callbackUrl — after they
                // re-authenticate they land exactly where they were.
                void signIn(undefined, { callbackUrl: pathname || "/" });
              }}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/login";
              }}
              className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Go to sign-in page
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
