// Server-safe aggregator for the Capital Programs Analysis modal.
// Pure functions; no imports of "use client" modules.

import { fiscalYearOf } from "@/constants/periods";
import type { ProgramAggregate, ProgramRow } from "./ProgramsTab";

export interface BarPoint {
  label: string;
  value: number;
  value2?: number;
}

export interface ProgramAnalysisData {
  // Headline totals
  programCount: number;
  totalDealSize: number;
  totalAnnualInterest: number;
  totalLoanBalance: number;
  // Year-on-year: cumulative active deal size + count active in each FY
  activeByFy: BarPoint[];
  // New deal volume launched in each FY
  newDealsByFy: BarPoint[];
  // Type breakdown — count and $
  countByType: BarPoint[];
  dealSizeByType: BarPoint[];
  // Per-program comparators (top-10 by dealSize)
  annualInterestByProgram: BarPoint[];
  nimBpsByProgram: BarPoint[];
  // Grouped bars: Assets WAS vs Liabilities WAS per program
  wasComparison: Array<{ label: string; assetsWas: number; liabsWas: number }>;
  // Fees
  totalAnnualFees: number;
  feesByCategory: BarPoint[]; // $ per category
  feesByProgram: BarPoint[]; // top-10 $ per program
  // Liabilities
  totalTranchePrincipal: number;
  totalAnnualInterestByTranche: number;
  trancheRateMix: BarPoint[]; // fixed vs variable $
  liabsWasByProgram: BarPoint[]; // top-10 bps
  trancheBySpreadBucket: BarPoint[]; // # tranches per spread band
  // Upfront issuance costs
  totalUpfrontFees: number;
  upfrontFeesByCategory: BarPoint[]; // $ per category (underwriter / legal / ratings / other)
}

const UPFRONT_CATEGORY_LABEL: Record<string, string> = {
  underwriter: "Credit underwriter",
  legal: "Legal",
  credit_rating: "Credit ratings",
  other: "Other",
};

const FEE_CATEGORY_LABEL: Record<string, string> = {
  senior_mgmt: "Senior mgmt",
  subordinate_mgmt: "Sub mgmt",
  servicing: "Servicing",
  trustee: "Trustee fees",
  other: "Other",
};

const SPREAD_BUCKETS: Array<{ label: string; max: number }> = [
  { label: "<100 bps", max: 100 },
  { label: "100-150", max: 150 },
  { label: "150-200", max: 200 },
  { label: "200-300", max: 300 },
  { label: "300-500", max: 500 },
  { label: "500+", max: Infinity },
];

function spreadBucket(bps: number): string {
  for (const b of SPREAD_BUCKETS) if (bps < b.max) return b.label;
  return SPREAD_BUCKETS[SPREAD_BUCKETS.length - 1].label;
}

const PROGRAM_TYPE_LABEL: Record<string, string> = {
  CRE_CLO: "CRE CLO",
  CMBS: "CMBS",
  WAREHOUSE: "Warehouse",
  MIT_FUND: "MIT Fund",
  OTHER: "Other",
};

function periodKeyToFy(key?: string): number | null {
  if (!key) return null;
  const [y, m] = key.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return fiscalYearOf(y, m);
}

function programPrincipal(p: ProgramRow): number {
  const dealSize = p.dealSize ? Number(p.dealSize.toString()) : 0;
  return Number.isFinite(dealSize) ? dealSize : 0;
}

function programInterest(p: ProgramRow, baseRateBps: number): number {
  const face = p.faceValuePerNote ? Number(p.faceValuePerNote.toString()) : 0;
  if (face <= 0) return 0;
  let annual = 0;
  for (const l of p.liabilities ?? []) {
    const notes = l.numNotes ?? 0;
    if (notes <= 0 || l.returnProfileBps <= 0) continue;
    const principal = notes * face;
    const allInBps =
      l.rateType === "variable" ? baseRateBps + l.returnProfileBps : l.returnProfileBps;
    annual += (principal * allInBps) / 10000;
  }
  return annual;
}

function trimName(name: string, max = 22): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

export function buildProgramAnalysisData(
  programs: ProgramRow[],
  aggregates: Record<string, ProgramAggregate>,
  baseRateBps: number,
  fys: number[],
): ProgramAnalysisData {
  // ── Per-program derived metrics ───────────────────────────────────────────
  type Enriched = {
    id: string;
    name: string;
    type: string;
    dealSize: number;
    startFy: number | null;
    endFy: number | null;
    annualInterest: number;
    loanBalance: number;
    assetsWas: number;
    liabsWas: number;
    nimBps: number;
  };
  const enriched: Enriched[] = programs.map((p) => {
    const agg = aggregates[p._id];
    const loanBalance = agg?.totalBalance ?? 0;
    const assetsWas =
      agg && agg.weightBalanceForSpread > 0
        ? Math.round(agg.weightSumSpreadBps / agg.weightBalanceForSpread)
        : 0;
    const liabsWas = agg?.fundingWasBps ?? 0;
    return {
      id: p._id,
      name: p.name,
      type: p.type,
      dealSize: programPrincipal(p),
      startFy: periodKeyToFy(p.startPeriodKey),
      endFy: periodKeyToFy(p.endPeriodKey),
      annualInterest: programInterest(p, baseRateBps),
      loanBalance,
      assetsWas,
      liabsWas,
      nimBps: assetsWas - liabsWas,
    };
  });

  const programCount = enriched.length;
  const totalDealSize = enriched.reduce((a, e) => a + e.dealSize, 0);
  const totalAnnualInterest = enriched.reduce((a, e) => a + e.annualInterest, 0);
  const totalLoanBalance = enriched.reduce((a, e) => a + e.loanBalance, 0);

  // ── Active-by-FY: sum dealSize of programs whose start ≤ FY ≤ end ─────────
  const activeByFy: BarPoint[] = fys.map((fy) => {
    let principal = 0;
    let count = 0;
    for (const e of enriched) {
      if (e.startFy == null || e.startFy > fy) continue;
      if (e.endFy != null && e.endFy < fy) continue;
      principal += e.dealSize;
      count += 1;
    }
    return {
      label: `CY${String(fy).slice(-2)}`,
      value: principal,
      value2: count,
    };
  });

  // ── New deals launched by FY ──────────────────────────────────────────────
  const newDealsByFy: BarPoint[] = fys.map((fy) => {
    let principal = 0;
    let count = 0;
    for (const e of enriched) {
      if (e.startFy === fy) {
        principal += e.dealSize;
        count += 1;
      }
    }
    return {
      label: `CY${String(fy).slice(-2)}`,
      value: principal,
      value2: count,
    };
  });

  // ── Type breakdown ────────────────────────────────────────────────────────
  const typeMap = new Map<string, { count: number; size: number }>();
  for (const e of enriched) {
    const bucket = typeMap.get(e.type) ?? { count: 0, size: 0 };
    bucket.count += 1;
    bucket.size += e.dealSize;
    typeMap.set(e.type, bucket);
  }
  const countByType: BarPoint[] = Array.from(typeMap.entries())
    .map(([k, b]) => ({ label: PROGRAM_TYPE_LABEL[k] ?? k, value: b.count }))
    .sort((a, b) => b.value - a.value);
  const dealSizeByType: BarPoint[] = Array.from(typeMap.entries())
    .map(([k, b]) => ({ label: PROGRAM_TYPE_LABEL[k] ?? k, value: b.size }))
    .sort((a, b) => b.value - a.value);

  // ── Top-10 per-program comparators ────────────────────────────────────────
  const top = [...enriched].sort((a, b) => b.dealSize - a.dealSize).slice(0, 10);
  const annualInterestByProgram: BarPoint[] = top.map((e) => ({
    label: trimName(e.name),
    value: e.annualInterest,
  }));
  const nimBpsByProgram: BarPoint[] = top.map((e) => ({
    label: trimName(e.name),
    value: e.nimBps,
  }));
  const wasComparison = top.map((e) => ({
    label: trimName(e.name),
    assetsWas: e.assetsWas,
    liabsWas: e.liabsWas,
  }));

  // ── Fees ──────────────────────────────────────────────────────────────────
  const feeCatMap = new Map<string, number>();
  const feePerProgram: Array<{ name: string; total: number }> = [];
  let totalAnnualFees = 0;
  for (const p of programs) {
    let progTotal = 0;
    for (const f of p.fees ?? []) {
      const basis = f.basisAmount ? Number(f.basisAmount.toString()) : 0;
      const annual = (basis * (f.feeBps ?? 0)) / 10000;
      if (!Number.isFinite(annual) || annual <= 0) continue;
      feeCatMap.set(f.category, (feeCatMap.get(f.category) ?? 0) + annual);
      progTotal += annual;
      totalAnnualFees += annual;
    }
    if (progTotal > 0) feePerProgram.push({ name: p.name, total: progTotal });
  }
  const feesByCategory: BarPoint[] = Array.from(feeCatMap.entries())
    .map(([k, v]) => ({ label: FEE_CATEGORY_LABEL[k] ?? k, value: v }))
    .sort((a, b) => b.value - a.value);
  const feesByProgram: BarPoint[] = feePerProgram
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((p) => ({ label: trimName(p.name), value: p.total }));

  // ── Liabilities ───────────────────────────────────────────────────────────
  let totalTranchePrincipal = 0;
  let totalAnnualInterestByTranche = 0;
  let fixedPrincipal = 0;
  let variablePrincipal = 0;
  const spreadBucketMap = new Map<string, number>();
  for (const b of SPREAD_BUCKETS) spreadBucketMap.set(b.label, 0);
  const liabsWasArr: Array<{ name: string; bps: number }> = [];

  for (const e of enriched) {
    if (e.liabsWas > 0) liabsWasArr.push({ name: e.name, bps: e.liabsWas });
  }
  for (const p of programs) {
    const face = p.faceValuePerNote ? Number(p.faceValuePerNote.toString()) : 0;
    if (face <= 0) continue;
    for (const l of p.liabilities ?? []) {
      const notes = l.numNotes ?? 0;
      if (notes <= 0) continue;
      const principal = notes * face;
      const allInBps =
        l.rateType === "variable"
          ? baseRateBps + (l.returnProfileBps ?? 0)
          : (l.returnProfileBps ?? 0);
      totalTranchePrincipal += principal;
      totalAnnualInterestByTranche += (principal * allInBps) / 10000;
      if (l.rateType === "variable") variablePrincipal += principal;
      else fixedPrincipal += principal;
      if (l.returnProfileBps > 0) {
        const bucket = spreadBucket(l.returnProfileBps);
        spreadBucketMap.set(bucket, (spreadBucketMap.get(bucket) ?? 0) + 1);
      }
    }
  }
  const trancheRateMix: BarPoint[] = [
    { label: "Variable + base", value: variablePrincipal },
    { label: "Fixed", value: fixedPrincipal },
  ].filter((b) => b.value > 0);
  const liabsWasByProgram: BarPoint[] = liabsWasArr
    .sort((a, b) => b.bps - a.bps)
    .slice(0, 10)
    .map((p) => ({ label: trimName(p.name), value: p.bps }));
  const trancheBySpreadBucket: BarPoint[] = SPREAD_BUCKETS.map((b) => ({
    label: b.label,
    value: spreadBucketMap.get(b.label) ?? 0,
  })).filter((b) => b.value > 0);

  // ── Upfront issuance costs ────────────────────────────────────────────────
  const upfrontCatMap = new Map<string, number>();
  let totalUpfrontFees = 0;
  for (const p of programs) {
    type Upfront = { category: string; amount: { toString: () => string } };
    const uf = (p as unknown as { upfrontFees?: Upfront[] }).upfrontFees ?? [];
    for (const u of uf) {
      const amt = Number(u.amount.toString());
      if (!Number.isFinite(amt) || amt <= 0) continue;
      upfrontCatMap.set(u.category, (upfrontCatMap.get(u.category) ?? 0) + amt);
      totalUpfrontFees += amt;
    }
  }
  const upfrontFeesByCategory: BarPoint[] = Array.from(upfrontCatMap.entries())
    .map(([k, v]) => ({ label: UPFRONT_CATEGORY_LABEL[k] ?? k, value: v }))
    .sort((a, b) => b.value - a.value);

  return {
    programCount,
    totalDealSize,
    totalAnnualInterest,
    totalLoanBalance,
    activeByFy,
    newDealsByFy,
    countByType,
    dealSizeByType,
    annualInterestByProgram,
    nimBpsByProgram,
    wasComparison,
    totalAnnualFees,
    feesByCategory,
    feesByProgram,
    totalTranchePrincipal,
    totalAnnualInterestByTranche,
    trancheRateMix,
    liabsWasByProgram,
    trancheBySpreadBucket,
    totalUpfrontFees,
    upfrontFeesByCategory,
  };
}
