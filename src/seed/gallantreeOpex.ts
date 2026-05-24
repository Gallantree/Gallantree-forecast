// Deterministic OPEX-driver seed for a Gallantree scenario.
//
// Growth rates are stored as monthly-compounded % (the engine's convention
// via `compoundedMonthly`). Conversions used below:
//   • CPI 3 % p.a.        → ((1.03)^(1/12) − 1) × 100  ≈ 0.2466 %/mo
//   • 5 % per quarter     → ((1.05)^(1/3)  − 1) × 100  ≈ 1.6396 %/mo
//   • 8 % per quarter     → ((1.08)^(1/3)  − 1) × 100  ≈ 2.6008 %/mo
//
// We round to 4 dp on growth so the driver list stays readable.
//
// Note: Software licensing uses opex_per_fte (cost scales with the live
// headcount) AND monthlyGrowthPct (price growth on the per-FTE rate). The
// engine supports both since the small extension landed alongside this
// seed — see `projectOpexPerFte`.

import type { DriverType } from "@/models/driver.model";

export interface GallantreeOpexSeed {
  name: string;
  accountCode: string;
  type: DriverType;
  startPeriodKey: string;
  endPeriodKey?: string;
  // opex_fixed
  baseMonthly?: number;
  monthlyGrowthPct?: number;
  // opex_per_fte
  costPerFteMonthly?: number;
  // one_off
  amount?: number;
  periodKey?: string;
  rationale: string;
}

const CPI_3_PCT_PA_MONTHLY = 0.2466;
const PCT_5_PER_QUARTER_MONTHLY = 1.6396;
const PCT_8_PER_QUARTER_MONTHLY = 2.6008;

export const GALLANTREE_OPEX_SEED: GallantreeOpexSeed[] = [
  // ── 6200 Rent & occupancy ────────────────────────────────────────────────
  {
    name: "Office rent",
    accountCode: "6200",
    type: "opex_fixed",
    startPeriodKey: "2026-01",
    baseMonthly: 12_000,
    monthlyGrowthPct: CPI_3_PCT_PA_MONTHLY,
    rationale: "$12,000/mo with 3% p.a. CPI escalation.",
  },
  {
    name: "Utilities",
    accountCode: "6200",
    type: "opex_fixed",
    startPeriodKey: "2026-01",
    baseMonthly: 400,
    monthlyGrowthPct: 0,
    rationale: "$400/mo flat — no growth specified.",
  },

  // ── 6900 Other operating expenses (Insurance + Travel) ──────────────────
  {
    name: "Insurance — Professional Indemnity",
    accountCode: "6900",
    type: "opex_fixed",
    startPeriodKey: "2026-01",
    baseMonthly: 500,
    monthlyGrowthPct: 0,
    rationale: "P&I cover at $500/mo (no CoA insurance code; booked to 6900).",
  },
  {
    name: "Insurance — D&O",
    accountCode: "6900",
    type: "opex_fixed",
    startPeriodKey: "2026-01",
    baseMonthly: 1_200,
    monthlyGrowthPct: 0,
    rationale: "Directors & Officers cover at $1,200/mo.",
  },
  {
    name: "Travel (Jan–Mar 2026)",
    accountCode: "6900",
    type: "opex_fixed",
    startPeriodKey: "2026-01",
    endPeriodKey: "2026-03",
    baseMonthly: 1_200,
    monthlyGrowthPct: 0,
    rationale: "$1,200/mo for the first quarter only — pre-ramp travel budget.",
  },
  {
    name: "Travel (Apr 2026 onward)",
    accountCode: "6900",
    type: "opex_fixed",
    startPeriodKey: "2026-04",
    baseMonthly: 3_000,
    monthlyGrowthPct: PCT_8_PER_QUARTER_MONTHLY,
    rationale: "Steps up to $3,000/mo from Apr 2026; 8%/quarter growth.",
  },

  // ── 6300 Software & subscriptions ───────────────────────────────────────
  {
    name: "Software licensing (per FTE)",
    accountCode: "6300",
    type: "opex_per_fte",
    startPeriodKey: "2026-01",
    costPerFteMonthly: 800,
    monthlyGrowthPct: PCT_5_PER_QUARTER_MONTHLY,
    rationale: "$800/FTE/mo; auto-scales with live headcount; 5%/quarter vendor escalation.",
  },
  {
    name: "Hosting",
    accountCode: "6300",
    type: "opex_fixed",
    startPeriodKey: "2026-01",
    baseMonthly: 1_800,
    monthlyGrowthPct: 0,
    rationale: "Cloud hosting at $1,800/mo.",
  },
  {
    name: "Claude & AI",
    accountCode: "6300",
    type: "opex_fixed",
    startPeriodKey: "2026-01",
    baseMonthly: 2_000,
    monthlyGrowthPct: 0,
    rationale: "Claude / AI subscriptions at $2,000/mo (Pro + team seats).",
  },
  {
    name: "AI tokens",
    accountCode: "6300",
    type: "opex_fixed",
    startPeriodKey: "2026-04",
    baseMonthly: 200,
    monthlyGrowthPct: PCT_5_PER_QUARTER_MONTHLY,
    rationale: "API token spend, starting Apr 2026 at $200/mo; 5%/quarter growth.",
  },
  {
    name: "Mailchimp",
    accountCode: "6300",
    type: "opex_fixed",
    startPeriodKey: "2026-01",
    baseMonthly: 50,
    monthlyGrowthPct: 0,
    rationale: "Mailchimp subscription at $50/mo.",
  },

  // ── 6400 Professional fees ──────────────────────────────────────────────
  {
    name: "Credit checks",
    accountCode: "6400",
    type: "opex_fixed",
    startPeriodKey: "2026-01",
    baseMonthly: 1_800,
    monthlyGrowthPct: 0,
    rationale: "Credit-bureau / KYC checks at $1,800/mo.",
  },
  {
    name: "Accounting",
    accountCode: "6400",
    type: "opex_fixed",
    startPeriodKey: "2026-01",
    baseMonthly: 500,
    monthlyGrowthPct: 0,
    rationale: "External accounting / bookkeeping at $500/mo.",
  },
  {
    name: "Legal",
    accountCode: "6400",
    type: "opex_fixed",
    startPeriodKey: "2026-01",
    baseMonthly: 800,
    monthlyGrowthPct: 0,
    rationale: "External legal counsel retainer at $800/mo.",
  },
  // Audit — one-off per year every September across the 5-year horizon.
  // Modelled as five `one_off` drivers because the driver model doesn't
  // have a native "annual recurring" type.
  ...[2026, 2027, 2028, 2029, 2030].map<GallantreeOpexSeed>((year) => ({
    name: `Audit — ${year}`,
    accountCode: "6400",
    type: "one_off",
    startPeriodKey: `${year}-09`,
    amount: 36_000,
    periodKey: `${year}-09`,
    rationale: `$36k annual external audit, booked in Sep ${year}.`,
  })),
];
