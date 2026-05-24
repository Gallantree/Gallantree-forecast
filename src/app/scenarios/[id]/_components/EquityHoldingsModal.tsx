"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { updateEquityHoldings } from "../_actions";

// Plain-data props — no `{ toString: () => string }` shapes, so the
// component is safe to render from a server component. The parent (page.tsx)
// is responsible for projecting the relevant subset of program data into
// these shapes.

export interface AvailableEquityTranche {
  programId: string;
  programName: string;
  programType: "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER";
  trancheName: string;
  numNotes?: number;
}

export interface SavedEquityHolding {
  programId: string;
  trancheName: string;
}

function key(programId: string, trancheName: string): string {
  return `${programId}|${trancheName}`;
}

export function EquityHoldingsModal({
  scenarioId,
  fundId,
  fundName,
  available,
  initial,
}: {
  scenarioId: string;
  fundId: string;
  fundName: string;
  available: AvailableEquityTranche[];
  initial: SavedEquityHolding[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const initialSelected = useMemo(
    () => new Set(initial.map((h) => key(h.programId, h.trancheName))),
    [initial],
  );
  const [selected, setSelected] = useState<Set<string>>(initialSelected);

  function show() {
    setSelected(new Set(initialSelected));
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function toggle(k: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(available.map((t) => key(t.programId, t.trancheName))));
  }
  function selectNone() {
    setSelected(new Set());
  }

  function save() {
    const payload = Array.from(selected).map((k) => {
      const [programId, trancheName] = k.split("|");
      return { programId, trancheName };
    });
    startTransition(async () => {
      await updateEquityHoldings(scenarioId, fundId, payload);
      hide();
    });
  }

  const countLabel = `${selected.size} / ${available.length}`;

  // Group available tranches by program type for legibility.
  const byType = useMemo(() => {
    const groups: Record<string, AvailableEquityTranche[]> = {};
    for (const t of available) {
      const k = t.programType;
      if (!groups[k]) groups[k] = [];
      groups[k].push(t);
    }
    return groups;
  }, [available]);

  return (
    <>
      <button
        type="button"
        onClick={show}
        title="Manage captive equity-tranche holdings"
        className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50"
      >
        Equity holdings · {initialSelected.size}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="flex w-[640px] max-w-full flex-col gap-4 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <div>
                <h2 className="text-base font-semibold">Equity holdings — {fundName}</h2>
                <p className="text-[11px] text-zinc-500">
                  Select the equity tranches this fund acquires. Only equity tranches on other
                  programs in this scenario are listed.
                </p>
              </div>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-800">
                {countLabel}
              </span>
            </header>

            {available.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-xs text-zinc-500">
                No equity tranches found on other programs. Seed CRE CLO / CMBS / BSL programs
                first.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-zinc-700 hover:bg-zinc-100"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={selectNone}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-zinc-700 hover:bg-zinc-100"
                  >
                    Clear
                  </button>
                </div>

                <div className="max-h-[55vh] overflow-auto rounded-md border border-zinc-200">
                  {Object.entries(byType).map(([type, tranches]) => (
                    <div key={type}>
                      <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                        {type.replace("_", " ")} · {tranches.length} tranche
                        {tranches.length === 1 ? "" : "s"}
                      </div>
                      <ul>
                        {tranches.map((t) => {
                          const k = key(t.programId, t.trancheName);
                          const checked = selected.has(k);
                          return (
                            <li
                              key={k}
                              className={`flex items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2 last:border-b-0 ${
                                checked ? "bg-indigo-50/40" : ""
                              }`}
                            >
                              <label className="flex flex-1 cursor-pointer items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggle(k)}
                                  className="h-4 w-4 rounded border-zinc-300"
                                />
                                <div>
                                  <div className="font-medium text-zinc-900">{t.programName}</div>
                                  <div className="text-[11px] text-zinc-500">
                                    Tranche: {t.trancheName}
                                    {t.numNotes !== undefined
                                      ? ` · ${t.numNotes.toLocaleString()} notes`
                                      : ""}
                                  </div>
                                </div>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            )}

            <footer className="flex justify-end gap-2 border-t border-zinc-200 pt-3">
              <button
                type="button"
                onClick={hide}
                disabled={pending}
                className="rounded-md px-3 py-1 text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="rounded-md bg-zinc-900 px-4 py-1 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : `Save (${selected.size} selected)`}
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </>
  );
}
