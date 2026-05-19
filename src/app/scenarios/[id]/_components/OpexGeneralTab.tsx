import type { PnL } from "@/engine/pnl";
import { cleanDecimal, fmtMoney2, fmtNum0 } from "@/utils/format";
import { createOpexDriver, deleteOpexDriver, updateOpexDriver } from "../_actions";
import type { OpexDriverFormInitial, OpexDriverType } from "./AddOpexDriverModal";
import { AddOpexDriverModal } from "./AddOpexDriverModal";
import type { OpexItemEditTarget } from "./PnlClientTable";
import { type FYGroup, PnlTable } from "./PnlTable";

export interface OpexDriverRow {
  _id: string;
  type: OpexDriverType;
  name: string;
  accountCode: string;
  startPeriodKey: string;
  endPeriodKey?: string;
  baseMonthly?: { toString: () => string };
  monthlyGrowthPct?: { toString: () => string };
  pctOfRevenue?: { toString: () => string };
  costPerFteMonthly?: { toString: () => string };
}

function num(x: { toString: () => string } | undefined): number {
  if (!x) return 0;
  const n = Number(x.toString());
  return Number.isFinite(n) ? n : 0;
}

function toFormInitial(d: OpexDriverRow): OpexDriverFormInitial {
  return {
    type: d.type,
    name: d.name,
    accountCode: d.accountCode,
    startPeriodKey: d.startPeriodKey,
    endPeriodKey: d.endPeriodKey,
    baseMonthly: d.baseMonthly ? cleanDecimal(d.baseMonthly.toString()) : "0",
    monthlyGrowthPct: d.monthlyGrowthPct ? cleanDecimal(d.monthlyGrowthPct.toString()) : "0",
    pctOfRevenue: d.pctOfRevenue ? cleanDecimal(d.pctOfRevenue.toString()) : "0",
    costPerFteMonthly: d.costPerFteMonthly ? cleanDecimal(d.costPerFteMonthly.toString()) : "0",
  };
}

function monthlyAtT0(d: OpexDriverRow): number {
  if (d.type === "opex_fixed") return num(d.baseMonthly);
  // % of revenue and per-FTE are inputs-dependent — we don't approximate here.
  return 0;
}

export function OpexGeneralTab({
  scenarioId,
  drivers,
  expenseAccounts,
  defaultStartPeriod,
  pnl,
  groups,
  accountByCode,
}: {
  scenarioId: string;
  drivers: OpexDriverRow[];
  expenseAccounts: { code: string; name: string }[];
  defaultStartPeriod: string;
  pnl: PnL | null;
  groups: FYGroup[];
  accountByCode: Map<string, string>;
}) {
  const accountNameByCode = new Map(expenseAccounts.map((a) => [a.code, a.name]));

  // Build the edit-target map keyed by driver _id. The PnL table's item.id for
  // driver-source items matches the Mongo _id, so PnlClientTable can look up
  // and render an inline Edit + Delete affordance per driver.
  const opexItemEditTargets: Record<string, OpexItemEditTarget> = {};
  for (const d of drivers) {
    opexItemEditTargets[d._id] = {
      formInitial: toFormInitial(d),
      updateAction: updateOpexDriver.bind(null, scenarioId, d._id),
      deleteAction: deleteOpexDriver.bind(null, scenarioId, d._id),
    };
  }

  // Per-cost-centre roll-up at t=0 (fixed drivers only contribute a deterministic
  // baseline; % / per-FTE drivers depend on revenue + staff so we count them
  // but show $0 in the header tiles).
  const byAccount = new Map<
    string,
    { count: number; t0Monthly: number; pctDrivers: number; perFteDrivers: number }
  >();
  for (const d of drivers) {
    const bucket = byAccount.get(d.accountCode) ?? {
      count: 0,
      t0Monthly: 0,
      pctDrivers: 0,
      perFteDrivers: 0,
    };
    bucket.count += 1;
    bucket.t0Monthly += monthlyAtT0(d);
    if (d.type === "opex_pct_revenue") bucket.pctDrivers += 1;
    if (d.type === "opex_per_fte") bucket.perFteDrivers += 1;
    byAccount.set(d.accountCode, bucket);
  }

  const costCentres = Array.from(byAccount.entries())
    .map(([code, b]) => ({
      code,
      name: accountNameByCode.get(code) ?? code,
      ...b,
    }))
    .sort((a, b) => b.t0Monthly - a.t0Monthly);

  const totalT0Monthly = costCentres.reduce((acc, c) => acc + c.t0Monthly, 0);
  const totalDriverCount = drivers.length;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header strip: cost centres + Add button */}
      <div className="flex items-stretch border-b border-zinc-200 bg-zinc-50">
        <div className="flex flex-1 items-center gap-4 overflow-x-auto px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              OPEX drivers
            </span>
            <span className="text-base font-semibold text-zinc-900">
              {fmtNum0(totalDriverCount)}
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {fmtMoney2(totalT0Monthly)} / mo at t=0
              </span>
            </span>
          </div>
          <div className="h-10 w-px bg-zinc-200" />
          {costCentres.length === 0 ? (
            <span className="text-xs text-zinc-500">No cost centres yet.</span>
          ) : (
            <div className="flex gap-4">
              {costCentres.map((c) => (
                <CostCentreTile key={c.code} centre={c} />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center px-4">
          <AddOpexDriverModal
            defaultStartPeriod={defaultStartPeriod}
            expenseAccounts={expenseAccounts}
            saveAction={createOpexDriver.bind(null, scenarioId)}
          />
        </div>
      </div>

      {/* OPEX P&L view — original FY-grouped table */}
      <div className="flex-1 overflow-auto">
        {!pnl ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Seed periods first.
          </div>
        ) : pnl.opex.lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-500">
            <div>No OPEX drivers yet.</div>
            <div className="text-xs">
              Click <span className="font-medium text-zinc-700">Add OPEX driver</span> to add rent,
              software, services, or a per-FTE cost.
            </div>
            <div className="text-[11px] text-zinc-400">
              Salaries &amp; wages live in the OPEX — Staffing tab.
            </div>
          </div>
        ) : (
          <PnlTable
            pnl={pnl}
            groups={groups}
            accountByCode={accountByCode}
            showSection="opex"
            opexItemEditTargets={opexItemEditTargets}
            expenseAccounts={expenseAccounts}
            defaultStartPeriod={defaultStartPeriod}
          />
        )}
      </div>
    </div>
  );
}

function CostCentreTile({
  centre,
}: {
  centre: {
    code: string;
    name: string;
    count: number;
    t0Monthly: number;
    pctDrivers: number;
    perFteDrivers: number;
  };
}) {
  const subBits: string[] = [];
  if (centre.pctDrivers > 0) subBits.push(`${centre.pctDrivers} × % rev`);
  if (centre.perFteDrivers > 0) subBits.push(`${centre.perFteDrivers} × /FTE`);
  return (
    <div className="flex min-w-[170px] flex-col gap-0.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5">
      <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <span className="font-mono">{centre.code}</span> {centre.name}
      </span>
      <span className="text-sm font-semibold tabular-nums text-zinc-900">
        {fmtMoney2(centre.t0Monthly)}
        <span className="ml-1 text-[10px] font-normal text-zinc-500">/ mo</span>
      </span>
      <span className="text-[10px] text-zinc-500">
        {fmtNum0(centre.count)} driver{centre.count === 1 ? "" : "s"}
        {subBits.length > 0 ? ` · ${subBits.join(" · ")}` : ""}
      </span>
    </div>
  );
}
