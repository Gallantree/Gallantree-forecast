import Image from "next/image";
import Link from "next/link";
import { connectToDatabase } from "@/lib/db";
import { Scenario, Driver, Headcount, Loan, CapitalProgram } from "@/models";
import { getCurrentUser } from "@/lib/currentUser";
import { UserMenu } from "./_components/UserMenu";
import {
  branchFromBase,
  createScenario,
  deleteScenario,
  setBaseScenario,
  unsetBaseScenario,
} from "./_actions";

export const dynamic = "force-dynamic";

interface ScenarioRow {
  _id: string;
  name: string;
  status: string;
  isBase: boolean;
  parentName?: string;
  updatedAt: string;
  counts: {
    drivers: number;
    staff: number;
    loans: number;
    programs: number;
  };
}

function fmtDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function Home() {
  await connectToDatabase();
  const me = await getCurrentUser();

  type LeanScenario = {
    _id: { toString: () => string };
    name: string;
    status: string;
    isBase?: boolean;
    parentId?: { toString: () => string };
    updatedAt: Date;
  };

  const scenarios = await Scenario.find({})
    .sort({ updatedAt: -1 })
    .lean<LeanScenario[]>();

  // Aggregate per-scenario counts in a single query each.
  const ids = scenarios.map((s) => s._id.toString());
  const [driverCounts, staffCounts, loanCounts, programCounts] = await Promise.all([
    Driver.aggregate([
      { $match: { scenarioId: { $in: scenarios.map((s) => s._id) } } },
      { $group: { _id: "$scenarioId", n: { $sum: 1 } } },
    ]),
    Headcount.aggregate([
      { $match: { scenarioId: { $in: scenarios.map((s) => s._id) } } },
      { $group: { _id: "$scenarioId", n: { $sum: 1 } } },
    ]),
    Loan.aggregate([
      { $match: { scenarioId: { $in: scenarios.map((s) => s._id) } } },
      { $group: { _id: "$scenarioId", n: { $sum: 1 } } },
    ]),
    CapitalProgram.aggregate([
      { $match: { scenarioId: { $in: scenarios.map((s) => s._id) } } },
      { $group: { _id: "$scenarioId", n: { $sum: 1 } } },
    ]),
  ]);
  void ids;

  const countMap = (rows: { _id: { toString: () => string }; n: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r._id.toString(), r.n);
    return m;
  };
  const dC = countMap(driverCounts);
  const sC = countMap(staffCounts);
  const lC = countMap(loanCounts);
  const pC = countMap(programCounts);

  const nameById = new Map(scenarios.map((s) => [s._id.toString(), s.name]));

  const rows: ScenarioRow[] = scenarios.map((s) => {
    const id = s._id.toString();
    return {
      _id: id,
      name: s.name,
      status: s.status,
      isBase: s.isBase ?? false,
      parentName: s.parentId ? nameById.get(s.parentId.toString()) : undefined,
      updatedAt: fmtDate(s.updatedAt),
      counts: {
        drivers: dC.get(id) ?? 0,
        staff: sC.get(id) ?? 0,
        loans: lC.get(id) ?? 0,
        programs: pC.get(id) ?? 0,
      },
    };
  });

  const base = rows.find((r) => r.isBase) ?? null;
  const branches = rows.filter((r) => !r.isBase);

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
          <Link
            href="/"
            className="inline-flex items-center"
            aria-label="Gallantree"
          >
            <Image
              src="/gallantree-logo.png"
              alt="Gallantree"
              width={1356}
              height={216}
              priority
              className="h-7 w-auto"
            />
          </Link>
          <div className="hidden flex-1 items-baseline gap-3 sm:flex">
            <h1 className="text-sm font-semibold tracking-tight text-zinc-800">
              Gallantree Forecast
            </h1>
            <span className="text-xs text-zinc-500">
              Driver-based 5-year scenarios
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-500">
              {rows.length} scenario{rows.length === 1 ? "" : "s"}
            </span>
            <UserMenu user={me} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        {/* Base scenario */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-600">
              Base scenario
            </h2>
            {base ? (
              <span className="text-xs text-zinc-500">
                The unmodified baseline. Branches inherit and override.
              </span>
            ) : null}
          </div>

          {base ? <BaseCard row={base} /> : <NoBaseCard candidates={rows} />}
        </section>

        {/* Branches */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-600">
              Branched scenarios
            </h2>
            <span className="text-xs text-zinc-500">
              Edit freely — the base stays untouched.
            </span>
          </div>

          {base ? (
            <form
              action={branchFromBase}
              className="mb-4 flex items-end gap-2 rounded-md border border-zinc-200 bg-white px-4 py-3 text-xs"
            >
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Branch name
                </span>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. Aggressive hiring · Downside NIM · Conservative loan growth"
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Branch from {base.name}
              </button>
            </form>
          ) : (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              Pick a base scenario above before branching.
            </div>
          )}

          {branches.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-500">
              No branches yet.
              {base ? " Create one above." : ""}
            </div>
          ) : (
            <BranchTable rows={branches} />
          )}
        </section>

        {/* Fallback: create a brand-new scenario from scratch */}
        <section>
          <details>
            <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-900">
              Or create a blank scenario from scratch
            </summary>
            <form action={createScenario} className="mt-3 flex gap-2">
              <input
                type="text"
                name="name"
                required
                placeholder="New blank scenario"
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Create empty
              </button>
            </form>
          </details>
        </section>
      </main>
    </div>
  );
}

function BaseCard({ row }: { row: ScenarioRow }) {
  return (
    <div className="flex items-stretch justify-between rounded-md border-2 border-emerald-300 bg-white shadow-sm">
      <div className="flex-1 px-5 py-4">
        <div className="flex items-baseline gap-3">
          <Link
            href={`/scenarios/${row._id}`}
            className="text-base font-semibold tracking-tight hover:underline"
          >
            {row.name}
          </Link>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
            Base
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600">
            {row.status}
          </span>
        </div>
        <div className="mt-2 flex gap-5 text-xs text-zinc-600">
          <Stat label="Drivers" value={row.counts.drivers} />
          <Stat label="Staff" value={row.counts.staff} />
          <Stat label="Loans" value={row.counts.loans} />
          <Stat label="Capital programs" value={row.counts.programs} />
          <span className="ml-auto text-zinc-400">Updated {row.updatedAt}</span>
        </div>
      </div>
      <div className="flex flex-col items-stretch justify-center gap-2 border-l border-zinc-200 px-4 py-4">
        <Link
          href={`/scenarios/${row._id}`}
          className="rounded-md bg-zinc-900 px-4 py-1.5 text-center text-xs font-medium text-white hover:bg-zinc-700"
        >
          Open →
        </Link>
        <form action={unsetBaseScenario.bind(null, row._id)}>
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-300 bg-white px-4 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Unset base
          </button>
        </form>
      </div>
    </div>
  );
}

function NoBaseCard({ candidates }: { candidates: ScenarioRow[] }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white px-5 py-4">
      <p className="text-sm text-zinc-700">
        No base scenario is set. Pick one to designate as the baseline that
        branches will fork from.
      </p>
      {candidates.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500">
          Create a scenario first — see below.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {candidates.map((c) => (
            <li key={c._id}>
              <form action={setBaseScenario.bind(null, c._id)}>
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                >
                  Set {c.name} as base
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BranchTable({ rows }: { rows: ScenarioRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <Th>Name</Th>
            <Th>Parent</Th>
            <Th>Status</Th>
            <Th className="text-right">Drivers</Th>
            <Th className="text-right">Staff</Th>
            <Th className="text-right">Loans</Th>
            <Th className="text-right">Programs</Th>
            <Th>Updated</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} className="border-t border-zinc-100 hover:bg-yellow-50/40">
              <Td>
                <Link
                  href={`/scenarios/${r._id}`}
                  className="font-medium text-zinc-900 hover:underline"
                >
                  {r.name}
                </Link>
              </Td>
              <Td className="text-zinc-600">{r.parentName ?? "—"}</Td>
              <Td>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600">
                  {r.status}
                </span>
              </Td>
              <Td className="text-right tabular-nums text-zinc-600">{r.counts.drivers}</Td>
              <Td className="text-right tabular-nums text-zinc-600">{r.counts.staff}</Td>
              <Td className="text-right tabular-nums text-zinc-600">{r.counts.loans}</Td>
              <Td className="text-right tabular-nums text-zinc-600">{r.counts.programs}</Td>
              <Td className="text-zinc-500">{r.updatedAt}</Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-2 text-xs">
                  <Link
                    href={`/scenarios/${r._id}`}
                    className="rounded px-2 py-0.5 text-zinc-700 hover:bg-zinc-100"
                  >
                    Open
                  </Link>
                  <form action={setBaseScenario.bind(null, r._id)}>
                    <button
                      type="submit"
                      className="rounded px-2 py-0.5 text-zinc-500 hover:bg-emerald-50 hover:text-emerald-700"
                      title="Promote to base scenario"
                    >
                      Set base
                    </button>
                  </form>
                  <form action={deleteScenario.bind(null, r._id)}>
                    <button
                      type="submit"
                      className="rounded px-2 py-0.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-700"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="font-semibold tabular-nums text-zinc-900">{value}</span>{" "}
      <span className="text-zinc-500">{label.toLowerCase()}</span>
    </span>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2 text-left font-medium ${className}`}>{children}</th>
  );
}

function Td({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-2 ${className}`}>{children}</td>;
}
