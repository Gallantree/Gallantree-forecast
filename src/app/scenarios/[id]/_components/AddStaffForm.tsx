"use client";

import { useMemo, useState, useTransition } from "react";
import { fmtMoneyInput } from "@/utils/format";

export interface PlainPayband {
  band: number;
  tier: number;
  salaryAnnual: number | null;
  caseByCase: boolean;
}

export function AddStaffForm({
  expenseAccounts,
  paybands,
  defaultStartPeriod,
  defaultCpiPct,
  defaultSuperPct,
  addAction,
}: {
  expenseAccounts: { code: string; name: string }[];
  paybands: PlainPayband[];
  defaultStartPeriod: string;
  defaultCpiPct?: string;
  defaultSuperPct?: string;
  addAction: (formData: FormData) => Promise<void>;
}) {
  const [band, setBand] = useState("");
  const [tier, setTier] = useState("");
  const [salary, setSalary] = useState("");
  const [salaryDirty, setSalaryDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const paybandLookup = useMemo(() => {
    const m = new Map<string, PlainPayband>();
    for (const p of paybands) m.set(`${p.band}-${p.tier}`, p);
    return m;
  }, [paybands]);

  const matchedPayband =
    band && tier ? paybandLookup.get(`${band}-${tier}`) ?? null : null;

  function applyBand(nextBand: string, nextTier: string) {
    setBand(nextBand);
    setTier(nextTier);
    if (!nextBand || !nextTier) return;
    const pb = paybandLookup.get(`${nextBand}-${nextTier}`);
    if (!pb) return;
    // Only auto-fill if the user hasn't manually edited the salary input.
    if (!salaryDirty) {
      if (pb.caseByCase) {
        setSalary(""); // case-by-case has no fixed value
      } else if (pb.salaryAnnual !== null) {
        setSalary(fmtMoneyInput(pb.salaryAnnual));
      }
    }
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      await addAction(formData);
      // Reset form on success
      setBand("");
      setTier("");
      setSalary("");
      setSalaryDirty(false);
    });
  }

  return (
    <form
      action={onSubmit}
      className="flex flex-wrap items-end gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs"
    >
      <Field label="Name" hint="optional">
        <input
          name="personName"
          className="w-44 rounded-md border border-zinc-300 px-2 py-1"
        />
      </Field>
      <Field label="Role / title">
        <input
          name="role"
          required
          className="w-44 rounded-md border border-zinc-300 px-2 py-1"
        />
      </Field>
      <Field label="Employment">
        <select
          name="employmentType"
          defaultValue="full_time"
          className="w-28 rounded-md border border-zinc-300 px-2 py-1"
        >
          <option value="full_time">Full-time</option>
          <option value="part_time">Part-time</option>
          <option value="contractor">Contractor</option>
        </select>
      </Field>
      <Field label="FTE" hint="1.0 full-time, 0.6 = 3 days/wk">
        <input
          name="ftePct"
          defaultValue="1"
          inputMode="decimal"
          className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
        />
      </Field>
      <Field label="Band">
        <select
          name="band"
          value={band}
          onChange={(e) => applyBand(e.target.value, tier)}
          className="w-24 rounded-md border border-zinc-300 px-2 py-1"
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
          className="w-24 rounded-md border border-zinc-300 px-2 py-1"
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
        label="Salary $/yr"
        hint={
          matchedPayband?.caseByCase
            ? "case-by-case — enter manually"
            : matchedPayband
              ? `from B${band} T${tier}; editable`
              : "FTE 100%; pick band or enter manually"
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
          className="w-36 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
        />
      </Field>
      <Field label="Super %" hint="AU SG (default 12)">
        <input
          name="superPct"
          defaultValue={defaultSuperPct ?? "12"}
          inputMode="decimal"
          className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
        />
      </Field>
      <Field label="On-cost %" hint="payroll tax, workcover">
        <input
          name="onCostPct"
          defaultValue="8"
          inputMode="decimal"
          className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
        />
      </Field>
      <Field label="CPI % p.a." hint={defaultCpiPct ? `default ${defaultCpiPct}` : "salary growth"}>
        <input
          name="salaryGrowthPctAnnual"
          defaultValue={defaultCpiPct ?? ""}
          inputMode="decimal"
          className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
        />
      </Field>
      <Field label="OPEX account">
        <select
          name="accountCode"
          required
          defaultValue=""
          className="w-48 rounded-md border border-zinc-300 px-2 py-1"
        >
          <option value="" disabled>
            Select account…
          </option>
          {expenseAccounts.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} — {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Start" hint="YYYY-MM">
        <input
          name="startPeriodKey"
          required
          defaultValue={defaultStartPeriod}
          pattern="\d{4}-(0[1-9]|1[0-2])"
          className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-center font-mono"
        />
      </Field>
      <Field label="End" hint="optional">
        <input
          name="endPeriodKey"
          pattern="\d{4}-(0[1-9]|1[0-2])"
          className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-center font-mono"
        />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="ml-auto rounded-md bg-zinc-900 px-4 py-1.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add staff"}
      </button>
    </form>
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
