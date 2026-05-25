"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney2 } from "@/utils/format";
import {
  batchCreateCapexDrivers,
  createCapexDriver,
  deleteCapexDriver,
  updateCapexDriver,
} from "../_actions";
import { AddCapexModal } from "./AddCapexModal";
import type { FYGroup } from "./PnlClientTable";
import { SeedCapexModal } from "./SeedCapexModal";

export interface CapexDriverRow {
  _id: string;
  name: string;
  accountCode: string;
  inServicePeriodKey: string;
  cost: string;
  usefulLifeMonths: number;
}

// Useful life presets keyed by account code.
const USEFUL_LIFE_PRESET: Record<string, number> = {
  "6700": 36,
  "6710": 60,
  "6720": 60,
  "6730": 84,
  "6740": 120,
  "6750": 60,
  "6760": 60,
  "6770": 36,
};

// Short category labels for grouping headers.
const CATEGORY_LABEL: Record<string, string> = {
  "6700": "IT equipment & computers",
  "6710": "Internally developed software",
  "6720": "Servers & infrastructure",
  "6730": "Furniture & fixtures",
  "6740": "Leasehold improvements",
  "6750": "Motor vehicles",
  "6760": "Lab & testing equipment",
  "6770": "Right-of-use assets (AASB 16)",
};

type View = "register" | "schedule" | "rollforward" | "chart";

interface EditState {
  name: string;
  accountCode: string;
  inServicePeriodKey: string;
  cost: string;
  usefulLifeMonths: string;
}

interface DriverSchedule {
  driver: CapexDriverRow;
  depByFy: Record<string, number>;
  additionsByFy: Record<string, number>;
  depByMonth: Record<string, number>;
}

function computeSchedules(drivers: CapexDriverRow[], fyGroups: FYGroup[]): DriverSchedule[] {
  return drivers.map((d) => {
    const cost = Number(d.cost);
    const life = d.usefulLifeMonths;
    const monthlyDep = life > 0 ? cost / life : 0;

    // Build a flat month→dep map for the full horizon.
    const allMonths = fyGroups.flatMap((g) => g.months);
    const startIdx = allMonths.indexOf(d.inServicePeriodKey);

    const depByMonth: Record<string, number> = {};
    for (let i = 0; i < allMonths.length; i++) {
      const pk = allMonths[i];
      const offset = i - startIdx;
      depByMonth[pk] = startIdx >= 0 && offset >= 0 && offset < life ? monthlyDep : 0;
    }

    const depByFy: Record<string, number> = {};
    const additionsByFy: Record<string, number> = {};
    for (const g of fyGroups) {
      const fy = `FY${g.fy}`;
      depByFy[fy] = g.months.reduce((s, pk) => s + (depByMonth[pk] ?? 0), 0);
      additionsByFy[fy] = g.months.includes(d.inServicePeriodKey) ? cost : 0;
    }

    return { driver: d, depByFy, additionsByFy, depByMonth };
  });
}

export function CapexTab({
  scenarioId,
  drivers,
  expenseAccounts,
  defaultStartPeriod,
  fyGroups,
}: {
  scenarioId: string;
  drivers: CapexDriverRow[];
  expenseAccounts: { code: string; name: string }[];
  defaultStartPeriod: string;
  fyGroups: FYGroup[];
}) {
  const [view, setView] = useState<View>("register");
  const [editing, setEditing] = useState<Record<string, EditState>>({});
  const [editPending, startEdit] = useTransition();
  const [deletePending, startDelete] = useTransition();

  const schedules = useMemo(() => computeSchedules(drivers, fyGroups), [drivers, fyGroups]);

  const fys = fyGroups.map((g) => `FY${g.fy}`);

  const totalCost = drivers.reduce((s, d) => s + Number(d.cost), 0);
  const totalMonthlyDep = drivers.reduce((s, d) => {
    const c = Number(d.cost);
    return s + (d.usefulLifeMonths > 0 ? c / d.usefulLifeMonths : 0);
  }, 0);

  // FY-level roll-forward totals (all assets combined).
  const fyTotals = useMemo(() => {
    return fys.map((fy) => ({
      fy,
      additions: schedules.reduce((s, sc) => s + (sc.additionsByFy[fy] ?? 0), 0),
      depreciation: schedules.reduce((s, sc) => s + (sc.depByFy[fy] ?? 0), 0),
    }));
  }, [schedules, fys]);

  // Running NBV for roll-forward.
  const fyRollForward = useMemo(
    () =>
      fyTotals.reduce<{ fy: string; openingNbv: number; additions: number; depreciation: number; closingNbv: number; runningNbv: number }[]>(
        (acc, { fy, additions, depreciation }) => {
          const openingNbv = acc.length > 0 ? acc[acc.length - 1].runningNbv : 0;
          const closing = openingNbv + additions - depreciation;
          return [...acc, { fy, openingNbv, additions, depreciation, closingNbv: closing, runningNbv: closing }];
        },
        [],
      ).map(({ runningNbv: _r, ...row }) => row),
    [fyTotals],
  );

  function startEditRow(d: CapexDriverRow) {
    setEditing((prev) => ({
      ...prev,
      [d._id]: {
        name: d.name,
        accountCode: d.accountCode,
        inServicePeriodKey: d.inServicePeriodKey,
        cost: Number(d.cost).toString(),
        usefulLifeMonths: String(d.usefulLifeMonths),
      },
    }));
  }

  function cancelEdit(id: string) {
    setEditing((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  }

  function patchEdit(id: string, patch: Partial<EditState>) {
    setEditing((prev) => {
      const cur = prev[id];
      const next = { ...cur, ...patch };
      // Auto-update useful life when account changes.
      if (patch.accountCode && USEFUL_LIFE_PRESET[patch.accountCode] && !patch.usefulLifeMonths) {
        next.usefulLifeMonths = String(USEFUL_LIFE_PRESET[patch.accountCode]);
      }
      return { ...prev, [id]: next };
    });
  }

  function saveEdit(id: string) {
    const e = editing[id];
    if (!e) return;
    startEdit(async () => {
      await updateCapexDriver(scenarioId, id, {
        name: e.name,
        accountCode: e.accountCode,
        inServicePeriodKey: e.inServicePeriodKey,
        cost: e.cost,
        usefulLifeMonths: Number(e.usefulLifeMonths),
      });
      setEditing((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    });
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Capital Expenditure</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Straight-line depreciation. Cash outflow hits the in-service month; depreciation flows
            through P&amp;L and balance sheet.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Total invested
            </div>
            <div className="text-base font-semibold tabular-nums text-zinc-900">
              {fmtMoney2(totalCost.toFixed(2))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Monthly dep.
            </div>
            <div className="text-base font-semibold tabular-nums text-zinc-900">
              {fmtMoney2(totalMonthlyDep.toFixed(2))}
            </div>
          </div>
          {/* View switcher */}
          <div className="flex rounded-md border border-zinc-300 bg-white text-[11px]">
            {(
              [
                { key: "register", label: "Register" },
                { key: "schedule", label: "Schedule" },
                { key: "rollforward", label: "Roll-forward" },
                { key: "chart", label: "Chart" },
              ] as { key: View; label: string }[]
            ).map((v, i, arr) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={[
                  "px-3 py-1.5 font-medium transition",
                  i === 0 ? "rounded-l-md" : "",
                  i === arr.length - 1 ? "rounded-r-md" : "border-r border-zinc-300",
                  view === v.key
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                ].join(" ")}
              >
                {v.label}
              </button>
            ))}
          </div>
          <SeedCapexModal
            defaultStartPeriod={defaultStartPeriod}
            saveAction={(payloads) => batchCreateCapexDrivers(scenarioId, payloads)}
          />
          <AddCapexModal
            defaultStartPeriod={defaultStartPeriod}
            expenseAccounts={expenseAccounts}
            saveAction={(payload) => createCapexDriver(scenarioId, payload)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view === "register" && (
          <RegisterView
            drivers={drivers}
            schedules={schedules}
            expenseAccounts={expenseAccounts}
            editing={editing}
            editPending={editPending}
            deletePending={deletePending}
            onStartEdit={startEditRow}
            onCancelEdit={cancelEdit}
            onPatchEdit={patchEdit}
            onSaveEdit={saveEdit}
            onDelete={(id) =>
              startDelete(async () => {
                await deleteCapexDriver(scenarioId, id);
              })
            }
          />
        )}
        {view === "schedule" && <ScheduleView schedules={schedules} fys={fys} />}
        {view === "rollforward" && <RollForwardView rows={fyRollForward} />}
        {view === "chart" && <ChartView fyTotals={fyTotals} fyRollForward={fyRollForward} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Register view
// ─────────────────────────────────────────────────────────────────────────────

function RegisterView({
  drivers,
  schedules,
  expenseAccounts,
  editing,
  editPending,
  deletePending,
  onStartEdit,
  onCancelEdit,
  onPatchEdit,
  onSaveEdit,
  onDelete,
}: {
  drivers: CapexDriverRow[];
  schedules: DriverSchedule[];
  expenseAccounts: { code: string; name: string }[];
  editing: Record<string, EditState>;
  editPending: boolean;
  deletePending: boolean;
  onStartEdit: (d: CapexDriverRow) => void;
  onCancelEdit: (id: string) => void;
  onPatchEdit: (id: string, patch: Partial<EditState>) => void;
  onSaveEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  // Group by account code.
  const groups = useMemo(() => {
    const map = new Map<string, CapexDriverRow[]>();
    for (const d of drivers) {
      const bucket = map.get(d.accountCode) ?? [];
      bucket.push(d);
      map.set(d.accountCode, bucket);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [drivers]);

  const accountNameByCode = new Map(expenseAccounts.map((a) => [a.code, a.name]));

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <th className="px-3 py-2 text-left">Asset name</th>
          <th className="px-3 py-2 text-left">Account</th>
          <th className="px-3 py-2 text-left">In-service</th>
          <th className="px-3 py-2 text-right">Cost</th>
          <th className="px-3 py-2 text-right">Life (mo)</th>
          <th className="px-3 py-2 text-right">Dep / mo</th>
          <th className="w-28" />
        </tr>
      </thead>
      <tbody>
        {drivers.length === 0 && (
          <tr>
            <td colSpan={7} className="px-3 py-10 text-center italic text-zinc-400">
              No capex assets yet — click &quot;Add asset&quot; to get started.
            </td>
          </tr>
        )}

        {groups.map(([code, groupDrivers]) => {
          const catLabel = CATEGORY_LABEL[code] ?? accountNameByCode.get(code) ?? code;
          const catTotal = groupDrivers.reduce((s, d) => s + Number(d.cost), 0);
          return (
            <RegisterGroup
              key={code}
              code={code}
              catLabel={catLabel}
              catTotal={catTotal}
              groupDrivers={groupDrivers}
              expenseAccounts={expenseAccounts}
              editing={editing}
              editPending={editPending}
              deletePending={deletePending}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onPatchEdit={onPatchEdit}
              onSaveEdit={onSaveEdit}
              onDelete={onDelete}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function RegisterGroup({
  code,
  catLabel,
  catTotal,
  groupDrivers,
  expenseAccounts,
  editing,
  editPending,
  deletePending,
  onStartEdit,
  onCancelEdit,
  onPatchEdit,
  onSaveEdit,
  onDelete,
}: {
  code: string;
  catLabel: string;
  catTotal: number;
  groupDrivers: CapexDriverRow[];
  expenseAccounts: { code: string; name: string }[];
  editing: Record<string, EditState>;
  editPending: boolean;
  deletePending: boolean;
  onStartEdit: (d: CapexDriverRow) => void;
  onCancelEdit: (id: string) => void;
  onPatchEdit: (id: string, patch: Partial<EditState>) => void;
  onSaveEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <tr className="border-t border-zinc-200 bg-zinc-100">
        <td colSpan={5} className="px-3 py-1.5">
          <span className="font-mono text-[11px] text-zinc-500">{code}</span>
          <span className="ml-2 text-[11px] font-semibold text-zinc-700">{catLabel}</span>
        </td>
        <td className="px-3 py-1.5 text-right text-[11px] font-semibold tabular-nums text-zinc-700">
          {fmtMoney2(catTotal.toFixed(2))}
        </td>
        <td />
      </tr>
      {groupDrivers.map((d) => {
        const e = editing[d._id];
        if (e) {
          return (
            <tr key={d._id} className="border-b border-zinc-100 bg-amber-50">
              <td className="px-2 py-1.5 pl-6">
                <input
                  value={e.name}
                  onChange={(ev) => onPatchEdit(d._id, { name: ev.target.value })}
                  className="w-full rounded border border-zinc-300 px-1.5 py-1 text-xs"
                />
              </td>
              <td className="px-2 py-1.5">
                <select
                  value={e.accountCode}
                  onChange={(ev) => onPatchEdit(d._id, { accountCode: ev.target.value })}
                  className="rounded border border-zinc-300 px-1.5 py-1 text-xs"
                >
                  {expenseAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} {a.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-1.5">
                <input
                  value={e.inServicePeriodKey}
                  onChange={(ev) => onPatchEdit(d._id, { inServicePeriodKey: ev.target.value })}
                  placeholder="YYYY-MM"
                  className="w-28 rounded border border-zinc-300 px-1.5 py-1 font-mono text-xs"
                />
              </td>
              <td className="px-2 py-1.5 text-right">
                <input
                  type="number"
                  value={e.cost}
                  onChange={(ev) => onPatchEdit(d._id, { cost: ev.target.value })}
                  className="w-32 rounded border border-zinc-300 px-1.5 py-1 text-right tabular-nums text-xs"
                />
              </td>
              <td className="px-2 py-1.5 text-right">
                <input
                  type="number"
                  min={1}
                  value={e.usefulLifeMonths}
                  onChange={(ev) => onPatchEdit(d._id, { usefulLifeMonths: ev.target.value })}
                  className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-right tabular-nums text-xs"
                />
              </td>
              <td className="px-2 py-1.5 text-right text-zinc-400">
                {e.cost && e.usefulLifeMonths && Number(e.usefulLifeMonths) > 0
                  ? fmtMoney2((Number(e.cost) / Number(e.usefulLifeMonths)).toFixed(2))
                  : "—"}
              </td>
              <td className="px-2 py-1.5">
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    disabled={editPending}
                    onClick={() => onSaveEdit(d._id)}
                    className="rounded bg-zinc-900 px-2 py-0.5 text-[11px] text-white hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => onCancelEdit(d._id)}
                    className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100"
                  >
                    Cancel
                  </button>
                </div>
              </td>
            </tr>
          );
        }
        const cost = Number(d.cost);
        const depPerMonth = d.usefulLifeMonths > 0 ? cost / d.usefulLifeMonths : 0;
        return (
          <tr key={d._id} className="border-b border-zinc-100 hover:bg-zinc-50">
            <td className="py-2 pl-6 pr-3 text-zinc-900">{d.name}</td>
            <td className="px-3 py-2 text-zinc-500">
              <span className="font-mono text-[11px]">{d.accountCode}</span>
            </td>
            <td className="px-3 py-2 font-mono text-zinc-700">{d.inServicePeriodKey}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney2(cost.toFixed(2))}</td>
            <td className="px-3 py-2 text-right tabular-nums">{d.usefulLifeMonths}</td>
            <td className="px-3 py-2 text-right tabular-nums">
              {fmtMoney2(depPerMonth.toFixed(2))}
            </td>
            <td className="px-3 py-2">
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => onStartEdit(d)}
                  className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={deletePending}
                  onClick={() => onDelete(d._id)}
                  className="rounded border border-rose-200 px-2 py-0.5 text-[11px] text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule view — per-asset depreciation by FY
// ─────────────────────────────────────────────────────────────────────────────

function ScheduleView({ schedules, fys }: { schedules: DriverSchedule[]; fys: string[] }) {
  if (schedules.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm italic text-zinc-400">
        No assets to schedule.
      </div>
    );
  }

  // FY totals row.
  const fyDepTotals = fys.map((fy) => schedules.reduce((s, sc) => s + (sc.depByFy[fy] ?? 0), 0));

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <th className="px-3 py-2 text-left">Asset</th>
          <th className="px-3 py-2 text-left">Account</th>
          <th className="px-3 py-2 text-right">Total cost</th>
          {fys.map((fy) => (
            <th key={fy} className="px-3 py-2 text-right">
              {fy}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {schedules.map(({ driver: d, depByFy }) => {
          const cost = Number(d.cost);
          return (
            <tr key={d._id} className="border-b border-zinc-100 hover:bg-zinc-50">
              <td className="px-3 py-2 text-zinc-900">{d.name}</td>
              <td className="px-3 py-2 font-mono text-[11px] text-zinc-500">{d.accountCode}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney2(cost.toFixed(2))}</td>
              {fys.map((fy) => {
                const v = depByFy[fy] ?? 0;
                return (
                  <td
                    key={fy}
                    className={`px-3 py-2 text-right tabular-nums ${v === 0 ? "text-zinc-300" : "text-zinc-700"}`}
                  >
                    {v === 0 ? "—" : fmtMoney2(v.toFixed(2))}
                  </td>
                );
              })}
            </tr>
          );
        })}
        <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold">
          <td colSpan={3} className="px-3 py-2 text-zinc-700">
            Total depreciation
          </td>
          {fyDepTotals.map((v, i) => (
            <td key={fys[i]} className="px-3 py-2 text-right tabular-nums text-zinc-900">
              {fmtMoney2(v.toFixed(2))}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Roll-forward view — opening NBV + additions − dep = closing NBV per FY
// ─────────────────────────────────────────────────────────────────────────────

function RollForwardView({
  rows,
}: {
  rows: {
    fy: string;
    openingNbv: number;
    additions: number;
    depreciation: number;
    closingNbv: number;
  }[];
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <th className="px-3 py-2 text-left">Line</th>
          {rows.map((r) => (
            <th key={r.fy} className="px-3 py-2 text-right">
              {r.fy}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <RfRow label="Opening NBV" values={rows.map((r) => r.openingNbv)} />
        <RfRow label="+ Additions (capex)" values={rows.map((r) => r.additions)} tone="add" />
        <RfRow label="− Depreciation" values={rows.map((r) => -r.depreciation)} tone="sub" />
        <RfRow label="Closing NBV" values={rows.map((r) => r.closingNbv)} bold border />
      </tbody>
    </table>
  );
}

function RfRow({
  label,
  values,
  bold,
  border,
  tone,
}: {
  label: string;
  values: number[];
  bold?: boolean;
  border?: boolean;
  tone?: "add" | "sub";
}) {
  const rowCls = border ? "border-t-2 border-zinc-300" : "border-t border-zinc-100";
  const cellCls = [
    "px-3 py-2",
    bold ? "font-semibold text-zinc-900" : "text-zinc-700",
    tone === "add" ? "text-emerald-700" : tone === "sub" ? "text-rose-700" : "",
  ].join(" ");
  return (
    <tr className={rowCls}>
      <td className={cellCls}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`${cellCls} text-right tabular-nums`}>
          {v === 0 ? "—" : fmtMoney2(Math.abs(v).toFixed(2))}
        </td>
      ))}
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart view
// ─────────────────────────────────────────────────────────────────────────────

function ChartView({
  fyTotals,
  fyRollForward,
}: {
  fyTotals: { fy: string; additions: number; depreciation: number }[];
  fyRollForward: { fy: string; closingNbv: number }[];
}) {
  const nbvByFy = new Map(fyRollForward.map((r) => [r.fy, r.closingNbv]));
  const chartData = fyTotals.map((r) => ({
    fy: r.fy,
    "Capex outflow": Math.round(r.additions),
    Depreciation: Math.round(r.depreciation),
    "Closing NBV": Math.round(nbvByFy.get(r.fy) ?? 0),
  }));

  const fmt = (v: number) =>
    v >= 1_000_000
      ? `$${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
        ? `$${(v / 1_000).toFixed(0)}k`
        : `$${v}`;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div>
        <h3 className="mb-3 text-xs font-semibold text-zinc-700">
          Capex outflow & depreciation by FY
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 24, bottom: 4, left: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis dataKey="fy" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmtMoney2(Number(v ?? 0).toFixed(2))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Capex outflow" fill="#3f3f46" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Depreciation" fill="#a1a1aa" radius={[3, 3, 0, 0]} />
            <Line
              type="monotone"
              dataKey="Closing NBV"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
