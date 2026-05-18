"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { fmtMoneyInput } from "@/utils/format";
import type { PlainPayband } from "./AddStaffForm";

export interface EditStaffData {
  _id: string;
  personName?: string;
  role: string;
  accountCode: string;
  employmentType?: "full_time" | "part_time" | "contractor";
  ftePct: string;
  band?: number;
  tier?: number;
  startPeriodKey: string;
  endPeriodKey?: string;
  salaryAnnual: string;
  superPct: string;
  onCostPct: string;
  salaryGrowthPctAnnual: string;
}

export function EditStaffButton({
  row,
  expenseAccounts,
  paybands,
  updateAction,
}: {
  row: EditStaffData;
  expenseAccounts: { code: string; name: string }[];
  paybands: PlainPayband[];
  updateAction: (formData: FormData) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [band, setBand] = useState(row.band !== undefined ? String(row.band) : "");
  const [tier, setTier] = useState(row.tier !== undefined ? String(row.tier) : "");
  const [salary, setSalary] = useState(row.salaryAnnual);
  const [salaryDirty, setSalaryDirty] = useState(false);

  const paybandLookup = useMemo(() => {
    const m = new Map<string, PlainPayband>();
    for (const p of paybands) m.set(`${p.band}-${p.tier}`, p);
    return m;
  }, [paybands]);

  function applyBand(nextBand: string, nextTier: string) {
    setBand(nextBand);
    setTier(nextTier);
    if (!nextBand || !nextTier) return;
    const pb = paybandLookup.get(`${nextBand}-${nextTier}`);
    if (!pb || salaryDirty) return;
    if (pb.caseByCase) {
      // Leave existing salary alone for case-by-case
      return;
    }
    if (pb.salaryAnnual !== null) {
      setSalary(fmtMoneyInput(pb.salaryAnnual));
    }
  }

  function show() {
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      await updateAction(formData);
      hide();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        aria-label="Edit staff member"
      >
        Edit
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <form action={onSubmit} className="flex w-[640px] flex-col gap-4 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Edit staff member</h2>
              <span className="font-mono text-[10px] text-zinc-400">{row._id}</span>
            </header>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <input
                  name="personName"
                  defaultValue={row.personName ?? ""}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                  placeholder="Optional"
                />
              </Field>
              <Field label="Role / title">
                <input
                  name="role"
                  required
                  defaultValue={row.role}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                />
              </Field>

              <Field label="Employment type">
                <select
                  name="employmentType"
                  defaultValue={row.employmentType ?? "full_time"}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                >
                  <option value="full_time">Full-time</option>
                  <option value="part_time">Part-time</option>
                  <option value="contractor">Contractor</option>
                </select>
              </Field>
              <Field label="FTE (1.0 = full-time)">
                <input
                  name="ftePct"
                  defaultValue={row.ftePct}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>

              <Field label="Band">
                <select
                  name="band"
                  value={band}
                  onChange={(e) => applyBand(e.target.value, tier)}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                >
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((b) => (
                    <option key={b} value={b}>
                      Band {b}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tier">
                <select
                  name="tier"
                  value={tier}
                  onChange={(e) => applyBand(band, e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                >
                  <option value="">—</option>
                  {[1, 2, 3, 4].map((t) => (
                    <option key={t} value={t}>
                      Tier {t}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={
                  band && tier && paybandLookup.get(`${band}-${tier}`)
                    ? `Salary $ / yr · from B${band} T${tier} (editable)`
                    : "Salary $ / yr (FTE 100%)"
                }
              >
                <input
                  name="salaryAnnual"
                  value={salary}
                  onChange={(e) => {
                    setSalary(e.target.value);
                    setSalaryDirty(true);
                  }}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="OPEX account">
                <select
                  name="accountCode"
                  required
                  defaultValue={row.accountCode}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                >
                  {expenseAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Super %">
                <input
                  name="superPct"
                  defaultValue={row.superPct}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="On-cost %">
                <input
                  name="onCostPct"
                  defaultValue={row.onCostPct}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>

              <Field label="CPI / salary growth % p.a.">
                <input
                  name="salaryGrowthPctAnnual"
                  defaultValue={row.salaryGrowthPctAnnual}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="Start period (YYYY-MM)">
                <input
                  name="startPeriodKey"
                  required
                  defaultValue={row.startPeriodKey}
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-center font-mono"
                />
              </Field>

              <Field label="End period (optional)">
                <input
                  name="endPeriodKey"
                  defaultValue={row.endPeriodKey ?? ""}
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-center font-mono"
                  placeholder="—"
                />
              </Field>
            </div>

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
                type="submit"
                disabled={pending}
                className="rounded-md bg-zinc-900 px-4 py-1 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
            </footer>
          </form>
        )}
      </dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
