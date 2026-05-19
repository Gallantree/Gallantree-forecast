import Decimal from "decimal.js";
import { cleanDecimal, fmtMoney2, fmtMoneyInput, fmtNum0, fmtPercent } from "@/utils/format";
import { addStaff, deleteStaff, updateStaff } from "../_actions";
import { AddStaffForm, type PlainPayband } from "./AddStaffForm";
import { EditStaffButton, type EditStaffData } from "./EditStaffButton";

export interface StaffRow {
  _id: string;
  personName?: string;
  role: string;
  accountCode: string;
  employmentType?: "full_time" | "part_time" | "contractor";
  ftePct?: { toString: () => string };
  band?: number;
  tier?: number;
  startPeriodKey: string;
  endPeriodKey?: string;
  salaryAnnual: { toString: () => string };
  superPct?: { toString: () => string };
  onCostPct: { toString: () => string };
  salaryGrowthPctAnnual: { toString: () => string };
}

export interface PaybandRow {
  band: number;
  tier: number;
  salaryAnnual?: { toString: () => string };
  caseByCase: boolean;
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contractor: "Contractor",
};

function toEditData(r: StaffRow): EditStaffData {
  return {
    _id: r._id,
    personName: r.personName,
    role: r.role,
    accountCode: r.accountCode,
    employmentType: r.employmentType,
    ftePct: cleanDecimal(r.ftePct?.toString()) || "1",
    band: r.band,
    tier: r.tier,
    startPeriodKey: r.startPeriodKey,
    endPeriodKey: r.endPeriodKey,
    salaryAnnual: fmtMoneyInput(r.salaryAnnual.toString()),
    superPct: cleanDecimal(r.superPct?.toString()) || "12",
    onCostPct: cleanDecimal(r.onCostPct.toString()),
    salaryGrowthPctAnnual: cleanDecimal(r.salaryGrowthPctAnnual.toString()),
  };
}

function effectiveAnnual(row: StaffRow): Decimal {
  const fte = new Decimal(row.ftePct?.toString() ?? "1");
  const salary = new Decimal(row.salaryAnnual.toString());
  const loading = new Decimal(1)
    .plus(new Decimal(row.superPct?.toString() ?? "0").div(100))
    .plus(new Decimal(row.onCostPct.toString()).div(100));
  return salary.times(fte).times(loading);
}

export function StaffingTab({
  scenarioId,
  staff,
  paybands,
  expenseAccounts,
  defaultStartPeriod,
  defaultCpiPct,
  defaultSuperPct,
}: {
  scenarioId: string;
  staff: StaffRow[];
  paybands: PaybandRow[];
  expenseAccounts: { code: string; name: string }[];
  defaultStartPeriod: string;
  defaultCpiPct?: string;
  defaultSuperPct?: string;
}) {
  const addAction = addStaff.bind(null, scenarioId);

  const totalFte = staff
    .reduce((acc, r) => acc.plus(new Decimal(r.ftePct?.toString() ?? "1")), new Decimal(0))
    .toDecimalPlaces(2);
  const totalAnnualCost = staff.reduce((acc, r) => acc.plus(effectiveAnnual(r)), new Decimal(0));

  const plainPaybands: PlainPayband[] = paybands.map((p) => ({
    band: p.band,
    tier: p.tier,
    salaryAnnual: p.salaryAnnual ? Number(p.salaryAnnual.toString()) : null,
    caseByCase: p.caseByCase,
  }));

  // Headline stats
  const headCount = staff.length;
  const totalFteRounded = totalFte.toString();
  const monthlyCost = totalAnnualCost.div(12);

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header strip — mirror Capital Programs */}
      <div className="flex items-end justify-between gap-6 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs">
        <div className="flex gap-6">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Head count
            </div>
            <div className="text-base font-semibold text-zinc-900">{fmtNum0(headCount)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              FTEs
            </div>
            <div className="text-base font-semibold text-zinc-900 tabular-nums">
              {totalFteRounded}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Cost / month
            </div>
            <div className="text-base font-semibold text-zinc-900 tabular-nums">
              {fmtMoney2(monthlyCost.toFixed(2))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Cost / year
            </div>
            <div className="text-base font-semibold text-emerald-700 tabular-nums">
              {fmtMoney2(totalAnnualCost.toFixed(2))}
            </div>
          </div>
        </div>
        <AddStaffForm
          expenseAccounts={expenseAccounts}
          paybands={plainPaybands}
          defaultStartPeriod={defaultStartPeriod}
          defaultCpiPct={defaultCpiPct}
          defaultSuperPct={defaultSuperPct}
          addAction={addAction}
        />
      </div>

      {/* Staff list */}
      <div className="flex-1 overflow-auto">
        {staff.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-500">
            <div>No staff yet.</div>
            <div className="text-xs">
              Click <span className="font-medium text-zinc-700">Add staff</span> in the header to
              create one.
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-zinc-100 text-zinc-600">
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Type</Th>
                <Th className="text-right">FTE</Th>
                <Th>Band / Tier</Th>
                <Th className="text-right">Salary (FTE 100%)</Th>
                <Th className="text-right">Super</Th>
                <Th className="text-right">On-cost</Th>
                <Th className="text-right">Effective $/yr (incl super + on-cost)</Th>
                <Th className="text-right">CPI %</Th>
                <Th>OPEX account</Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {staff.map((r) => {
                const fte = new Decimal(r.ftePct?.toString() ?? "1");
                const effective = effectiveAnnual(r);
                const bandTier =
                  r.band !== undefined && r.tier !== undefined ? `B${r.band} · T${r.tier}` : "—";
                return (
                  <tr key={r._id} className="border-b border-zinc-100 hover:bg-yellow-50/40">
                    <Td>{r.personName ?? <span className="text-zinc-400">—</span>}</Td>
                    <Td className="font-medium">{r.role}</Td>
                    <Td>{EMPLOYMENT_LABEL[r.employmentType ?? "full_time"]}</Td>
                    <Td className="text-right tabular-nums">{fte.toFixed(2)}</Td>
                    <Td className="font-mono text-zinc-600">{bandTier}</Td>
                    <Td className="text-right tabular-nums">
                      {fmtMoney2(r.salaryAnnual.toString())}
                    </Td>
                    <Td className="text-right tabular-nums text-zinc-600">
                      {fmtPercent(r.superPct?.toString() ?? "0")}
                    </Td>
                    <Td className="text-right tabular-nums text-zinc-600">
                      {fmtPercent(r.onCostPct.toString())}
                    </Td>
                    <Td className="text-right font-semibold tabular-nums">
                      {fmtMoney2(effective.toFixed(2))}
                    </Td>
                    <Td className="text-right tabular-nums text-zinc-600">
                      {fmtPercent(r.salaryGrowthPctAnnual.toString())}
                    </Td>
                    <Td className="font-mono text-zinc-600">{r.accountCode}</Td>
                    <Td className="font-mono text-zinc-600">{r.startPeriodKey}</Td>
                    <Td className="font-mono text-zinc-600">{r.endPeriodKey ?? "—"}</Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <EditStaffButton
                          row={toEditData(r)}
                          expenseAccounts={expenseAccounts}
                          paybands={plainPaybands}
                          updateAction={updateStaff.bind(null, scenarioId, r._id)}
                        />
                        <form action={deleteStaff.bind(null, scenarioId, r._id)}>
                          <button
                            type="submit"
                            className="rounded px-2 py-0.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Delete"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 border-t-2 border-zinc-400 bg-zinc-100 font-semibold">
              <tr>
                <Td colSpan={3}>
                  Totals ({staff.length} role{staff.length === 1 ? "" : "s"})
                </Td>
                <Td className="text-right tabular-nums">{fmtNum0(totalFte.toString())}</Td>
                <Td colSpan={4}></Td>
                <Td className="text-right tabular-nums">{fmtMoney2(totalAnnualCost.toFixed(2))}</Td>
                <Td colSpan={5}></Td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Payband reference */}
      {paybands.length > 0 && (
        <details className="border-t border-zinc-200 bg-zinc-50 text-xs">
          <summary className="cursor-pointer px-4 py-2 font-medium text-zinc-700 hover:bg-zinc-100">
            Payband reference (Gallantree grid) — {paybands.length} entries
          </summary>
          <div className="max-h-64 overflow-auto px-4 pb-3">
            <table className="border-collapse">
              <thead className="bg-zinc-100 text-zinc-600">
                <tr>
                  <Th>Band</Th>
                  <Th>Tier 1 (Base)</Th>
                  <Th>Tier 2 (Low)</Th>
                  <Th>Tier 3 (Mid)</Th>
                  <Th>Tier 4 (Upper)</Th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((b) => {
                  const row = [1, 2, 3, 4].map((t) =>
                    paybands.find((p) => p.band === b && p.tier === t),
                  );
                  return (
                    <tr key={b} className="border-b border-zinc-100">
                      <Td className="font-medium">Band {b}</Td>
                      {row.map((p, i) => (
                        <Td key={i} className="text-right tabular-nums">
                          {p?.caseByCase
                            ? "Case-by-Case"
                            : p?.salaryAnnual
                              ? fmtMoney2(p.salaryAnnual.toString())
                              : "—"}
                        </Td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`border-b border-zinc-200 px-3 py-1.5 text-left font-medium ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={`px-3 py-1.5 ${className}`} colSpan={colSpan}>
      {children}
    </td>
  );
}
