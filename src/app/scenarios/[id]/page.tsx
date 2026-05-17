import Link from "next/link";
import { Types } from "mongoose";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db";
import { Scenario, Driver, Period, Account } from "@/models";
import { toDecimal128 } from "@/utils/money";
import { computePnL, type RecurringRevenueDriverInput } from "@/engine/pnl";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function addDriver(scenarioId: string, formData: FormData) {
  "use server";
  if (!Types.ObjectId.isValid(scenarioId)) return;
  const name = String(formData.get("name") ?? "").trim();
  const accountCode = String(formData.get("accountCode") ?? "").trim();
  const startPeriodKey = String(formData.get("startPeriodKey") ?? "").trim();
  const baseMonthly = String(formData.get("baseMonthly") ?? "0");
  const monthlyGrowthPct = String(formData.get("monthlyGrowthPct") ?? "0");
  if (!name || !accountCode || !/^\d{4}-(0[1-9]|1[0-2])$/.test(startPeriodKey)) return;
  await connectToDatabase();
  await Driver.create({
    scenarioId: new Types.ObjectId(scenarioId),
    name,
    accountCode,
    type: "recurring_revenue",
    startPeriodKey,
    baseMonthly: toDecimal128(baseMonthly),
    monthlyGrowthPct: toDecimal128(monthlyGrowthPct),
  });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export default async function ScenarioPage({ params }: Params) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectToDatabase();
  const scenario = await Scenario.findById(id).lean();
  if (!scenario) notFound();

  const [drivers, periods, accounts] = await Promise.all([
    Driver.find({ scenarioId: id }).sort({ createdAt: 1 }).lean(),
    Period.find({}).sort({ index: 1 }).lean(),
    Account.find({ type: "revenue" }).sort({ code: 1 }).lean(),
  ]);

  const horizon = periods.map((p) => p.key);
  const driverInputs: RecurringRevenueDriverInput[] = drivers.map((d) => ({
    id: String(d._id),
    name: d.name,
    accountCode: d.accountCode,
    startPeriodKey: d.startPeriodKey,
    baseMonthly: d.baseMonthly.toString(),
    monthlyGrowthPct: d.monthlyGrowthPct.toString(),
  }));
  const pnl = horizon.length > 0 ? computePnL(driverInputs, horizon) : null;
  const firstPeriod = horizon[0] ?? "";
  const accountByCode = new Map(accounts.map((a) => [a.code, a.name]));

  const addDriverAction = addDriver.bind(null, id);
  const scenarioName = (scenario as { name: string }).name;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 font-sans">
      <Link href="/" className="text-xs text-zinc-500 hover:underline">
        ← All scenarios
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{scenarioName}</h1>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-700">Add revenue driver</h2>
        {periods.length === 0 ? (
          <p className="mt-2 text-sm text-amber-700">
            Periods aren&apos;t seeded yet. Run <code className="font-mono">npm run seed</code> first.
          </p>
        ) : (
          <form action={addDriverAction} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input
              name="name"
              required
              placeholder="Mgmt fees"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <select
              name="accountCode"
              required
              defaultValue=""
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Account…
              </option>
              {accounts.map((a) => (
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
              placeholder="YYYY-MM"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              name="baseMonthly"
              required
              defaultValue="0"
              inputMode="decimal"
              placeholder="Base $/mo"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              name="monthlyGrowthPct"
              required
              defaultValue="0"
              inputMode="decimal"
              placeholder="Growth %/mo"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="col-span-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white sm:col-span-5"
            >
              Add driver
            </button>
          </form>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-zinc-700">
          Drivers ({drivers.length})
        </h2>
        {drivers.length > 0 && (
          <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200">
            {drivers.map((d) => (
              <li key={String(d._id)} className="flex justify-between px-4 py-2 text-sm">
                <span>
                  <span className="font-medium">{d.name}</span>{" "}
                  <span className="text-zinc-500">
                    · {d.accountCode} · base ${d.baseMonthly.toString()}/mo · {d.monthlyGrowthPct.toString()}%/mo · from {d.startPeriodKey}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-zinc-700">P&amp;L — Revenue</h2>
        {!pnl || pnl.lines.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Add a driver to see a P&amp;L line.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-md border border-zinc-200">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-600">
                <tr>
                  <th className="sticky left-0 bg-zinc-50 px-3 py-2 text-left">Account</th>
                  {pnl.horizon.slice(0, 12).map((pk) => (
                    <th key={pk} className="px-3 py-2 text-right">
                      {pk}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">FY total</th>
                </tr>
              </thead>
              <tbody>
                {pnl.lines.map((l) => (
                  <tr key={l.accountCode} className="border-t border-zinc-200">
                    <td className="sticky left-0 bg-white px-3 py-2 font-medium">
                      {l.accountCode} {accountByCode.get(l.accountCode) ?? ""}
                    </td>
                    {l.monthly.slice(0, 12).map((m) => (
                      <td key={m.periodKey} className="px-3 py-2 text-right tabular-nums">
                        {m.value.toFixed(0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {l.monthly
                        .slice(0, 12)
                        .reduce((acc, v) => acc.plus(v.value), l.monthly[0].value.minus(l.monthly[0].value))
                        .toFixed(0)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-300 bg-zinc-50">
                  <td className="sticky left-0 bg-zinc-50 px-3 py-2 font-semibold">Total revenue (60mo)</td>
                  <td colSpan={12}></td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {pnl.revenueTotal.toFixed(0)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-zinc-500">Showing first 12 months of 60.</p>
          </div>
        )}
      </section>
    </main>
  );
}
