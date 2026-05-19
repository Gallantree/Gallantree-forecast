"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

export interface UserMenuUser {
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  userType?: string | null;
}

function initialsFrom(u: UserMenuUser): string {
  const full =
    [u.firstName, u.lastName].filter(Boolean).join(" ") ||
    u.name ||
    u.email ||
    "";
  return full
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0]!)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function displayName(u: UserMenuUser): string {
  return (
    [u.firstName, u.lastName].filter(Boolean).join(" ") ||
    u.name ||
    u.email
  );
}

export function UserMenu({ user }: { user: UserMenuUser | null }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Click outside to close.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
  }, [open]);

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
      >
        Sign in
      </Link>
    );
  }

  const isSuper = user.userType === "superadmin";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full pr-2 hover:bg-zinc-100"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-zinc-200 text-[11px] font-semibold text-zinc-700">
          {initialsFrom(user)}
        </span>
        <span className="text-sm font-medium text-zinc-800">
          {displayName(user)}
        </span>
        <span className="text-zinc-400">▾</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg"
        >
          {isSuper ? (
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-zinc-50"
            >
              <CrownIcon />
              <span>Admin</span>
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut({ callbackUrl: "/login" });
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
          >
            <LogoutIcon />
            <span>Log Off</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CrownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 18h18" />
      <path d="M5 18l-2-9 5 4 4-8 4 8 5-4-2 9" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
