// Server-safe aggregator for the Loan Book Analysis tab.
// Crunches the in-memory LoanRow array into chart-ready series so the client
// component just renders. Pure functions only — no DB calls or imports of
// "use client" modules.

import type { LoanRow, ProgramTypeKey } from "./LoansTab";

export interface BarPoint {
  label: string;
  value: number; // primary metric (count or $)
  value2?: number; // secondary metric for dual-series charts
}

export interface LoanAnalysisData {
  // Headline totals
  loanCount: number;
  totalBalance: number;
  avgBalance: number;
  // 1. Originations by fiscal year — count + $ volume
  originationsByFy: BarPoint[];
  // 2. State breakdown
  countByState: BarPoint[];
  volumeByState: BarPoint[];
  // 3. LVR distribution
  lvrCount: BarPoint[];
  lvrVolume: BarPoint[];
  // 4. DSCR distribution
  dscrCount: BarPoint[];
  // 5. Capital program type mix
  programTypeVolume: BarPoint[];
  // 6. Asset class mix
  assetClassVolume: BarPoint[];
  // 7. Internal grade distribution
  gradeCount: BarPoint[];
  // 8. Origination period (month) — count
  originationsByMonth: BarPoint[];
}

const PROGRAM_TYPE_LABEL: Record<ProgramTypeKey, string> = {
  CRE_CLO: "CRE CLO",
  CMBS: "CMBS",
  WAREHOUSE: "Warehouse",
  MIT_FUND: "MIT Fund",
  OTHER: "Other",
};

// Australian fiscal-year for a given origination date (Jul = start of FY).
function fyOf(d: Date): number {
  const m = d.getUTCMonth() + 1; // 1-12
  const y = d.getUTCFullYear();
  return m >= 7 ? y + 1 : y;
}

function toMonthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function bucketLvr(lvr: number): string {
  if (lvr < 0.5) return "<50%";
  if (lvr < 0.55) return "50-55%";
  if (lvr < 0.6) return "55-60%";
  if (lvr < 0.65) return "60-65%";
  if (lvr < 0.7) return "65-70%";
  if (lvr < 0.75) return "70-75%";
  return "75%+";
}
const LVR_ORDER = ["<50%", "50-55%", "55-60%", "60-65%", "65-70%", "70-75%", "75%+"];

function bucketDscr(d: number): string {
  if (d < 1.0) return "<1.00x";
  if (d < 1.15) return "1.00-1.15x";
  if (d < 1.25) return "1.15-1.25x";
  if (d < 1.4) return "1.25-1.40x";
  if (d < 1.6) return "1.40-1.60x";
  return "1.60x+";
}
const DSCR_ORDER = ["<1.00x", "1.00-1.15x", "1.15-1.25x", "1.25-1.40x", "1.40-1.60x", "1.60x+"];

// Gallantree's 15-tier internal grade scale, ordered best → worst.
const GRADE_ORDER = [
  "A+",
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C+",
  "C",
  "C-",
  "D+",
  "D",
  "D-",
  "E+",
  "E",
  "E-",
];

function ordered<T extends string>(map: Map<T, BarPoint>, order: readonly T[]): BarPoint[] {
  return order.map((k) => map.get(k)).filter((b): b is BarPoint => Boolean(b));
}

export function buildLoanAnalysisData(loans: LoanRow[]): LoanAnalysisData {
  const included = loans.filter((l) => l.includeInRevenue !== false);

  // ── Totals ────────────────────────────────────────────────────────────────
  let totalBalance = 0;
  for (const l of included) totalBalance += Number(l.balance.toString());
  const loanCount = included.length;
  const avgBalance = loanCount > 0 ? totalBalance / loanCount : 0;

  // ── 1. Originations by FY (count + $ volume) ──────────────────────────────
  const byFy = new Map<number, { count: number; volume: number }>();
  for (const l of included) {
    const orig =
      typeof l.originationDate === "string" ? new Date(l.originationDate) : l.originationDate;
    if (!(orig instanceof Date) || Number.isNaN(orig.getTime())) continue;
    const fy = fyOf(orig);
    const bal = Number(l.balance.toString());
    const b = byFy.get(fy) ?? { count: 0, volume: 0 };
    b.count += 1;
    b.volume += bal;
    byFy.set(fy, b);
  }
  const originationsByFy: BarPoint[] = Array.from(byFy.entries())
    .sort(([a], [b]) => a - b)
    .map(([fy, b]) => ({
      label: `CY${String(fy).slice(-2)}`,
      value: b.volume,
      value2: b.count,
    }));

  // ── 2. State count + $ volume ─────────────────────────────────────────────
  const byState = new Map<string, { count: number; volume: number }>();
  for (const l of included) {
    const st = (l.state ?? "—").toString().toUpperCase();
    const b = byState.get(st) ?? { count: 0, volume: 0 };
    b.count += 1;
    b.volume += Number(l.balance.toString());
    byState.set(st, b);
  }
  const stateRows = Array.from(byState.entries()).sort(([, a], [, b]) => b.count - a.count);
  const countByState: BarPoint[] = stateRows.map(([s, b]) => ({
    label: s,
    value: b.count,
  }));
  const volumeByState: BarPoint[] = stateRows.map(([s, b]) => ({
    label: s,
    value: b.volume,
  }));

  // ── 3. LVR distribution ───────────────────────────────────────────────────
  const lvrCountMap = new Map<string, BarPoint>();
  const lvrVolumeMap = new Map<string, BarPoint>();
  for (const bucket of LVR_ORDER) {
    lvrCountMap.set(bucket, { label: bucket, value: 0 });
    lvrVolumeMap.set(bucket, { label: bucket, value: 0 });
  }
  for (const l of included) {
    if (!l.lvr) continue;
    const lvr = Number(l.lvr.toString());
    if (!Number.isFinite(lvr) || lvr <= 0) continue;
    const bucket = bucketLvr(lvr);
    const c = lvrCountMap.get(bucket)!;
    const v = lvrVolumeMap.get(bucket)!;
    c.value += 1;
    v.value += Number(l.balance.toString());
  }
  const lvrCount = ordered(lvrCountMap, LVR_ORDER);
  const lvrVolume = ordered(lvrVolumeMap, LVR_ORDER);

  // ── 4. DSCR distribution ──────────────────────────────────────────────────
  const dscrCountMap = new Map<string, BarPoint>();
  for (const bucket of DSCR_ORDER) {
    dscrCountMap.set(bucket, { label: bucket, value: 0 });
  }
  for (const l of included) {
    if (!l.dscr) continue;
    const dscr = Number(l.dscr.toString());
    if (!Number.isFinite(dscr) || dscr <= 0) continue;
    const bucket = bucketDscr(dscr);
    dscrCountMap.get(bucket)!.value += 1;
  }
  const dscrCount = ordered(dscrCountMap, DSCR_ORDER);

  // ── 5. Capital program type mix ───────────────────────────────────────────
  const byProgramType = new Map<ProgramTypeKey, BarPoint>();
  for (const l of included) {
    const t: ProgramTypeKey = l.programType ?? "OTHER";
    const cur = byProgramType.get(t) ?? { label: PROGRAM_TYPE_LABEL[t], value: 0 };
    cur.value += Number(l.balance.toString());
    byProgramType.set(t, cur);
  }
  const programTypeVolume = Array.from(byProgramType.values()).sort((a, b) => b.value - a.value);

  // ── 6. Asset class mix ($ volume) ─────────────────────────────────────────
  const byAsset = new Map<string, BarPoint>();
  for (const l of included) {
    const cls = (l.assetClass ?? "—").toString();
    const cur = byAsset.get(cls) ?? { label: cls, value: 0 };
    cur.value += Number(l.balance.toString());
    byAsset.set(cls, cur);
  }
  const assetClassVolume = Array.from(byAsset.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // ── 7. Internal grade distribution (count) ────────────────────────────────
  const gradeMap = new Map<string, BarPoint>();
  for (const g of GRADE_ORDER) gradeMap.set(g, { label: g, value: 0 });
  for (const l of included) {
    const g = (l.internalGrade ?? "").toString();
    if (gradeMap.has(g)) gradeMap.get(g)!.value += 1;
  }
  const gradeCount = ordered(gradeMap, GRADE_ORDER).filter((b) => b.value > 0);

  // ── 8. Origination by month ───────────────────────────────────────────────
  const byMonth = new Map<string, BarPoint>();
  for (const l of included) {
    const orig =
      typeof l.originationDate === "string" ? new Date(l.originationDate) : l.originationDate;
    if (!(orig instanceof Date) || Number.isNaN(orig.getTime())) continue;
    const key = toMonthKey(orig);
    const cur = byMonth.get(key) ?? { label: key, value: 0 };
    cur.value += 1;
    byMonth.set(key, cur);
  }
  const originationsByMonth = Array.from(byMonth.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  return {
    loanCount,
    totalBalance,
    avgBalance,
    originationsByFy,
    countByState,
    volumeByState,
    lvrCount,
    lvrVolume,
    dscrCount,
    programTypeVolume,
    assetClassVolume,
    gradeCount,
    originationsByMonth,
  };
}
