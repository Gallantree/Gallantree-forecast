"use client";

import { useRef, useState, useTransition } from "react";
import { fmtMoneyInput, parseDecimalInput } from "@/utils/format";
import type { LoanEditPayload } from "../_actions";

export interface LoanEditInitial {
  _id: string;
  loanId: string;
  borrower?: string;
  lenderOfRecord?: string;
  channel: "CRE_CLO" | "CMBS" | "Warehouse" | "Non-Conforming";
  capitalProgramId?: string;
  balance: string; // raw decimal string from server
  originationDate: string; // YYYY-MM-DD
  maturityDate: string;
  termMonths: number;
  nimDefaultBps?: number;
  nimNegFloorBps?: number;
  nimHardFloorBps?: number;
  creditSpreadBps?: number;
  internalScore?: number;
  internalGrade?: string;
  lvr?: string;
  dscr?: string;
}

const CHANNELS: { value: LoanEditInitial["channel"]; label: string }[] = [
  { value: "CRE_CLO", label: "CRE CLO" },
  { value: "CMBS", label: "CMBS" },
  { value: "Warehouse", label: "Warehouse" },
  { value: "Non-Conforming", label: "Non-Conforming" },
];

export function LoanRowActions({
  initial,
  programs,
  updateAction,
  deleteAction,
}: {
  initial: LoanEditInitial;
  programs: { _id: string; name: string; type: string }[];
  updateAction: (payload: LoanEditPayload) => Promise<void>;
  deleteAction: () => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const editRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Edit form state
  const [loanId, setLoanId] = useState(initial.loanId);
  const [borrower, setBorrower] = useState(initial.borrower ?? "");
  const [lenderOfRecord, setLenderOfRecord] = useState(initial.lenderOfRecord ?? "");
  const [channel, setChannel] = useState<LoanEditInitial["channel"]>(initial.channel);
  const [capitalProgramId, setCapitalProgramId] = useState(initial.capitalProgramId ?? "");
  const [balance, setBalance] = useState(fmtMoneyInput(initial.balance));
  const [originationDate, setOriginationDate] = useState(initial.originationDate);
  const [maturityDate, setMaturityDate] = useState(initial.maturityDate);
  const [termMonths, setTermMonths] = useState(String(initial.termMonths));
  const [nimDefaultBps, setNimDefaultBps] = useState(
    initial.nimDefaultBps !== undefined ? String(initial.nimDefaultBps) : "",
  );
  const [nimNegFloorBps, setNimNegFloorBps] = useState(
    initial.nimNegFloorBps !== undefined ? String(initial.nimNegFloorBps) : "",
  );
  const [nimHardFloorBps, setNimHardFloorBps] = useState(
    initial.nimHardFloorBps !== undefined ? String(initial.nimHardFloorBps) : "",
  );
  const [creditSpreadBps, setCreditSpreadBps] = useState(
    initial.creditSpreadBps !== undefined ? String(initial.creditSpreadBps) : "",
  );
  const [internalScore, setInternalScore] = useState(
    initial.internalScore !== undefined ? String(initial.internalScore) : "",
  );
  const [internalGrade, setInternalGrade] = useState(initial.internalGrade ?? "");
  const [lvr, setLvr] = useState(initial.lvr ?? "");
  const [dscr, setDscr] = useState(initial.dscr ?? "");

  function showEdit() {
    setMenuOpen(false);
    setEditOpen(true);
    editRef.current?.showModal();
  }
  function hideEdit() {
    editRef.current?.close();
    setEditOpen(false);
  }
  function showDelete() {
    setMenuOpen(false);
    setDeleteOpen(true);
    deleteRef.current?.showModal();
  }
  function hideDelete() {
    deleteRef.current?.close();
    setDeleteOpen(false);
  }

  function onSave() {
    const payload: LoanEditPayload = {
      loanId: loanId.trim(),
      borrower: borrower.trim() || undefined,
      lenderOfRecord: lenderOfRecord.trim() || undefined,
      channel,
      capitalProgramId: capitalProgramId || undefined,
      balance: parseDecimalInput(balance),
      originationDate,
      maturityDate,
      termMonths: Number(termMonths) || 0,
      nimDefaultBps: nimDefaultBps ? Number(nimDefaultBps) : undefined,
      nimNegFloorBps: nimNegFloorBps ? Number(nimNegFloorBps) : undefined,
      nimHardFloorBps: nimHardFloorBps ? Number(nimHardFloorBps) : undefined,
      creditSpreadBps: creditSpreadBps ? Number(creditSpreadBps) : undefined,
      internalScore: internalScore ? Number(internalScore) : undefined,
      internalGrade: internalGrade.trim() || undefined,
      lvr: lvr ? parseDecimalInput(lvr) : undefined,
      dscr: dscr ? parseDecimalInput(dscr) : undefined,
    };
    startTransition(async () => {
      await updateAction(payload);
      hideEdit();
    });
  }

  function onConfirmDelete() {
    startTransition(async () => {
      await deleteAction();
      hideDelete();
    });
  }

  return (
    <>
      {/* Kebab menu via native <details> for click-outside-to-close */}
      <details
        open={menuOpen}
        onToggle={(e) => setMenuOpen((e.target as HTMLDetailsElement).open)}
        className="relative inline-block"
      >
        <summary
          aria-label="Row actions"
          className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 [&::-webkit-details-marker]:hidden"
          style={{ listStyle: "none" }}
        >
          <span className="text-base leading-none">⋮</span>
        </summary>
        <div className="absolute right-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-md border border-zinc-200 bg-white text-xs shadow-lg">
          <button
            type="button"
            onClick={showEdit}
            className="block w-full px-3 py-1.5 text-left hover:bg-zinc-100"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={showDelete}
            className="block w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50"
          >
            Delete
          </button>
        </div>
      </details>

      {/* Edit modal */}
      <dialog
        ref={editRef}
        onClose={() => setEditOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {editOpen && (
          <div className="flex w-[720px] flex-col gap-4 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Edit loan · {initial.loanId}</h2>
              <span className="font-mono text-[10px] text-zinc-400">{initial._id}</span>
            </header>

            <section className="grid grid-cols-3 gap-3">
              <Field label="Loan ID">
                <input
                  value={loanId}
                  onChange={(e) => setLoanId(e.target.value)}
                  required
                  className="rounded-md border border-zinc-300 px-2 py-1 font-mono"
                />
              </Field>
              <Field label="Borrower">
                <input
                  value={borrower}
                  onChange={(e) => setBorrower(e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                />
              </Field>
              <Field label="Lender of Record">
                <input
                  value={lenderOfRecord}
                  onChange={(e) => setLenderOfRecord(e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                />
              </Field>

              <Field label="Channel" hint="routes NIM revenue account">
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as LoanEditInitial["channel"])}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                >
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Capital program" hint="optional alignment">
                <select
                  value={capitalProgramId}
                  onChange={(e) => setCapitalProgramId(e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                >
                  <option value="">— Unassigned —</option>
                  {programs.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Balance $">
                <input
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>

              <Field label="Origination date" hint="YYYY-MM-DD">
                <input
                  type="date"
                  value={originationDate}
                  onChange={(e) => setOriginationDate(e.target.value)}
                  required
                  className="rounded-md border border-zinc-300 px-2 py-1 font-mono"
                />
              </Field>
              <Field label="Maturity date" hint="YYYY-MM-DD">
                <input
                  type="date"
                  value={maturityDate}
                  onChange={(e) => setMaturityDate(e.target.value)}
                  required
                  className="rounded-md border border-zinc-300 px-2 py-1 font-mono"
                />
              </Field>
              <Field label="Term (months)">
                <input
                  value={termMonths}
                  onChange={(e) => setTermMonths(e.target.value)}
                  inputMode="numeric"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>

              <Field label="NIM Default (bps)">
                <input
                  value={nimDefaultBps}
                  onChange={(e) => setNimDefaultBps(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="NIM Neg Floor (bps)">
                <input
                  value={nimNegFloorBps}
                  onChange={(e) => setNimNegFloorBps(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="NIM Hard Floor (bps)">
                <input
                  value={nimHardFloorBps}
                  onChange={(e) => setNimHardFloorBps(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>

              <Field label="Credit spread (bps)">
                <input
                  value={creditSpreadBps}
                  onChange={(e) => setCreditSpreadBps(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="Internal score">
                <input
                  value={internalScore}
                  onChange={(e) => setInternalScore(e.target.value)}
                  inputMode="numeric"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="Internal grade">
                <input
                  value={internalGrade}
                  onChange={(e) => setInternalGrade(e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                />
              </Field>

              <Field label="LVR" hint="ratio 0..1">
                <input
                  value={lvr}
                  onChange={(e) => setLvr(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="DSCR">
                <input
                  value={dscr}
                  onChange={(e) => setDscr(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
            </section>

            <footer className="flex justify-end gap-2 border-t border-zinc-200 pt-3">
              <button
                type="button"
                onClick={hideEdit}
                disabled={pending}
                className="rounded-md px-3 py-1 text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={pending}
                className="rounded-md bg-zinc-900 px-4 py-1 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
            </footer>
          </div>
        )}
      </dialog>

      {/* Delete confirmation */}
      <dialog
        ref={deleteRef}
        onClose={() => setDeleteOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {deleteOpen && (
          <div className="flex w-[420px] flex-col gap-4 p-6 text-sm">
            <header>
              <h2 className="text-base font-semibold">Delete loan?</h2>
            </header>
            <p className="text-zinc-700">
              You&apos;re about to permanently delete loan{" "}
              <span className="font-mono font-semibold">{initial.loanId}</span>
              {initial.borrower ? (
                <>
                  {" "}— <span className="italic">{initial.borrower}</span>
                </>
              ) : null}
              . This will remove it from the loan book and stop its NIM contribution
              to revenue. <span className="font-semibold">This can&apos;t be undone.</span>
            </p>
            <footer className="flex justify-end gap-2 border-t border-zinc-200 pt-3">
              <button
                type="button"
                onClick={hideDelete}
                disabled={pending}
                className="rounded-md px-3 py-1 text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={pending}
                className="rounded-md bg-rose-600 px-4 py-1 font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete loan"}
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
        {hint ? <span className="ml-1 font-normal lowercase text-zinc-400">· {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
