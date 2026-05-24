"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { fmtMoney2 } from "@/utils/format";
import { saveUseOfFundsPlan } from "../_actions";

export interface UofSavedPlan {
  coverMonths: number;
  contingencyPct: number;
  includeRevenue: boolean;
  manualLines: Array<{ label: string; amount: number }>;
}

export interface UofFundsRaise {
  _id: string;
  name: string;
  type: "equity" | "convertible_note";
  raiseDate: string; // ISO
  raisePeriodKey: string; // YYYY-MM
  targetSize: number;
  fundedAmount: number;
  committedAmount: number;
  plan?: UofSavedPlan | null;
}

export interface UofMonthlyByAccount {
  accountCode: string;
  accountName: string;
  monthly: Record<string, number>; // periodKey → value
}

export interface UseOfFundsData {
  raises: UofFundsRaise[];
  horizon: string[]; // YYYY-MM in order
  // P&L OPEX broken out by account. Staff lives in 6000/6100; everything
  // else (rent, software, AI, etc.) is general OPEX.
  opexLinesByAccount: UofMonthlyByAccount[];
  // P&L revenue broken out by account. Whether it offsets uses is
  // controlled by the includeRevenue toggle.
  revenueLinesByAccount: UofMonthlyByAccount[];
  // Cash use of program upfront fees per month (underwriter/legal/ratings).
  // Drawn from CF.issuanceCostOutflow rather than the amortised P&L line.
  issuanceCostByMonth: Record<string, number>;
}

interface ManualLine {
  id: string;
  label: string;
  amount: number;
}

const STAFF_ACCOUNT_CODES = new Set(["6000", "6100"]);
const DEFAULT_HORIZON_MONTHS = 12;
const DEFAULT_CONTINGENCY_PCT = 10;

export function UseOfFundsTab({ scenarioId, data }: { scenarioId: string; data: UseOfFundsData }) {
  const [selectedRaiseId, setSelectedRaiseId] = useState<string>(data.raises[0]?._id ?? "");
  const raise = data.raises.find((r) => r._id === selectedRaiseId) ?? null;

  // Hydrate dial state from the saved plan on the selected raise, falling
  // back to sensible defaults. Re-runs when the user picks a different raise.
  const [months, setMonths] = useState<number>(raise?.plan?.coverMonths ?? DEFAULT_HORIZON_MONTHS);
  const [contingencyPct, setContingencyPct] = useState<number>(
    raise?.plan?.contingencyPct ?? DEFAULT_CONTINGENCY_PCT,
  );
  const [includeRevenue, setIncludeRevenue] = useState<boolean>(
    raise?.plan?.includeRevenue ?? false,
  );
  const [manualLines, setManualLines] = useState<ManualLine[]>(
    (raise?.plan?.manualLines ?? []).map((l, i) => ({
      id: `saved_${i}`,
      label: l.label,
      amount: l.amount,
    })),
  );
  const newLineCounter = useRef(0);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [savePending, startSave] = useTransition();
  const [savedToast, setSavedToast] = useState<string | null>(null);

  // When the user switches raise, rehydrate from that raise's plan.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-sync on raise change
  useEffect(() => {
    const plan = raise?.plan;
    setMonths(plan?.coverMonths ?? DEFAULT_HORIZON_MONTHS);
    setContingencyPct(plan?.contingencyPct ?? DEFAULT_CONTINGENCY_PCT);
    setIncludeRevenue(plan?.includeRevenue ?? false);
    setManualLines(
      (plan?.manualLines ?? []).map((l, i) => ({
        id: `saved_${i}`,
        label: l.label,
        amount: l.amount,
      })),
    );
  }, [selectedRaiseId]);

  const windowKeys = useMemo<string[]>(() => {
    if (!raise) return [];
    const start = data.horizon.indexOf(raise.raisePeriodKey);
    if (start < 0) return [];
    const safe = Math.max(1, Math.min(60, Math.floor(months)));
    return data.horizon.slice(start, start + safe);
  }, [data.horizon, raise, months]);

  const sumLine = (line: UofMonthlyByAccount): number => {
    let s = 0;
    for (const pk of windowKeys) s += line.monthly[pk] ?? 0;
    return s;
  };

  const staffLines = useMemo(
    () =>
      data.opexLinesByAccount
        .filter((l) => STAFF_ACCOUNT_CODES.has(l.accountCode))
        .map((l) => ({ ...l, total: sumLine(l) }))
        .filter((l) => l.total !== 0),
    // biome-ignore lint/correctness/useExhaustiveDependencies: sumLine reads windowKeys
    [data.opexLinesByAccount, windowKeys],
  );
  const opexLines = useMemo(
    () =>
      data.opexLinesByAccount
        .filter((l) => !STAFF_ACCOUNT_CODES.has(l.accountCode))
        .map((l) => ({ ...l, total: sumLine(l) }))
        .filter((l) => l.total !== 0),
    // biome-ignore lint/correctness/useExhaustiveDependencies: sumLine reads windowKeys
    [data.opexLinesByAccount, windowKeys],
  );
  const revenueLines = useMemo(
    () =>
      data.revenueLinesByAccount
        .map((l) => ({ ...l, total: sumLine(l) }))
        .filter((l) => l.total !== 0),
    // biome-ignore lint/correctness/useExhaustiveDependencies: sumLine reads windowKeys
    [data.revenueLinesByAccount, windowKeys],
  );

  const issuanceTotal = useMemo(() => {
    let s = 0;
    for (const pk of windowKeys) s += data.issuanceCostByMonth[pk] ?? 0;
    return s;
  }, [data.issuanceCostByMonth, windowKeys]);

  const staffTotal = staffLines.reduce((s, l) => s + l.total, 0);
  const opexTotal = opexLines.reduce((s, l) => s + l.total, 0);
  const revenueTotal = revenueLines.reduce((s, l) => s + l.total, 0);
  const manualTotal = manualLines.reduce(
    (s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0),
    0,
  );
  const grossUses = staffTotal + opexTotal + issuanceTotal + manualTotal;
  const revenueOffset = includeRevenue ? revenueTotal : 0;
  const subtotal = grossUses - revenueOffset;
  const contingencyAmount = subtotal * (Math.max(0, contingencyPct) / 100);
  const grandTotal = subtotal + contingencyAmount;

  const fundsAvailable = raise?.fundedAmount ?? 0;
  const surplus = fundsAvailable - grandTotal;

  function onSave() {
    if (!raise) return;
    startSave(async () => {
      await saveUseOfFundsPlan(scenarioId, raise._id, {
        coverMonths: months,
        contingencyPct,
        includeRevenue,
        manualLines: manualLines.map((l) => ({ label: l.label, amount: l.amount })),
      });
      setSavedToast(`Plan saved to ${raise.name}.`);
      setTimeout(() => setSavedToast(null), 3500);
    });
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-zinc-900">Use of Funds</h2>
          {raise?.plan ? (
            <span
              className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800"
              title="A saved plan exists for this raise"
            >
              Saved plan
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          Pick a capital raise and a runway window — the tab rolls up staff cost, OPEX drivers,
          capital-program upfront fees, and (optionally) revenue, then compares to the funded
          amount. Click <strong>Save plan</strong> to persist the dials + manual lines on the raise.
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 gap-3 border-b border-zinc-200 bg-white px-4 py-3 text-xs md:grid-cols-5">
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Capital raise
          </span>
          <select
            value={selectedRaiseId}
            onChange={(e) => setSelectedRaiseId(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          >
            {data.raises.length === 0 ? (
              <option value="">No raises yet — add one on Capital Raises</option>
            ) : (
              data.raises.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name} · {r.raisePeriodKey} · {fmtMoney2(r.fundedAmount.toFixed(2))} funded
                  {r.plan ? " · saved" : ""}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Cover (months)
          </span>
          <input
            type="number"
            min={1}
            max={60}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-right tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Contingency %
          </span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={contingencyPct}
            onChange={(e) => setContingencyPct(Number(e.target.value))}
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-right tabular-nums"
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Window
          </span>
          <span className="font-mono text-xs text-zinc-700">
            {windowKeys.length > 0
              ? `${windowKeys[0]} → ${windowKeys[windowKeys.length - 1]} (${windowKeys.length} mo)`
              : "—"}
          </span>
        </div>
      </div>

      {/* Revenue toggle + Save bar */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2 text-xs">
        <label className="inline-flex items-center gap-2 text-zinc-700">
          <input
            type="checkbox"
            checked={includeRevenue}
            onChange={(e) => setIncludeRevenue(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          <span>
            <span className="font-medium">Include revenue</span> — offset uses by revenue earned
            inside the window
          </span>
        </label>
        <div className="flex items-center gap-3">
          {savedToast ? (
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
              {savedToast}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={savePending || !raise}
            className="rounded-md bg-zinc-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {savePending ? "Saving…" : "Save plan"}
          </button>
        </div>
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 md:grid-cols-5">
        <Tile label="Funds available" value={fmtMoney2(fundsAvailable.toFixed(2))} tone="ok" />
        <Tile label="Gross uses" value={fmtMoney2(grossUses.toFixed(2))} />
        <Tile
          label={includeRevenue ? "Revenue offset" : "Revenue (excluded)"}
          value={fmtMoney2(revenueTotal.toFixed(2))}
          tone={includeRevenue ? "ok" : undefined}
          sub={includeRevenue ? "−offset against uses" : "toggle to include"}
        />
        <Tile
          label={`Contingency (${contingencyPct}%)`}
          value={fmtMoney2(contingencyAmount.toFixed(2))}
        />
        <Tile
          label="Grand total"
          value={fmtMoney2(grandTotal.toFixed(2))}
          tone={surplus >= 0 ? "ok" : "warn"}
          sub={
            surplus >= 0
              ? `Surplus ${fmtMoney2(surplus.toFixed(2))}`
              : `Shortfall ${fmtMoney2(Math.abs(surplus).toFixed(2))}`
          }
        />
      </div>

      {/* Body */}
      <div className="flex-1 space-y-6 px-4 py-4 text-xs">
        <Section title="Staff" total={staffTotal} count={staffLines.length}>
          {staffLines.length === 0 ? (
            <Empty msg="No staff costs in window." />
          ) : (
            <LineTable lines={staffLines} />
          )}
        </Section>

        <Section title="OPEX drivers" total={opexTotal} count={opexLines.length}>
          {opexLines.length === 0 ? (
            <Empty msg="No OPEX drivers in window." />
          ) : (
            <LineTable lines={opexLines} />
          )}
        </Section>

        <Section
          title="Capital program upfront fees"
          total={issuanceTotal}
          count={issuanceTotal > 0 ? 1 : 0}
        >
          {issuanceTotal > 0 ? (
            <table className="w-full border-collapse">
              <tbody>
                <tr className="border-b border-zinc-100">
                  <td className="px-2 py-1.5 text-zinc-700">
                    Issuance costs (underwriter / legal / ratings)
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmtMoney2(issuanceTotal.toFixed(2))}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Empty msg="No new program issuance in window." />
          )}
        </Section>

        <Section title="Manual line items" total={manualTotal} count={manualLines.length}>
          <table className="w-full border-collapse">
            <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Label</th>
                <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {manualLines.map((l) => (
                <tr key={l.id} className="border-b border-zinc-100">
                  <td className="px-2 py-1.5">
                    <input
                      value={l.label}
                      onChange={(e) =>
                        setManualLines((cur) =>
                          cur.map((r) => (r.id === l.id ? { ...r, label: e.target.value } : r)),
                        )
                      }
                      className="w-full rounded-md border border-transparent px-1 py-0.5 hover:border-zinc-200 focus:border-zinc-400 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      value={l.amount}
                      onChange={(e) =>
                        setManualLines((cur) =>
                          cur.map((r) =>
                            r.id === l.id ? { ...r, amount: Number(e.target.value) } : r,
                          ),
                        )
                      }
                      className="w-32 rounded-md border border-transparent px-1 py-0.5 text-right tabular-nums hover:border-zinc-200 focus:border-zinc-400 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setManualLines((cur) => cur.filter((r) => r.id !== l.id))}
                      className="rounded px-1 py-0.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-2 py-1.5">
                  <input
                    value={newLabel}
                    placeholder="e.g. Marketing campaign"
                    onChange={(e) => setNewLabel(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 px-2 py-1 text-zinc-700"
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <input
                    type="number"
                    value={newAmount}
                    placeholder="0"
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-32 rounded-md border border-zinc-200 px-2 py-1 text-right tabular-nums"
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      const amt = Number(newAmount);
                      if (!newLabel.trim() || !Number.isFinite(amt)) return;
                      setManualLines((cur) => [
                        ...cur,
                        {
                          id: `m_${++newLineCounter.current}`,
                          label: newLabel.trim(),
                          amount: amt,
                        },
                      ]);
                      setNewLabel("");
                      setNewAmount("");
                    }}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section
          title="Revenue (offset)"
          total={revenueTotal}
          count={revenueLines.length}
          tone={includeRevenue ? "ok" : "muted"}
          headerNote={
            includeRevenue
              ? "Subtracted from gross uses below"
              : "Toggle 'Include revenue' above to subtract from gross uses"
          }
        >
          {revenueLines.length === 0 ? (
            <Empty msg="No revenue in window." />
          ) : (
            <LineTable lines={revenueLines} />
          )}
        </Section>

        {/* Summary */}
        <div className="rounded-md border border-zinc-300 bg-zinc-50">
          <table className="w-full border-collapse text-sm">
            <tbody>
              <SummaryRow label="Staff" value={staffTotal} />
              <SummaryRow label="OPEX drivers" value={opexTotal} />
              <SummaryRow label="Capital program upfront fees" value={issuanceTotal} />
              <SummaryRow label="Manual" value={manualTotal} />
              <SummaryRow label="Gross uses" value={grossUses} bold />
              <SummaryRow
                label={includeRevenue ? "Less: revenue" : "Revenue (excluded)"}
                value={includeRevenue ? -revenueTotal : 0}
                muted={!includeRevenue}
                tone={includeRevenue ? "ok" : undefined}
              />
              <SummaryRow label="Net uses (after revenue)" value={subtotal} bold />
              <SummaryRow label={`Contingency (${contingencyPct}%)`} value={contingencyAmount} />
              <SummaryRow label="Grand total" value={grandTotal} bold border />
              <SummaryRow label="Funds available" value={fundsAvailable} muted />
              <SummaryRow
                label={surplus >= 0 ? "Surplus" : "Shortfall"}
                value={Math.abs(surplus)}
                tone={surplus >= 0 ? "ok" : "warn"}
                border
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn";
}) {
  const valueColor =
    tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-rose-700" : "text-zinc-900";
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`text-base font-semibold tabular-nums ${valueColor}`}>{value}</div>
      {sub ? <div className="text-[11px] text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function Section({
  title,
  total,
  count,
  children,
  tone,
  headerNote,
}: {
  title: string;
  total: number;
  count: number;
  children: React.ReactNode;
  tone?: "ok" | "muted";
  headerNote?: string;
}) {
  const titleColor =
    tone === "ok" ? "text-emerald-700" : tone === "muted" ? "text-zinc-400" : "text-zinc-700";
  return (
    <section className="rounded-md border border-zinc-200 bg-white">
      <header className="flex items-baseline justify-between border-b border-zinc-100 bg-zinc-50 px-3 py-2">
        <div>
          <h3 className={`text-xs font-semibold uppercase tracking-wider ${titleColor}`}>
            {title}
            <span className="ml-2 font-normal text-zinc-400">
              · {count} line{count === 1 ? "" : "s"}
            </span>
          </h3>
          {headerNote ? <p className="mt-0.5 text-[10px] text-zinc-500">{headerNote}</p> : null}
        </div>
        <span className="text-sm font-semibold tabular-nums text-zinc-900">
          {fmtMoney2(total.toFixed(2))}
        </span>
      </header>
      <div className="p-2">{children}</div>
    </section>
  );
}

function LineTable({ lines }: { lines: Array<UofMonthlyByAccount & { total: number }> }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {lines.map((l) => (
          <tr key={l.accountCode} className="border-b border-zinc-100">
            <td className="px-2 py-1.5 font-mono text-[11px] text-zinc-500">{l.accountCode}</td>
            <td className="px-2 py-1.5 text-zinc-700">{l.accountName}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney2(l.total.toFixed(2))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="px-2 py-3 text-[11px] italic text-zinc-400">{msg}</div>;
}

function SummaryRow({
  label,
  value,
  bold,
  border,
  muted,
  tone,
}: {
  label: string;
  value: number;
  bold?: boolean;
  border?: boolean;
  muted?: boolean;
  tone?: "ok" | "warn";
}) {
  const cls = [
    "px-3 py-1.5",
    bold ? "font-semibold" : "",
    muted ? "text-zinc-500" : "",
    tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-rose-700" : "",
  ].join(" ");
  const rowCls = border ? "border-t-2 border-zinc-300" : "border-t border-zinc-100";
  return (
    <tr className={rowCls}>
      <td className={cls}>{label}</td>
      <td className={`${cls} text-right tabular-nums`}>{fmtMoney2(value.toFixed(2))}</td>
    </tr>
  );
}
