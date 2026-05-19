"use client";

import { useState, useTransition } from "react";
import { fmtMoney2 } from "@/utils/format";
import { calibrateProgram } from "../_actions";

export function CalibrateProgramButton({
  scenarioId,
  programId,
}: {
  scenarioId: string;
  programId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "warn" } | null>(
    null,
  );

  function onClick() {
    startTransition(async () => {
      const res = await calibrateProgram(scenarioId, programId);
      if (res.ok) {
        setToast({
          msg: `Calibrated — new deal size ${fmtMoney2(res.newDealSize ?? "0")}.`,
          tone: "ok",
        });
        setTimeout(() => setToast(null), 4000);
      } else {
        setToast({
          msg: `Calibrate failed: ${res.error ?? "unknown error"}`,
          tone: "warn",
        });
        setTimeout(() => setToast(null), 6000);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        title="Scale liability tranches + deal size to match assigned-loan aggregate balance"
        className="rounded px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
      >
        {pending ? "Calibrating…" : "Calibrate"}
      </button>
      {toast && (
        <span
          className={`fixed bottom-4 right-4 z-50 rounded-md px-4 py-2 text-xs font-medium shadow-lg ${
            toast.tone === "warn"
              ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
              : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
          }`}
        >
          {toast.msg}
        </span>
      )}
    </>
  );
}
