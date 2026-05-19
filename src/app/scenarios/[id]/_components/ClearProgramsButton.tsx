"use client";

import { useTransition } from "react";

export function ClearProgramsButton({
  programCount,
  clearAction,
}: {
  programCount: number;
  // Already bound to scenarioId via .bind(null, scenarioId) at the call
  // site, matching the ClearLoansButton pattern.
  clearAction: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    const ok = window.confirm(
      `Delete ALL ${programCount.toLocaleString()} capital programs from this scenario?\n\nThis cannot be undone. The loan book and all other scenario data stay untouched — only the capital programs (CRE CLO / CMBS / Warehouse / MIT / Other) are wiped. Loans currently routed to a program will be left as orphans you can re-link after re-seeding.`,
    );
    if (!ok) return;
    startTransition(async () => {
      await clearAction();
    });
  }

  if (programCount === 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
    >
      {pending ? "Clearing…" : `Clear all (${programCount})`}
    </button>
  );
}
