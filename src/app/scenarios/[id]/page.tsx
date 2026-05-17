import Link from "next/link";
import { Fragment } from "react";
import { Types } from "mongoose";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db";
import { Scenario, Driver, Headcount, Period, Account } from "@/models";
import { toDecimal128 } from "@/utils/money";
import { fmtMoney0, fmtNum0, fmtPercent } from "@/utils/format";
import { computePnL, type PnLSection, type MonthlyValue } from "@/engine/pnl";
import { loadEngineInputs } from "@/engine/inputs";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function addDriver(scenarioId: string, formData: FormData) {
  "use server";
  if (!Types.ObjectId.isValid(scenarioId)) return;
  const type = String(formData.get("type") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const accountCode = String(formData.get("accountCode") ?? "").trim();
  const startPeriodKey = String(formData.get("startPeriodKey") ?? "").trim();
  if (!name || !accountCode || !/^\d{4}-(0[1-9]|1[0-2])$/.test(startPeriodKey)) return;
  await connectToDatabase();
  const base = {
    scenarioId: new Types.ObjectId(scenarioId),
    name,
    accountCode,
    startPeriodKey,
  };
  if (type === "recurring_revenue" || type === "opex_fixed") {
    const baseMonthly = String(formData.get("baseMonthly") ?? "0");
    const monthlyGrowthPct = String(formData.get("monthlyGrowthPct") ?? "0");
    await Driver.create({
      ...base,
      type,
      baseMonthly: toDecimal128(baseMonthly),
      monthlyGrowthPct: toDecimal128(monthlyGrowthPct),
    });
  } else if (type === "opex_pct_revenue") {
    const pctOfRevenue = String(formData.get("pctOfRevenue") ?? "0");
    await Driver.create({
      ...base,
      type,
      pctOfRevenue: toDecimal128(pctOfRevenue),
    });
  } else {
    return;
  }
  revalidatePath(`/scenarios/${scenarioId}`);
}

async function addHeadcount(scenarioId: string, formData: FormData) {
  "use server";
  if (!Types.ObjectId.isValid(scenarioId)) return;
  const role = String(formData.get("role") ?? "").trim();
  const accountCode = String(formData.get("accountCode") ?? "").trim();
  const startPeriodKey = String(formData.get("startPeriodKey") ?? "").trim();
  const salaryAnnual = String(formData.get("salaryAnnual") ?? "0");
  const onCostPct = String(formData.get("onCostPct") ?? "0");
  const salaryGrowthPctAnnual = String(formData.get("salaryGrowthPctAnnual") ?? "0");
  if (!role || !accountCode || !/^\d{4}-(0[1-9]|1[0-2])$/.test(startPeriodKey)) return;
  await connectToDatabase();
  await Headcount.create({
    scenarioId: new Types.ObjectId(scenarioId),
    role,
    accountCode,
    startPeriodKey,
    salaryAnnual: toDecimal128(salaryAnnual),
    onCostPct: toDecimal128(onCostPct),
    salaryGrowthPctAnnual: toDecimal128(salaryGrowthPctAnnual),
  });
  revalidatePath(`/scenarios/${scenarioId}`);
}

interface FYGroup {
  fy: number;
  months: string[];
}

function buildFYGroups(periods: { key: string; fiscalYear: number }[]): FYGroup[] {
  const map = new Map<number, string[]>();
  for (const p of periods) {
    if (!map.has(p.fiscalYear)) map.set(p.fiscalYear, []);
    map.get(p.fiscalYear)!.push(p.key);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([fy, months]) => ({ fy, months }));
}

function fyTotalsFor(series: MonthlyValue[], groups: FYGroup[]): number[] {
  return groups.map((g) => {
    const keys = new Set(g.months);
    return series.reduce(
      (acc, m) => (keys.has(m.periodKey) ? acc + Number(m.value.toFixed(2)) : acc),
      0,
    );
  });
}

function SectionRows({
  section,
  groups,
  accountByCode,
  emphasis = "normal",
}: {
  section: PnLSection;
  groups: FYGroup[];
  accountByCode: Map<string, string>;
  emphasis?: "normal";
}) {
  return (
    <>
      {section.lines.map((line) => (
        <tr key={line.accountCode} className="hover:bg-yellow-50/40">
          <td className="sticky left-0 z-20 w-72 border-b border-r border-zinc-200 bg-white px-3 py-1.5 font-medium">
            <span className="font-mono text-zinc-500">{line.accountCode}</span>{" "}
            {accountByCode.get(line.accountCode) ?? ""}
          </td>
          {groups.map((g) => {
            const cells = g.months.map((pk) => {
              const m = line.monthly.find((x) => x.periodKey === pk)!;
              return { periodKey: pk, value: m.value.toFixed(2) };
            });
            const total = cells.reduce((acc, c) => acc + Number(c.value), 0);
            return (
              <Fragment key={`${line.accountCode}-fy${g.fy}`}>
                {cells.map((m) => (
                  <td
                    key={`${line.accountCode}-${m.periodKey}`}
                    className="border-b border-zinc-100 px-2 py-1.5 text-right tabular-nums text-zinc-800"
                  >
                    {fmtNum0(m.value)}
                  </td>
                ))}
                <td className="border-b border-r border-zinc-300 bg-zinc-50 px-2 py-1.5 text-right font-semibold tabular-nums text-zinc-900">
                  {fmtNum0(total)}
                </td>
              </Fragment>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function TotalRow({
  label,
  series,
  groups,
  variant,
}: {
  label: string;
  series: MonthlyValue[];
  groups: FYGroup[];
  variant: "section" | "grand";
}) {
  const fyTotals = fyTotalsFor(series, groups);
  const cls =
    variant === "grand"
      ? "bg-zinc-200 font-bold text-zinc-900"
      : "bg-zinc-100 font-semibold text-zinc-900";
  const border = "border-t-2 border-zinc-400";
  return (
    <tr className={cls}>
      <td className={`sticky left-0 z-20 ${border} border-r bg-inherit px-3 py-1.5`}>{label}</td>
      {groups.map((g, gi) => (
        <Fragment key={`${label}-fy${g.fy}`}>
          {g.months.map((pk) => {
            const m = series.find((x) => x.periodKey === pk)!;
            return (
              <td key={`${label}-${pk}`} className={`${border} px-2 py-1.5 text-right tabular-nums`}>
                {fmtNum0(m.value.toFixed(2))}
              </td>
            );
          })}
          <td className={`${border} border-r bg-zinc-200 px-2 py-1.5 text-right tabular-nums`}>
            {fmtNum0(fyTotals[gi])}
          </td>
        </Fragment>
      ))}
    </tr>
  );
}

export default async function ScenarioPage({ params }: Params) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectToDatabase();
  const scenario = await Scenario.findById(id).lean();
  if (!scenario) notFound();

  const [periods, accounts, drivers, headcountDocs, inputs] = await Promise.all([
    Period.find({}).sort({ index: 1 }).lean(),
    Account.find({}).sort({ code: 1 }).lean(),
    Driver.find({ scenarioId: id }).sort({ createdAt: 1 }).lean(),
    Headcount.find({ scenarioId: id }).sort({ createdAt: 1 }).lean(),
    loadEngineInputs(id),
  ]);

  const horizon = periods.map((p) => p.key);
  const pnl = horizon.length > 0 ? computePnL(inputs.drivers, inputs.headcount, horizon) : null;
  const firstPeriod = horizon[0] ?? "";
  const accountByCode = new Map(accounts.map((a) => [a.code, a.name]));
  const revenueAccounts = accounts.filter((a) => a.type === "revenue");
  const expenseAccounts = accounts.filter((a) => a.type === "expense");
  const groups = buildFYGroups(periods);

  const scenarioName = (scenario as { name: string }).name;
  const scenarioStatus = (scenario as { status: string }).status;
  const addDriverAction = addDriver.bind(null, id);
  const addHeadcountAction = addHeadcount.bind(null, id);

  return (
    <div className="flex h-screen flex-col bg-zinc-50 font-sans">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-zinc-500 hover:underline">
            ← Scenarios
          </Link>
          <span className="text-zinc-300">/</span>
          <h1 className="text-base font-semibold tracking-tight">{scenarioName}</h1>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
            {scenarioStatus}
          </span>
        </div>
        <div className="flex gap-6 text-xs">
          <span className="text-zinc-500">
            Drivers <span className="font-semibold text-zinc-900">{drivers.length}</span>
          </span>
          <span className="text-zinc-500">
            Headcount <span className="font-semibold text-zinc-900">{headcountDocs.length}</span>
          </span>
          <span className="text-zinc-500">
            Revenue 5y{" "}
            <span className="font-semibold text-zinc-900">
              {pnl ? fmtMoney0(pnl.revenue.total.toFixed(2)) : "—"}
            </span>
          </span>
          <span className="text-zinc-500">
            OPEX 5y{" "}
            <span className="font-semibold text-zinc-900">
              {pnl ? fmtMoney0(pnl.opex.total.toFixed(2)) : "—"}
            </span>
          </span>
          <span className="text-zinc-500">
            Gross profit 5y{" "}
            <span
              className={`font-semibold ${
                pnl && Number(pnl.grossProfitTotal.toFixed(2)) >= 0
                  ? "text-emerald-700"
                  : "text-rose-700"
              }`}
            >
              {pnl ? fmtMoney0(pnl.grossProfitTotal.toFixed(2)) : "—"}
            </span>
          </span>
        </div>
      </header>

      {/* Toolbars */}
      {periods.length === 0 ? (
        <div className="border-b border-zinc-200 bg-white px-6 py-2 text-sm text-amber-700">
          Periods aren&apos;t seeded yet. Run <code className="font-mono">npm run seed</code> first.
        </div>
      ) : (
        <>
          <form action={addDriverAction} className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-6 py-2">
            <label className="text-xs font-medium text-zinc-600">Driver</label>
            <select
              name="type"
              required
              defaultValue="recurring_revenue"
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
            >
              <option value="recurring_revenue">Recurring revenue</option>
              <option value="opex_fixed">OPEX — fixed</option>
              <option value="opex_pct_revenue">OPEX — % of revenue</option>
            </select>
            <input
              name="name"
              required
              placeholder="Name"
              className="w-40 rounded-md border border-zinc-300 px-2 py-1 text-sm"
            />
            <select
              name="accountCode"
              required
              defaultValue=""
              className="w-56 rounded-md border border-zinc-300 px-2 py-1 text-sm"
            >
              <option value="" disabled>
                Account…
              </option>
              <optgroup label="Revenue">
                {revenueAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Expense">
                {expenseAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <input
              name="startPeriodKey"
              required
              defaultValue={firstPeriod}
              pattern="\d{4}-(0[1-9]|1[0-2])"
              className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm font-mono"
            />
            <input
              name="baseMonthly"
              defaultValue="0"
              inputMode="decimal"
              placeholder="Base $/mo"
              className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm text-right tabular-nums"
              title="recurring_revenue & opex_fixed"
            />
            <input
              name="monthlyGrowthPct"
              defaultValue="0"
              inputMode="decimal"
              placeholder="Growth %/mo"
              className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm text-right tabular-nums"
              title="recurring_revenue & opex_fixed"
            />
            <input
              name="pctOfRevenue"
              defaultValue="0"
              inputMode="decimal"
              placeholder="% of revenue"
              className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-sm text-right tabular-nums"
              title="opex_pct_revenue"
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Add driver
            </button>
          </form>

          <form action={addHeadcountAction} className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-6 py-2">
            <label className="text-xs font-medium text-zinc-600">Headcount</label>
            <input
              name="role"
              required
              placeholder="Role"
              className="w-40 rounded-md border border-zinc-300 px-2 py-1 text-sm"
            />
            <select
              name="accountCode"
              required
              defaultValue=""
              className="w-56 rounded-md border border-zinc-300 px-2 py-1 text-sm"
            >
              <option value="" disabled>
                OPEX account…
              </option>
              {expenseAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
            <input
              name="startPeriodKey"
              required
              defaultValue={firstPeriod}
              pattern="\d{4}-(0[1-9]|1[0-2])"
              className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm font-mono"
            />
            <input
              name="salaryAnnual"
              required
              defaultValue="120000"
              inputMode="decimal"
              placeholder="Salary $/yr"
              className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-sm text-right tabular-nums"
            />
            <input
              name="onCostPct"
              required
              defaultValue="20"
              inputMode="decimal"
              placeholder="On-cost %"
              className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm text-right tabular-nums"
            />
            <input
              name="salaryGrowthPctAnnual"
              required
              defaultValue="3"
              inputMode="decimal"
              placeholder="Growth %/yr"
              className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm text-right tabular-nums"
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Add role
            </button>
          </form>
        </>
      )}

      {/* Spreadsheet */}
      <div className="flex-1 overflow-auto">
        {!pnl ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Seed periods first.
          </div>
        ) : pnl.revenue.lines.length + pnl.opex.lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Add a driver or role to see the P&amp;L.
          </div>
        ) : (
          <table className="border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-100 text-zinc-600">
                <th className="sticky left-0 z-30 w-72 border-b border-r border-zinc-300 bg-zinc-100 px-3 py-1.5 text-left font-medium">
                  Account
                </th>
                {groups.map((g) => (
                  <th
                    key={`fyhead-${g.fy}`}
                    colSpan={g.months.length + 1}
                    className="border-b border-r border-zinc-300 bg-zinc-100 px-3 py-1.5 text-center font-semibold tracking-wide"
                  >
                    FY{String(g.fy).slice(-2)}
                  </th>
                ))}
              </tr>
              <tr className="bg-zinc-50 text-[11px] text-zinc-500">
                <th className="sticky left-0 z-30 border-b border-r border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left"></th>
                {groups.map((g) => (
                  <Fragment key={`hdr-fy-${g.fy}`}>
                    {g.months.map((pk) => (
                      <th
                        key={`hdr-${pk}`}
                        className="min-w-[78px] border-b border-zinc-200 px-2 py-1.5 text-right font-mono font-normal"
                      >
                        {pk.slice(2)}
                      </th>
                    ))}
                    <th className="min-w-[96px] border-b border-r border-zinc-300 bg-zinc-100 px-2 py-1.5 text-right font-semibold text-zinc-700">
                      FY{String(g.fy).slice(-2)} total
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={1 + groups.reduce((acc, g) => acc + g.months.length + 1, 0)}
                  className="border-b border-t-2 border-zinc-400 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-800"
                >
                  Revenue
                </td>
              </tr>
              <SectionRows section={pnl.revenue} groups={groups} accountByCode={accountByCode} />
              <TotalRow label="Total revenue" series={pnl.revenue.totals} groups={groups} variant="section" />

              <tr>
                <td
                  colSpan={1 + groups.reduce((acc, g) => acc + g.months.length + 1, 0)}
                  className="border-b border-t-2 border-zinc-400 bg-rose-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-rose-800"
                >
                  Operating expenses
                </td>
              </tr>
              <SectionRows section={pnl.opex} groups={groups} accountByCode={accountByCode} />
              <TotalRow label="Total OPEX" series={pnl.opex.totals} groups={groups} variant="section" />

              <TotalRow label="Gross profit" series={pnl.grossProfit} groups={groups} variant="grand" />
            </tbody>
          </table>
        )}
      </div>

      {/* Drivers + Headcount footer */}
      {(drivers.length > 0 || headcountDocs.length > 0) && (
        <div className="grid grid-cols-1 gap-2 border-t border-zinc-200 bg-white px-6 py-2 text-xs text-zinc-600 lg:grid-cols-2">
          <div>
            <span className="font-medium text-zinc-700">Drivers ({drivers.length}):</span>{" "}
            {drivers.map((d, i) => (
              <span key={String(d._id)}>
                {i > 0 && <span className="text-zinc-300"> · </span>}
                <span className="font-medium text-zinc-900">{d.name}</span>{" "}
                <span className="text-zinc-500">
                  [{d.type}] {d.accountCode}
                  {d.baseMonthly ? ` · ${fmtMoney0(d.baseMonthly.toString())}/mo` : ""}
                  {d.monthlyGrowthPct ? ` · ${fmtPercent(d.monthlyGrowthPct.toString())}/mo` : ""}
                  {d.pctOfRevenue ? ` · ${fmtPercent(d.pctOfRevenue.toString())} of rev` : ""}
                </span>
              </span>
            ))}
          </div>
          <div>
            <span className="font-medium text-zinc-700">Headcount ({headcountDocs.length}):</span>{" "}
            {headcountDocs.map((h, i) => (
              <span key={String(h._id)}>
                {i > 0 && <span className="text-zinc-300"> · </span>}
                <span className="font-medium text-zinc-900">{h.role}</span>{" "}
                <span className="text-zinc-500">
                  {h.accountCode} · {fmtMoney0(h.salaryAnnual.toString())}/yr · on-cost{" "}
                  {fmtPercent(h.onCostPct.toString())} · {fmtPercent(h.salaryGrowthPctAnnual.toString())}/yr · from{" "}
                  {h.startPeriodKey}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
