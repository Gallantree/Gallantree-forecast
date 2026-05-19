import Decimal from "decimal.js";
import type { LoanInput } from "./loans";

export type GrowthRiskLevel = "low" | "medium" | "high";
export type ProgramTypeKey = "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER";
export type PropertyStatus = "Stabilised" | "Transitional";

export interface BookGrowthProfile {
  id: string;
  capitalProgramId: string;
  // Program type drives balance distribution and property-status bias:
  //   CRE_CLO  → balance $5m-$55m uniform, ~85% Transitional
  //   CMBS     → program-avg ±15%, ~90% Stabilised
  //   others   → program-avg ±15%, ~70% Stabilised
  programType: ProgramTypeKey;
  accountCode: string;
  fyGrowthPcts: Decimal.Value[];
  avgTenorMonths: number;
  avgSpreadBps: number;
  riskLevel: GrowthRiskLevel;
}

export interface SyntheticLoan extends LoanInput {
  synthetic: true;
  fyIndex: number;
  profileId: string;
  lvr: string;
  dscr: string;
  grade: string;
  score: number;
  propertyStatus: PropertyStatus;
}

// ── Pricing curve (Gallantree Pricing Model V2 / Inputs sheet) ──
// 17 anchors: composite score (0-200) → internal grade + credit spread (bps).
// Piecewise-linear interpolation, spread rounded to nearest 10 bps.
interface PricingAnchor {
  score: number;
  grade: string;
  spread: number;
}
const PRICING_ANCHORS: PricingAnchor[] = [
  { score: 195, grade: "A+", spread: 105 },
  { score: 180, grade: "A", spread: 120 },
  { score: 165, grade: "A", spread: 130 },
  { score: 150, grade: "A-", spread: 150 },
  { score: 135, grade: "A-", spread: 170 },
  { score: 120, grade: "B+", spread: 195 },
  { score: 105, grade: "B", spread: 215 },
  { score: 90, grade: "B-", spread: 235 },
  { score: 80, grade: "C+", spread: 240 },
  { score: 70, grade: "C", spread: 260 },
  { score: 60, grade: "C-", spread: 275 },
  { score: 55, grade: "D+", spread: 285 },
  { score: 50, grade: "D", spread: 295 },
  { score: 45, grade: "D-", spread: 295 },
  { score: 40, grade: "E+", spread: 335 },
  { score: 30, grade: "E", spread: 395 },
  { score: 0, grade: "E-", spread: 425 },
];

/** Pricing curve forward: score → {grade, spread}. */
export function priceFromScore(score: number): { grade: string; spread: number } {
  if (score >= 195) return { grade: "A+", spread: 105 };
  if (score <= 0) return { grade: "E-", spread: 425 };
  for (let i = 0; i < PRICING_ANCHORS.length - 1; i++) {
    const hi = PRICING_ANCHORS[i];
    const lo = PRICING_ANCHORS[i + 1];
    if (score <= hi.score && score >= lo.score) {
      const span = hi.score - lo.score || 1;
      const t = (score - lo.score) / span;
      const rawSpread = lo.spread + t * (hi.spread - lo.spread);
      const grade = score >= (hi.score + lo.score) / 2 ? hi.grade : lo.grade;
      const spread = Math.round(rawSpread / 10) * 10;
      return { grade, spread };
    }
  }
  return { grade: "E-", spread: 425 };
}

/** Pricing curve inverse: target spread bps → approximate composite score. */
export function scoreFromSpread(targetSpread: number): number {
  if (targetSpread <= 105) return 195;
  if (targetSpread >= 425) return 0;
  for (let i = 0; i < PRICING_ANCHORS.length - 1; i++) {
    const hi = PRICING_ANCHORS[i];
    const lo = PRICING_ANCHORS[i + 1];
    if (targetSpread >= hi.spread && targetSpread <= lo.spread) {
      const span = lo.spread - hi.spread || 1;
      const t = (targetSpread - hi.spread) / span;
      return Math.round(hi.score - t * (hi.score - lo.score));
    }
  }
  return 100;
}

// Risk level → score std-dev (controls how tight the loan-quality distribution
// is around the target central score).
const RISK_STD: Record<GrowthRiskLevel, number> = {
  low: 10,
  medium: 20,
  high: 30,
};

// Per-grade-letter collateral profile midpoints (LVR, DSCR). Each synthetic
// loan jitters around these by small amounts.
function gradeProfile(grade: string): { lvr: number; dscr: number } {
  const letter = grade.charAt(0);
  switch (letter) {
    case "A":
      return { lvr: 0.55, dscr: 1.5 };
    case "B":
      return { lvr: 0.62, dscr: 1.35 };
    case "C":
      return { lvr: 0.68, dscr: 1.2 };
    case "D":
      return { lvr: 0.71, dscr: 1.1 };
    default: // E or fail
      return { lvr: 0.74, dscr: 1.0 };
  }
}

// Deterministic FNV-1a hash → uint32 (same as in previous generator).
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Hash → uniform [0,1).
function uniform(seed: number): number {
  return (seed >>> 0) / 0x100000000;
}

// Probability of "Stabilised" property status by program type. CRE CLOs are
// dominantly transitional/value-add deals; CMBS pools are predominantly
// stabilised income-producing assets.
const STABILISED_PROB: Record<ProgramTypeKey, number> = {
  CRE_CLO: 0.15,
  CMBS: 0.9,
  WAREHOUSE: 0.7,
  MIT_FUND: 0.7,
  OTHER: 0.7,
};

function sampleStatus(programType: ProgramTypeKey, seed: number): PropertyStatus {
  return uniform(seed) < STABILISED_PROB[programType]
    ? "Stabilised"
    : "Transitional";
}

// Per-program-type balance distribution. CRE CLO sponsor loans are typically
// $5m-$55m; other programs fall back to the program's actual average balance
// with ±15% jitter so the synthetic loans look like the imported book.
function sampleBalance(
  programType: ProgramTypeKey,
  programAvgBalance: Decimal,
  seed: number,
): Decimal {
  if (programType === "CRE_CLO") {
    const u = uniform(seed);
    const dollars = 5_000_000 + u * (55_000_000 - 5_000_000);
    return new Decimal(dollars);
  }
  const jitter = 1 + 0.15 * triangular(seed);
  return programAvgBalance.times(Math.max(0.1, jitter));
}

// Two uniforms summed → symmetric triangular [-1, 1]. Good-enough bell shape
// without Box-Muller machinery; bounded so we don't sample extreme outliers.
function triangular(seed: number): number {
  const u1 = uniform(seed);
  const u2 = uniform(Math.imul(seed, 2654435761) >>> 0);
  return u1 + u2 - 1;
}

function addMonths(periodKey: string, months: number): string {
  const [y, m] = periodKey.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

interface ProgramBaseline {
  count: number;
  avgBalance: Decimal;
}

function baselineByProgram(existing: LoanInput[]): Map<string, ProgramBaseline> {
  const byProgram = new Map<string, { count: number; total: Decimal }>();
  for (const l of existing) {
    if (!l.capitalProgramId) continue;
    const b = byProgram.get(l.capitalProgramId) ?? {
      count: 0,
      total: new Decimal(0),
    };
    b.count += 1;
    b.total = b.total.plus(new Decimal(l.balance.toString()));
    byProgram.set(l.capitalProgramId, b);
  }
  const out = new Map<string, ProgramBaseline>();
  for (const [id, b] of byProgram) {
    out.set(id, {
      count: b.count,
      avgBalance: b.count > 0 ? b.total.div(b.count) : new Decimal(0),
    });
  }
  return out;
}

export interface FYGroup {
  fy: number;
  months: string[];
}

/**
 * Generate synthetic loans from growth profiles. Each profile targets a
 * capital program; baseline (count + avg balance) is taken from existing loans
 * in that program. Growth compounds year-on-year.
 *
 * Each synthetic loan is RANDOMIZED (deterministically, seeded by
 * scenarioId/profileId/fy/index) along the V2 pricing methodology:
 *   1. Sample a composite score (0-200) from a triangular distribution
 *      centered on the inverse of the profile's avg spread; std-dev set by
 *      risk level (low=10 / med=20 / high=30).
 *   2. Map score → grade + credit spread via the V2 pricing curve.
 *   3. Derive LVR + DSCR from the grade band with small jitter.
 *   4. Jitter tenor (±20%) and balance (±15%) for realism.
 */
export function generateSyntheticLoans(
  profiles: BookGrowthProfile[],
  existingLoans: LoanInput[],
  fyGroups: FYGroup[],
  scenarioSeed: string,
): SyntheticLoan[] {
  const baselines = baselineByProgram(existingLoans);
  const out: SyntheticLoan[] = [];

  for (const profile of profiles) {
    const base = baselines.get(profile.capitalProgramId);
    if (!base || base.count === 0) continue;

    const targetScore = scoreFromSpread(profile.avgSpreadBps);
    const scoreStd = RISK_STD[profile.riskLevel];

    let currentBaseline = base.count;
    for (let k = 0; k < fyGroups.length; k++) {
      const pct = new Decimal(profile.fyGrowthPcts[k] ?? 0);
      if (pct.lte(0)) continue;
      const addedCount = Math.round((currentBaseline * pct.toNumber()) / 100);
      if (addedCount <= 0) continue;
      const months = fyGroups[k].months;
      if (months.length === 0) continue;

      for (let i = 0; i < addedCount; i++) {
        const seed = hash(
          `${scenarioSeed}|${profile.id}|${fyGroups[k].fy}|${i}`,
        );
        // Independent sub-seeds for each randomized field.
        const monthSeed = Math.imul(seed, 0x9e3779b1) >>> 0;
        const scoreSeed = Math.imul(seed, 0x85ebca77) >>> 0;
        const tenorSeed = Math.imul(seed, 0xc2b2ae3d) >>> 0;
        const balSeed = Math.imul(seed, 0x27d4eb2f) >>> 0;
        const lvrSeed = Math.imul(seed, 0x165667b1) >>> 0;
        const dscrSeed = Math.imul(seed, 0xd1b54a32) >>> 0;
        const statusSeed = Math.imul(seed, 0x6a09e667) >>> 0;

        const monthIdx = monthSeed % months.length;
        const origination = months[monthIdx];

        // ── Tenor with ±20% variance, then snap to integer months ──
        const tenorJitter = 1 + 0.2 * triangular(tenorSeed);
        const tenorMonths = Math.max(
          6,
          Math.round(profile.avgTenorMonths * tenorJitter),
        );
        const maturity = addMonths(origination, tenorMonths);

        // ── Score sampled around target; clamped 0-200 ──
        const score = Math.max(
          0,
          Math.min(200, Math.round(targetScore + scoreStd * 2 * triangular(scoreSeed))),
        );
        const { grade, spread } = priceFromScore(score);

        // ── LVR / DSCR derived from grade band ──
        const gradeProf = gradeProfile(grade);
        const lvr = Math.max(
          0.3,
          Math.min(0.85, gradeProf.lvr + 0.04 * triangular(lvrSeed)),
        );
        const dscr = Math.max(
          0.7,
          Math.min(3.0, gradeProf.dscr + 0.1 * triangular(dscrSeed)),
        );

        // ── Balance: per-program-type distribution ──
        const balance = sampleBalance(profile.programType, base.avgBalance, balSeed);

        // ── Property status biased by program type ──
        const propertyStatus = sampleStatus(profile.programType, statusSeed);

        const loanId = `SYN-${profile.capitalProgramId.slice(-6)}-FY${String(fyGroups[k].fy).slice(-2)}-${String(i + 1).padStart(4, "0")}`;

        out.push({
          synthetic: true,
          fyIndex: k,
          profileId: profile.id,
          id: `syn-${profile.id}-${k}-${i}`,
          loanId,
          capitalProgramId: profile.capitalProgramId,
          accountCode: profile.accountCode,
          balance,
          originationPeriodKey: origination,
          maturityPeriodKey: maturity,
          creditSpreadBps: spread,
          score,
          grade,
          lvr: lvr.toFixed(4),
          dscr: dscr.toFixed(2),
          propertyStatus,
        });
      }
      currentBaseline += addedCount;
    }
  }

  return out;
}
