"use client";

import Link from "next/link";

type ProgramTabKey =
  | "overview"
  | "loan-book"
  | "liabilities"
  | "waterfall"
  | "bond-economics"
  | "return-profile";

const BASE_TABS: { key: ProgramTabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "loan-book", label: "Loan Book" },
  { key: "liabilities", label: "Liabilities" },
  { key: "waterfall", label: "Waterfall" },
  { key: "bond-economics", label: "Bond Economics" },
];

export function ProgramDetailTabBar({
  scenarioId,
  programId,
  active,
  showReturnProfile = false,
}: {
  scenarioId: string;
  programId: string;
  active: ProgramTabKey;
  showReturnProfile?: boolean;
}) {
  const tabs = showReturnProfile
    ? [...BASE_TABS, { key: "return-profile" as ProgramTabKey, label: "Return Profile" }]
    : BASE_TABS;
  return (
    <nav className="flex items-stretch gap-px overflow-x-auto border-b border-zinc-300 bg-zinc-100 px-2">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={`/scenarios/${scenarioId}/programs/${programId}?tab=${t.key}`}
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
