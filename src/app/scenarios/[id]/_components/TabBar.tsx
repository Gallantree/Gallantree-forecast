import Link from "next/link";
import type { ScenarioViewMode } from "@/models/scenario.model";

export type TabKey =
  | "overview"
  | "overview-gallantree"
  | "revenue"
  | "loan-book"
  | "loan-book-analysis"
  | "capital-programs"
  | "capital-raises"
  | "platform-revenues"
  | "opex-general"
  | "opex-staffing"
  | "capex"
  | "pnl"
  | "pnl-gallantree"
  | "balance-sheet"
  | "cashflow"
  | "valuation"
  | "use-of-funds"
  | "capital-table"
  | "control-panel";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "overview-gallantree", label: "Overview — Gallantree" },
  { key: "revenue", label: "Revenue" },
  { key: "loan-book", label: "Loan Book" },
  { key: "loan-book-analysis", label: "Loan Book Analysis" },
  { key: "capital-programs", label: "Capital Programs" },
  { key: "capital-raises", label: "Capital Raises" },
  { key: "platform-revenues", label: "Platform Revenues" },
  { key: "opex-general", label: "OPEX — General" },
  { key: "opex-staffing", label: "OPEX — Staffing" },
  { key: "capex", label: "Capex" },
  { key: "pnl", label: "Profit & Loss" },
  { key: "pnl-gallantree", label: "Profit & Loss — Gallantree" },
  { key: "balance-sheet", label: "Balance Sheet" },
  { key: "cashflow", label: "Cashflow" },
  { key: "valuation", label: "Valuation" },
  { key: "use-of-funds", label: "Use of Funds" },
  { key: "capital-table", label: "Capital Table" },
  { key: "control-panel", label: "Control Panel" },
];

// 'all' shows the full consolidated workspace minus the Gallantree-only tabs
// (which are reserved for the Gallantree-only profile, so the two scenarios
// are visually distinct).
const ALL_TABS: TabKey[] = [
  "overview",
  "revenue",
  "loan-book",
  "loan-book-analysis",
  "capital-programs",
  "capital-raises",
  "platform-revenues",
  "opex-general",
  "opex-staffing",
  "capex",
  "pnl",
  "balance-sheet",
  "cashflow",
  "valuation",
  "use-of-funds",
  "capital-table",
  "control-panel",
];

// 'gallantree' shows only Gallantree's own operating economics.
const GALLANTREE_TABS: TabKey[] = [
  "overview-gallantree",
  "capital-programs",
  "loan-book",
  "loan-book-analysis",
  "platform-revenues",
  "capital-raises",
  "opex-general",
  "opex-staffing",
  "capex",
  "pnl-gallantree",
  "balance-sheet",
  "cashflow",
  "valuation",
  "use-of-funds",
  "capital-table",
  "control-panel",
];

export function tabsFor(viewMode: ScenarioViewMode | undefined): { key: TabKey; label: string }[] {
  const allowed = new Set<TabKey>(viewMode === "gallantree" ? GALLANTREE_TABS : ALL_TABS);
  return TABS.filter((t) => allowed.has(t.key));
}

export function defaultTabFor(viewMode: ScenarioViewMode | undefined): TabKey {
  return viewMode === "gallantree" ? "overview-gallantree" : "overview";
}

export function isTabKey(value: string | undefined): value is TabKey {
  return !!value && TABS.some((t) => t.key === value);
}

export function isTabKeyForMode(
  value: string | undefined,
  viewMode: ScenarioViewMode | undefined,
): value is TabKey {
  if (!value) return false;
  const allowed = new Set<TabKey>(viewMode === "gallantree" ? GALLANTREE_TABS : ALL_TABS);
  return allowed.has(value as TabKey);
}

export function TabBar({
  scenarioId,
  active,
  viewMode,
}: {
  scenarioId: string;
  active: TabKey;
  viewMode?: ScenarioViewMode;
}) {
  const visible = tabsFor(viewMode);
  return (
    <nav className="flex items-stretch gap-px overflow-x-auto border-t border-zinc-300 bg-zinc-100 px-2">
      {visible.map((t) => {
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
