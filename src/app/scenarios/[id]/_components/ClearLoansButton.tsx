"use client";

import { useTransition } from "react";

export function ClearLoansButton({
  loanCount,
  clearAction,
}: {
  loanCount: number;
  // Already bound to scenarioId via .bind(null, scenarioId) at the call site,
  // matching the existing server-action pattern.
  clearAction: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    const ok = window.confirm(
      `Delete ALL ${loanCount.toLocaleString()} loans from this scenario?\n\nThis cannot be undone. Capital programs, growth profiles, and the rest of the scenario stay untouched — only the loan book is wiped.`,
    );
    if (!ok) return;
    startTransition(async () => {
      await clearAction();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
    >
      {pending ? "Clearing…" : `Clear all (${loanCount})`}
    </button>
  );
}
