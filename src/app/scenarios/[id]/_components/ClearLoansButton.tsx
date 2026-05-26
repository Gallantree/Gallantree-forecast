"use client";

import { useState, useTransition } from "react";
import { ConfirmModal } from "./ConfirmModal";

export function ClearLoansButton({
  loanCount,
  clearAction,
}: {
  loanCount: number;
  clearAction: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  function handleConfirm() {
    setShowConfirm(false);
    startTransition(async () => {
      await clearAction();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={pending}
        className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        {pending ? "Clearing…" : `Clear all (${loanCount})`}
      </button>

      {showConfirm && (
        <ConfirmModal
          title={`Delete ALL ${loanCount.toLocaleString()} loans?`}
          body="This cannot be undone. Capital programs, growth profiles, and the rest of the scenario stay untouched — only the loan book is wiped."
          confirmLabel="Delete all loans"
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
