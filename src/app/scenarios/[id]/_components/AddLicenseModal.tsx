"use client";

import { useRef, useState, useTransition } from "react";
import { parseDecimalInput } from "@/utils/format";
import type { PlatformLicensePayload } from "../_actions";

export type LicenseFormInitial = {
  name: string;
  type: "compliance" | "trustee";
  startPeriodKey: string;
  endPeriodKey?: string;
  notes?: string;
  // compliance
  tier?: "starter" | "standard" | "professional" | "custom";
  monthlyFeePerSeat?: string;
  seatCount?: number;
  seatGrowthPctAnnual?: string;
  billingFrequency?: "monthly" | "annual";
  annualDiscountPct?: string;
  // trustee
  monthlyFee?: string;
  configFee?: string;
  aumByYear?: string[];
  feePctOfAumByYear?: string[];
};

const TIER_PRESETS: Record<
  "starter" | "standard" | "professional",
  { monthly: string; seats: number }
> = {
  starter: { monthly: "79", seats: 2 },
  standard: { monthly: "319", seats: 5 },
  professional: { monthly: "1039", seats: 50 },
};

function defaultsForType(type: "compliance" | "trustee", startPeriod: string): LicenseFormInitial {
  if (type === "compliance") {
    return {
      name: "Compliance SaaS",
      type: "compliance",
      startPeriodKey: startPeriod,
      tier: "standard",
      monthlyFeePerSeat: "319",
      seatCount: 5,
      seatGrowthPctAnnual: "0",
      billingFrequency: "annual",
      annualDiscountPct: "20",
    };
  }
  return {
    name: "Trustee platform",
    type: "trustee",
    startPeriodKey: startPeriod,
    monthlyFee: "5000",
    configFee: "50000",
    aumByYear: ["0", "0", "0", "0", "0"],
    feePctOfAumByYear: ["0.05", "0.05", "0.05", "0.05", "0.05"],
  };
}

export function AddLicenseModal({
  defaultStartPeriod,
  fys,
  initial,
  saveAction,
  triggerLabel,
  triggerClassName,
}: {
  defaultStartPeriod: string;
  fys: number[];
  initial?: LicenseFormInitial;
  saveAction: (payload: PlatformLicensePayload) => Promise<void>;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = initial ?? defaultsForType("compliance", defaultStartPeriod);
  const [type, setType] = useState<"compliance" | "trustee">(seed.type);
  const [name, setName] = useState(seed.name);
  const [startPeriodKey, setStartPeriodKey] = useState(seed.startPeriodKey);
  const [endPeriodKey, setEndPeriodKey] = useState(seed.endPeriodKey ?? "");
  const [notes, setNotes] = useState(seed.notes ?? "");

  // Compliance
  const [tier, setTier] = useState<LicenseFormInitial["tier"]>(seed.tier ?? "standard");
  const [monthlyFeePerSeat, setMonthlyFeePerSeat] = useState(seed.monthlyFeePerSeat ?? "");
  const [seatCount, setSeatCount] = useState(
    seed.seatCount !== undefined ? String(seed.seatCount) : "",
  );
  const [seatGrowthPctAnnual, setSeatGrowthPctAnnual] = useState(
    seed.seatGrowthPctAnnual ?? "0",
  );
  const [billingFrequency, setBillingFrequency] = useState<"monthly" | "annual">(
    seed.billingFrequency ?? "annual",
  );
  const [annualDiscountPct, setAnnualDiscountPct] = useState(seed.annualDiscountPct ?? "20");

  // Trustee
  const [monthlyFee, setMonthlyFee] = useState(seed.monthlyFee ?? "");
  const [configFee, setConfigFee] = useState(seed.configFee ?? "");
  const horizonYears = fys.length;
  const [aumByYear, setAumByYear] = useState<string[]>(() =>
    padToLength(seed.aumByYear ?? [], horizonYears, "0"),
  );
  const [feePctOfAumByYear, setFeePctOfAumByYear] = useState<string[]>(() =>
    padToLength(seed.feePctOfAumByYear ?? [], horizonYears, "0"),
  );

  function show() {
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function applyTierPreset(t: NonNullable<LicenseFormInitial["tier"]>) {
    setTier(t);
    if (t === "custom") return;
    const p = TIER_PRESETS[t];
    setMonthlyFeePerSeat(p.monthly);
    setSeatCount(String(p.seats));
  }

  function setAumYear(i: number, val: string) {
    setAumByYear((arr) => arr.map((v, idx) => (idx === i ? val : v)));
  }
  function setFeePctYear(i: number, val: string) {
    setFeePctOfAumByYear((arr) => arr.map((v, idx) => (idx === i ? val : v)));
  }

  function onSave() {
    const payload: PlatformLicensePayload = {
      name: name.trim(),
      type,
      startPeriodKey,
      endPeriodKey: endPeriodKey.trim() || undefined,
      notes: notes.trim() || undefined,
      ...(type === "compliance"
        ? {
            tier,
            monthlyFeePerSeat: parseDecimalInput(monthlyFeePerSeat),
            seatCount: Number(seatCount) || 0,
            seatGrowthPctAnnual: parseDecimalInput(seatGrowthPctAnnual),
            billingFrequency,
            annualDiscountPct: parseDecimalInput(annualDiscountPct),
          }
        : {
            monthlyFee: parseDecimalInput(monthlyFee),
            configFee: parseDecimalInput(configFee),
            aumByYear: aumByYear.map((v) => parseDecimalInput(v)),
            feePctOfAumByYear: feePctOfAumByYear.map((v) => parseDecimalInput(v)),
          }),
    };
    startTransition(async () => {
      await saveAction(payload);
      hide();
    });
  }

  // Live preview: monthly revenue at t=0
  const previewMonthly =
    type === "compliance"
      ? computeCompliancePreview(monthlyFeePerSeat, seatCount, billingFrequency, annualDiscountPct)
      : computeTrusteeFirstMonth(monthlyFee, configFee, aumByYear[0] ?? "0", feePctOfAumByYear[0] ?? "0");

  return (
    <div className="inline-flex">
      <button
        type="button"
        onClick={show}
        className={
          triggerClassName ??
          "whitespace-nowrap rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
        }
      >
        {triggerLabel ?? "Add licence"}
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="flex w-[780px] flex-col gap-4 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">
                {initial ? "Edit platform licence" : "New platform licence"}
              </h2>
              <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setType("compliance")}
                  className={`rounded px-3 py-0.5 ${
                    type === "compliance" ? "bg-white shadow text-zinc-900" : "text-zinc-600"
                  }`}
                >
                  Compliance SaaS
                </button>
                <button
                  type="button"
                  onClick={() => setType("trustee")}
                  className={`rounded px-3 py-0.5 ${
                    type === "trustee" ? "bg-white shadow text-zinc-900" : "text-zinc-600"
                  }`}
                >
                  Trustee
                </button>
              </div>
            </header>

            {/* Common fields */}
            <section className="grid grid-cols-3 gap-3 text-xs">
              <Field label="Licence name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-md border border-zinc-300 px-2 py-1"
                />
              </Field>
              <Field label="Start" hint="YYYY-MM">
                <input
                  value={startPeriodKey}
                  onChange={(e) => setStartPeriodKey(e.target.value)}
                  required
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  className="w-full rounded-md border border-zinc-300 px-2 py-1 text-center font-mono"
                />
              </Field>
              <Field label="End" hint="optional">
                <input
                  value={endPeriodKey}
                  onChange={(e) => setEndPeriodKey(e.target.value)}
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  className="w-full rounded-md border border-zinc-300 px-2 py-1 text-center font-mono"
                />
              </Field>
            </section>

            {/* Type-specific fields */}
            {type === "compliance" ? (
              <section className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50/50 p-3 text-xs">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Compliance SaaS · per-seat subscription
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <Field label="Tier">
                    <select
                      value={tier}
                      onChange={(e) =>
                        applyTierPreset(e.target.value as NonNullable<LicenseFormInitial["tier"]>)
                      }
                      className="w-full rounded-md border border-zinc-300 px-2 py-1"
                    >
                      <option value="starter">Starter ($79)</option>
                      <option value="standard">Standard ($319)</option>
                      <option value="professional">Professional ($1,039)</option>
                      <option value="custom">Custom</option>
                    </select>
                  </Field>
                  <Field label="Monthly fee / seat $">
                    <input
                      value={monthlyFeePerSeat}
                      onChange={(e) => {
                        setMonthlyFeePerSeat(e.target.value);
                        setTier("custom");
                      }}
                      inputMode="decimal"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                    />
                  </Field>
                  <Field label="Seats">
                    <input
                      value={seatCount}
                      onChange={(e) => setSeatCount(e.target.value)}
                      inputMode="numeric"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                    />
                  </Field>
                  <Field label="Seat growth % p.a.">
                    <input
                      value={seatGrowthPctAnnual}
                      onChange={(e) => setSeatGrowthPctAnnual(e.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                    />
                  </Field>
                  <Field label="Billing">
                    <select
                      value={billingFrequency}
                      onChange={(e) =>
                        setBillingFrequency(e.target.value as "monthly" | "annual")
                      }
                      className="w-full rounded-md border border-zinc-300 px-2 py-1"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="annual">Annual</option>
                    </select>
                  </Field>
                  <Field
                    label="Annual discount %"
                    hint={billingFrequency === "annual" ? "applied" : "ignored"}
                  >
                    <input
                      value={annualDiscountPct}
                      onChange={(e) => setAnnualDiscountPct(e.target.value)}
                      disabled={billingFrequency !== "annual"}
                      inputMode="decimal"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums disabled:opacity-50"
                    />
                  </Field>
                </div>
              </section>
            ) : (
              <section className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50/50 p-3 text-xs">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Trustee licence · platform + AUM fees
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Monthly platform fee $">
                    <input
                      value={monthlyFee}
                      onChange={(e) => setMonthlyFee(e.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                    />
                  </Field>
                  <Field label="Configuration fee $" hint="one-off at start period">
                    <input
                      value={configFee}
                      onChange={(e) => setConfigFee(e.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                    />
                  </Field>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    AUM ($) and fee % per FY
                  </div>
                  <div className="grid gap-1 text-[11px]" style={{ gridTemplateColumns: `90px repeat(${horizonYears}, 1fr)` }}>
                    <div />
                    {fys.map((fy) => (
                      <div key={fy} className="text-center font-mono text-zinc-500">
                        FY{String(fy).slice(-2)}
                      </div>
                    ))}
                    <div className="self-center text-zinc-600">AUM $</div>
                    {aumByYear.map((v, i) => (
                      <input
                        key={`aum-${i}`}
                        value={v}
                        onChange={(e) => setAumYear(i, e.target.value)}
                        inputMode="decimal"
                        className="rounded border border-zinc-300 px-1.5 py-0.5 text-right text-[11px] tabular-nums"
                      />
                    ))}
                    <div className="self-center text-zinc-600">Fee % of AUM</div>
                    {feePctOfAumByYear.map((v, i) => (
                      <input
                        key={`fee-${i}`}
                        value={v}
                        onChange={(e) => setFeePctYear(i, e.target.value)}
                        inputMode="decimal"
                        className="rounded border border-zinc-300 px-1.5 py-0.5 text-right text-[11px] tabular-nums"
                      />
                    ))}
                  </div>
                </div>
              </section>
            )}

            <div className="rounded-md bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
              Preview ·{" "}
              <span className="font-semibold text-emerald-700">
                ${previewMonthly.toLocaleString("en-AU", { maximumFractionDigits: 0 })}
              </span>{" "}
              {type === "compliance"
                ? "effective monthly revenue at t=0"
                : "first month (incl. configuration fee + Y1 AUM fee)"}
            </div>

            <Field label="Notes" hint="optional">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-2 py-1"
              />
            </Field>

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
                onClick={onSave}
                disabled={pending || !name.trim()}
                className="rounded-md bg-zinc-900 px-4 py-1 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : initial ? "Save changes" : "Create licence"}
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </div>
  );
}

function padToLength<T>(arr: T[], n: number, fill: T): T[] {
  if (arr.length >= n) return arr.slice(0, n);
  return [...arr, ...Array(n - arr.length).fill(fill)];
}

function computeCompliancePreview(
  monthlyFee: string,
  seats: string,
  billing: "monthly" | "annual",
  discountPct: string,
): number {
  const m = Number(parseDecimalInput(monthlyFee));
  const s = Number(parseDecimalInput(seats));
  const d = billing === "annual" ? 1 - Number(parseDecimalInput(discountPct)) / 100 : 1;
  return m * s * d;
}

function computeTrusteeFirstMonth(
  monthly: string,
  config: string,
  aumY1: string,
  feePctY1: string,
): number {
  const m = Number(parseDecimalInput(monthly));
  const c = Number(parseDecimalInput(config));
  const a = Number(parseDecimalInput(aumY1));
  const f = Number(parseDecimalInput(feePctY1)) / 100;
  return m + c + (a * f) / 12;
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
