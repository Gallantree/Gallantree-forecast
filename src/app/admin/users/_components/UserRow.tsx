"use client";

import { useRouter } from "next/navigation";
import type React from "react";

/**
 * Renders a clickable users-table row. Clicks anywhere outside the right-most
 * "Actions" cell navigate to the user detail page; clicks inside Actions
 * (which contains the Edit modal trigger) are left alone so the modal opens
 * instead of navigating away.
 */
export function UserRow({ userId, children }: { userId: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-no-row-nav]")) return;
        router.push(`/admin/users/${userId}`);
      }}
      className="cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-yellow-50/40"
    >
      {children}
    </tr>
  );
}
