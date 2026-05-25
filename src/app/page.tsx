import { Types } from "mongoose";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { connectToDatabase } from "@/lib/db";
import { CapitalProgram, Driver, Headcount, Loan, Scenario } from "@/models";
import type { ScenarioViewMode } from "@/models/scenario.model";
import {
  branchFromBase,
  createScenario,
  deleteScenario,
  duplicateScenarioAsProfile,
  setBaseScenario,
  unsetBaseScenario,
} from "./_actions";
import { UserMenu } from "./_components/UserMenu";

export const dynamic = "force-dynamic";

interface ScenarioRow {
  _id: string;
  name: string;
  status: string;
  isBase: boolean;
  viewMode: ScenarioViewMode;
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
    viewMode?: ScenarioViewMode;
    parentId?: { toString: () => string };
    updatedAt: Date;
  };

  const scenarios = await Scenario.find({ deletedAt: null })
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
      viewMode: s.viewMode ?? "all",
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

  const baseAll = rows.find((r) => r.isBase && r.viewMode === "all") ?? null;
  const baseGallantree = rows.find((r) => r.isBase && r.viewMode === "gallantree") ?? null;
  const branches = rows.filter((r) => !r.isBase);

  // Capital programs for base scenarios
  type ProgramLean = {
    _id: { toString(): string };
    scenarioId: { toString(): string };
    name: string;
    type: "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER";
    dealSize?: { toString(): string };
    startPeriodKey: string;
    endPeriodKey?: string;
    fees: Array<{ basisAmount: { toString(): string }; feeBps: number }>;
  };
  const baseScenarioIds = rows.filter((r) => r.isBase).map((r) => r._id);
  const basePrograms =
    baseScenarioIds.length > 0
      ? await CapitalProgram.find({
          scenarioId: { $in: baseScenarioIds.map((id) => new Types.ObjectId(id)) },
        })
          .sort({ scenarioId: 1, startPeriodKey: 1, name: 1 })
          .lean<ProgramLean[]>()
      : [];
  // For the branch form: default to the All base if present, otherwise Gallantree.
  const branchBaseAll = baseAll;
  const branchBaseGallantree = baseGallantree;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
          <Link href="/" className="inline-flex items-center" aria-label="Gallantree">
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
            <span className="text-xs text-zinc-500">Driver-based 5-year scenarios</span>
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
        {/* Base scenarios — one per profile */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-600">
              Base scenarios
            </h2>
            <span className="text-xs text-zinc-500">
              Two profiles · the consolidated &ldquo;All&rdquo; view and the Gallantree-only view.
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BaseSlot
              viewMode="all"
              label="All"
              description="Full consolidated workspace · revenue, loan book, capital programs, full P&amp;L."
              row={baseAll}
              candidates={rows.filter((r) => r.viewMode === "all")}
              counterpart={baseGallantree}
            />
            <BaseSlot
              viewMode="gallantree"
              label="Gallantree"
              description="Gallantree's own operating economics · platform revenues, OPEX, Gallantree P&amp;L."
              row={baseGallantree}
              candidates={rows.filter((r) => r.viewMode === "gallantree")}
              counterpart={baseAll}
            />
          </div>
        </section>

        {/* Branches */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-600">
              Branched scenarios
            </h2>
            <span className="text-xs text-zinc-500">Edit freely — the base stays untouched.</span>
          </div>

          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            {branchBaseAll ? (
              <BranchForm base={branchBaseAll} viewMode="all" />
            ) : (
              <BranchPlaceholder label="All" />
            )}
            {branchBaseGallantree ? (
              <BranchForm base={branchBaseGallantree} viewMode="gallantree" />
            ) : (
              <BranchPlaceholder label="Gallantree" />
            )}
          </div>

          {branches.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-500">
              No branches yet.
            </div>
          ) : (
            <BranchTable rows={branches} />
          )}
        </section>

        {/* Capital Programs */}
        {basePrograms.length > 0 ? (
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-600">
                Capital Programs
              </h2>
              <span className="text-xs text-zinc-500">Programs across base scenarios.</span>
            </div>
            <ProgramsTable programs={basePrograms} scenarioNameById={Object.fromEntries(rows.map((r) => [r._id, r.name]))} />
          </section>
        ) : null}

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

function BaseSlot({
  viewMode,
  label,
  description,
  row,
  candidates,
  counterpart,
}: {
  viewMode: ScenarioViewMode;
  label: string;
  description: string;
  row: ScenarioRow | null;
  candidates: ScenarioRow[];
  counterpart: ScenarioRow | null;
}) {
  const accent = viewMode === "gallantree" ? "border-indigo-300" : "border-emerald-300";
  const chip =
    viewMode === "gallantree" ? "bg-indigo-100 text-indigo-800" : "bg-emerald-100 text-emerald-800";

  return (
    <div className={`rounded-md border-2 ${accent} bg-white shadow-sm`}>
      <div className="border-b border-zinc-100 px-5 py-2">
        <div className="flex items-baseline gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${chip}`}
          >
            {label}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">profile</span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
      </div>

      {row ? (
        <div className="flex items-stretch justify-between">
          <div className="flex-1 px-5 py-4">
            <div className="flex items-baseline gap-3">
              <Link
                href={`/scenarios/${row._id}`}
                className="text-base font-semibold tracking-tight hover:underline"
              >
                {row.name}
              </Link>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600">
                {row.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-5 text-xs text-zinc-600">
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
      ) : (
        <EmptyBaseSlot
          viewMode={viewMode}
          label={label}
          candidates={candidates}
          counterpart={counterpart}
        />
      )}
    </div>
  );
}

function EmptyBaseSlot({
  viewMode,
  label,
  candidates,
  counterpart,
}: {
  viewMode: ScenarioViewMode;
  label: string;
  candidates: ScenarioRow[];
  counterpart: ScenarioRow | null;
}) {
  const defaultName = viewMode === "gallantree" ? "Base Model — Gallantree" : "Base Model — All";
  return (
    <div className="px-5 py-4">
      <p className="text-sm text-zinc-700">
        No <strong>{label}</strong> base set yet.
      </p>
      {counterpart ? (
        <form action={duplicateScenarioAsProfile} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="sourceId" value={counterpart._id} />
          <input type="hidden" name="viewMode" value={viewMode} />
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Name
            </span>
            <input
              type="text"
              name="name"
              required
              defaultValue={defaultName}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Duplicate {counterpart.name} as {label}
          </button>
        </form>
      ) : null}
      {candidates.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Or promote an existing {label} scenario
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
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
        </div>
      ) : null}
    </div>
  );
}

function BranchForm({ base, viewMode }: { base: ScenarioRow; viewMode: ScenarioViewMode }) {
  const accent =
    viewMode === "gallantree" ? "border-indigo-200 bg-indigo-50/30" : "border-zinc-200 bg-white";
  return (
    <form
      action={branchFromBase}
      className={`flex items-end gap-2 rounded-md border ${accent} px-4 py-3 text-xs`}
    >
      <input type="hidden" name="viewMode" value={viewMode} />
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Branch from {viewMode === "gallantree" ? "Gallantree" : "All"} · {base.name}
        </span>
        <input
          type="text"
          name="name"
          required
          placeholder={
            viewMode === "gallantree"
              ? "e.g. Tight OPEX · Faster license ramp"
              : "e.g. Aggressive hiring · Downside NIM"
          }
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Branch
      </button>
    </form>
  );
}

function BranchPlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
      Set a {label} base above to enable branching from it.
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
            <Th>Profile</Th>
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
              <Td>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    r.viewMode === "gallantree"
                      ? "bg-indigo-100 text-indigo-800"
                      : "bg-zinc-200 text-zinc-700"
                  }`}
                >
                  {r.viewMode === "gallantree" ? "Gallantree" : "All"}
                </span>
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

const PROGRAM_TYPE_LABEL: Record<string, string> = {
  CRE_CLO: "CRE CLO",
  CMBS: "CMBS",
  MIT_FUND: "MIT Fund",
  WAREHOUSE: "Warehouse",
  OTHER: "Other",
};

const PROGRAM_TYPE_COLOR: Record<string, string> = {
  CRE_CLO: "bg-emerald-100 text-emerald-800",
  CMBS: "bg-sky-100 text-sky-800",
  MIT_FUND: "bg-violet-100 text-violet-800",
  WAREHOUSE: "bg-amber-100 text-amber-800",
  OTHER: "bg-zinc-100 text-zinc-700",
};

type HomeProgramRow = {
  _id: { toString(): string };
  scenarioId: { toString(): string };
  name: string;
  type: "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER";
  dealSize?: { toString(): string };
  startPeriodKey: string;
  endPeriodKey?: string;
  fees: Array<{ basisAmount: { toString(): string }; feeBps: number }>;
};

function programAnnualFees(p: HomeProgramRow): number {
  return p.fees.reduce((acc, f) => acc + (Number(f.basisAmount.toString()) * f.feeBps) / 10000, 0);
}

function ProgramsTable({
  programs,
  scenarioNameById,
}: {
  programs: HomeProgramRow[];
  scenarioNameById: Record<string, string>;
}) {
  const AUD2 = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  });
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <Th>Program</Th>
            <Th>Type</Th>
            <Th>Scenario</Th>
            <Th className="text-right">Deal Size</Th>
            <Th>Period</Th>
            <Th className="text-right">Annual Fees</Th>
            <Th className="text-right">Open</Th>
          </tr>
        </thead>
        <tbody>
          {programs.map((p) => {
            const sid = p.scenarioId.toString();
            const pid = p._id.toString();
            const annual = programAnnualFees(p);
            return (
              <tr key={pid} className="border-t border-zinc-100 hover:bg-yellow-50/40">
                <Td>
                  <Link
                    href={`/scenarios/${sid}/programs/${pid}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {p.name}
                  </Link>
                </Td>
                <Td>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PROGRAM_TYPE_COLOR[p.type] ?? "bg-zinc-100 text-zinc-700"}`}
                  >
                    {PROGRAM_TYPE_LABEL[p.type] ?? p.type}
                  </span>
                </Td>
                <Td className="text-zinc-600">{scenarioNameById[sid] ?? "—"}</Td>
                <Td className="text-right tabular-nums text-zinc-600">
                  {p.dealSize ? AUD2.format(Number(p.dealSize.toString())) : "—"}
                </Td>
                <Td className="font-mono text-[11px] text-zinc-500">
                  {p.startPeriodKey}
                  {p.endPeriodKey ? ` → ${p.endPeriodKey}` : ""}
                </Td>
                <Td className="text-right tabular-nums text-emerald-700">
                  {annual > 0 ? AUD2.format(annual) : "—"}
                </Td>
                <Td className="text-right">
                  <Link
                    href={`/scenarios/${sid}/programs/${pid}`}
                    className="rounded px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100"
                  >
                    Open →
                  </Link>
                </Td>
              </tr>
            );
          })}
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
  return <th className={`px-4 py-2 text-left font-medium ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2 ${className}`}>{children}</td>;
}
