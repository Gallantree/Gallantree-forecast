"use client";

// Thin client wrapper around next-auth's SessionProvider so we can mount it
// inside the server-rendered root layout. `refetchInterval` polls
// /api/auth/session every 60s so a session that lapses on the server is
// detected quickly without a navigation; `refetchOnWindowFocus` catches the
// case where the user comes back from a long idle period.

import { SessionProvider } from "next-auth/react";

export function SessionProviderClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider refetchInterval={60} refetchOnWindowFocus>
      {children}
    </SessionProvider>
  );
}
