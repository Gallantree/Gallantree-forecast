"use client";

import { useState, useTransition } from "react";
import { ConfirmModal } from "./ConfirmModal";

export function ClearProgramsButton({
  programCount,
  clearAction,
}: {
  programCount: number;
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

  if (programCount === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={pending}
        className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        {pending ? "Clearing…" : `Clear all (${programCount})`}
      </button>

      {showConfirm && (
        <ConfirmModal
          title={`Delete ALL ${programCount.toLocaleString()} capital programs?`}
          body="This cannot be undone. The loan book and all other scenario data stay untouched — only the capital programs (CRE CLO / CMBS / Warehouse / MIT / Other) are wiped. Loans currently routed to a program will be left as orphans you can re-link after re-seeding."
          confirmLabel="Delete all programs"
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
