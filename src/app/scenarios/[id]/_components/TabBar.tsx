import Link from "next/link";

export type TabKey =
  | "overview"
  | "revenue"
  | "loan-book"
  | "capital-programs"
  | "platform-revenues"
  | "opex-general"
  | "opex-staffing"
  | "pnl"
  | "balance-sheet"
  | "cashflow"
  | "valuation"
  | "control-panel";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "revenue", label: "Revenue" },
  { key: "loan-book", label: "Loan Book" },
  { key: "capital-programs", label: "Capital Programs" },
  { key: "platform-revenues", label: "Platform Revenues" },
  { key: "opex-general", label: "OPEX — General" },
  { key: "opex-staffing", label: "OPEX — Staffing" },
  { key: "pnl", label: "Profit & Loss" },
  { key: "balance-sheet", label: "Balance Sheet" },
  { key: "cashflow", label: "Cashflow" },
  { key: "valuation", label: "Valuation" },
  { key: "control-panel", label: "Control Panel" },
];

export function isTabKey(value: string | undefined): value is TabKey {
  return !!value && TABS.some((t) => t.key === value);
}

export function TabBar({ scenarioId, active }: { scenarioId: string; active: TabKey }) {
  return (
    <nav className="flex items-stretch gap-px overflow-x-auto border-t border-zinc-300 bg-zinc-100 px-2">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={`/scenarios/${scenarioId}?tab=${t.key}`}
            scroll={false}
            className={`whitespace-nowrap border-x border-zinc-300 px-4 py-1.5 text-xs font-medium transition ${
              isActive
                ? "border-t-2 border-t-emerald-600 bg-white text-zinc-900"
                : "border-t border-t-transparent bg-zinc-100 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
