// Server-safe aggregator for the MIT Fund "Return Profile" tab.
// Projects per-FY cash-on-cash yield for each equity tranche the fund holds in
// other capital programs, rolls them up to a fund-level series, and emits the
// benchmark lines (scenario base rate + fund's own unit-class spread).

import { buildScenarioPeriods } from "@/constants/periods";
import { programBalanceFactor } from "@/engine/programFactor";
import {
  annualFeeAmount,
  equityReturnPct,
  grossCollectionsAllIn,
  trancheAnnualInterest,
} from "@/engine/waterfall";
import { isFundingTranche, type ProgramRow } from "../../../_components/ProgramsTab";

export interface UnderlyingProgramSnapshot {
  program: ProgramRow;
  // Aggregated loan-book metrics for the underlying program at steady state.
  totalBalance: number;
  // Balance-weighted asset spread (credit, ex base) for the underlying loans.
  // 0 when the underlying program has no loans booked.
  assetWasBps: number;
}

export interface ReturnProfileFyPoint {
  label: string;
  fyIndex: number;
  // Held equity principal active in this FY (may ramp/amortise).
  heldPrincipal: number;
  // Residual cashflow accruing to the fund's held tranches during the FY.
  fundResidualAnnual: number;
  // % p.a. cash-on-cash. null when nothing is active in the FY.
  fundYieldPct: number | null;
  // Benchmark lines (constant across FY, repeated for chart convenience).
  baseRatePct: number;
  targetRatePct: number;
}

export interface ReturnProfileHoldingFyPoint {
  label: string;
  fyIndex: number;
  tranchePrincipal: number;
  residualAnnual: number;
  yieldPct: number | null;
}

export interface ReturnProfileHolding {
  programId: string;
  programName: string;
  programType: ProgramRow["type"];
  trancheName: string;
  trancheNumNotes: number;
  tranchePrincipalAtFull: number;
  steadyStateYieldPct: number | null;
  steadyStateResidualAnnual: number;
  byFy: ReturnProfileHoldingFyPoint[];
  // Surfaces the reason an underlying program contributes nothing — useful
  // for the UI's empty-state notes.
  warning?: "no-loans" | "tranche-missing" | "no-equity-tranche";
}

export interface ReturnProfileData {
  empty: boolean;
  emptyReason?: "not-mit-fund" | "no-holdings" | "no-underlying-data";
  baseRateBps: number;
  baseRatePct: number;
  // The fund's own equity-tranche spread (target spread over base).
  targetSpreadBps: number;
  targetRatePct: number;
  totalHeldEquityPrincipalAtFull: number;
  steadyStateFundYieldPct: number | null;
  byFy: ReturnProfileFyPoint[];
  holdings: ReturnProfileHolding[];
}

function fyLabel(year: number): string {
  return `FY${year}`;
}

// Resolve the fund's target spread = bps of the fund's own equity / unit-class
// tranche. Defaults to the highest-spread fixed tranche if no equity-named
// tranche is present (covers MIT funds modelled as a single unit class).
function resolveTargetSpreadBps(fund: ProgramRow): number {
  const liabilities = fund.liabilities ?? [];
  if (liabilities.length === 0) return 0;
  const equityLikeName = (l: { name?: string; returnProfileBps: number }) =>
    !isFundingTranche(l.name, l.returnProfileBps);
  const equity = liabilities.find(equityLikeName);
  if (equity) return equity.returnProfileBps;
  return liabilities.reduce((m, l) => Math.max(m, l.returnProfileBps), 0);
}

/**
 * Per-FY balance factor for a program — averages programBalanceFactor across
 * the 12 months of the FY, so a tranche that ramps in mid-year correctly
 * shows a partial yield in its first FY.
 */
function avgBalanceFactorForFy(periodKeysInFy: string[], program: ProgramRow): number {
  if (periodKeysInFy.length === 0) return 0;
  const profile = {
    startPeriodKey: program.startPeriodKey,
    endPeriodKey: program.endPeriodKey,
    rampUpMonths: program.rampUpMonths,
    amortisationMonths: program.amortisationMonths,
  };
  let sum = 0;
  for (const pk of periodKeysInFy) {
    sum += Number(programBalanceFactor(pk, profile).toString());
  }
  return sum / periodKeysInFy.length;
}

export function buildReturnProfileData(opts: {
  fund: ProgramRow;
  underlying: UnderlyingProgramSnapshot[];
  baseRateBps: number;
  firstYearLabel: number;
  horizonMonths?: number;
}): ReturnProfileData {
  const { fund, underlying, baseRateBps, firstYearLabel, horizonMonths = 60 } = opts;

  const baseRatePct = baseRateBps / 100;
  const targetSpreadBps = resolveTargetSpreadBps(fund);
  const targetRatePct = (baseRateBps + targetSpreadBps) / 100;

  const empty = (reason: ReturnProfileData["emptyReason"]): ReturnProfileData => ({
    empty: true,
    emptyReason: reason,
    baseRateBps,
    baseRatePct,
    targetSpreadBps,
    targetRatePct,
    totalHeldEquityPrincipalAtFull: 0,
    steadyStateFundYieldPct: null,
    byFy: [],
    holdings: [],
  });

  if (fund.type !== "MIT_FUND") return empty("not-mit-fund");
  const holdingsRefs = fund.captiveEquityHoldings ?? [];
  if (holdingsRefs.length === 0) return empty("no-holdings");

  // FY grouping over the scenario horizon.
  const periods = buildScenarioPeriods(firstYearLabel, horizonMonths);
  const fyGroups = new Map<number, string[]>();
  const fyOrder: number[] = [];
  for (const p of periods) {
    if (!fyGroups.has(p.fiscalYear)) {
      fyGroups.set(p.fiscalYear, []);
      fyOrder.push(p.fiscalYear);
    }
    fyGroups.get(p.fiscalYear)!.push(p.key);
  }

  const underlyingById = new Map<string, UnderlyingProgramSnapshot>();
  for (const u of underlying) underlyingById.set(u.program._id, u);

  const holdings: ReturnProfileHolding[] = [];

  for (const ref of holdingsRefs) {
    const snap = underlyingById.get(ref.programId);
    if (!snap) {
      // Underlying program no longer exists / not loaded — record an empty
      // holding so the UI can flag it.
      holdings.push({
        programId: ref.programId,
        programName: "(missing program)",
        programType: "OTHER",
        trancheName: ref.trancheName,
        trancheNumNotes: 0,
        tranchePrincipalAtFull: 0,
        steadyStateYieldPct: null,
        steadyStateResidualAnnual: 0,
        byFy: [],
        warning: "no-equity-tranche",
      });
      continue;
    }
    const { program, totalBalance, assetWasBps } = snap;
    const faceValuePerNote = Number(program.faceValuePerNote?.toString() ?? "0");
    const liabilities = program.liabilities ?? [];
    const tranche = liabilities.find((l) => l.name === ref.trancheName);
    if (!tranche) {
      holdings.push({
        programId: ref.programId,
        programName: program.name,
        programType: program.type,
        trancheName: ref.trancheName,
        trancheNumNotes: 0,
        tranchePrincipalAtFull: 0,
        steadyStateYieldPct: null,
        steadyStateResidualAnnual: 0,
        byFy: [],
        warning: "tranche-missing",
      });
      continue;
    }

    const tranchePrincipalAtFull = (tranche.numNotes ?? 0) * faceValuePerNote;
    // Total equity principal across the underlying program — residual is
    // distributed pro-rata across all equity tranches.
    const allEquityPrincipal = liabilities
      .filter((l) => !isFundingTranche(l.name, l.returnProfileBps))
      .reduce((acc, l) => acc + (l.numNotes ?? 0) * faceValuePerNote, 0);
    const trancheShare = allEquityPrincipal > 0 ? tranchePrincipalAtFull / allEquityPrincipal : 0;

    // Steady-state waterfall components for the underlying program at full
    // deal balance (factor = 1).
    const grossFull = grossCollectionsAllIn(totalBalance, assetWasBps, baseRateBps);
    const feesFull = program.fees.reduce(
      (acc, f) => acc + annualFeeAmount(Number(f.basisAmount.toString()), f.feeBps),
      0,
    );
    const debtInterestFull = liabilities
      .filter((l) => isFundingTranche(l.name, l.returnProfileBps))
      .reduce(
        (acc, l) =>
          acc +
          trancheAnnualInterest(
            l.numNotes ?? 0,
            faceValuePerNote,
            l.returnProfileBps,
            l.rateType,
            baseRateBps,
          ),
        0,
      );
    const residualFull = grossFull - feesFull - debtInterestFull;
    const trancheResidualFull = residualFull * trancheShare;
    const steadyStateYieldPct = equityReturnPct(trancheResidualFull, tranchePrincipalAtFull);

    const byFy: ReturnProfileHoldingFyPoint[] = [];
    for (const fy of fyOrder) {
      const months = fyGroups.get(fy)!;
      const factor = avgBalanceFactorForFy(months, program);
      const tranchePrincipal = tranchePrincipalAtFull * factor;
      const residualAnnual = trancheResidualFull * factor;
      const yieldPct = equityReturnPct(residualAnnual, tranchePrincipal);
      byFy.push({
        label: fyLabel(fy),
        fyIndex: fy,
        tranchePrincipal,
        residualAnnual,
        yieldPct,
      });
    }

    holdings.push({
      programId: ref.programId,
      programName: program.name,
      programType: program.type,
      trancheName: ref.trancheName,
      trancheNumNotes: tranche.numNotes ?? 0,
      tranchePrincipalAtFull,
      steadyStateYieldPct,
      steadyStateResidualAnnual: trancheResidualFull,
      byFy,
      warning:
        totalBalance === 0
          ? "no-loans"
          : allEquityPrincipal === 0
            ? "no-equity-tranche"
            : undefined,
    });
  }

  const totalHeldEquityPrincipalAtFull = holdings.reduce(
    (acc, h) => acc + h.tranchePrincipalAtFull,
    0,
  );

  if (totalHeldEquityPrincipalAtFull === 0) {
    return {
      empty: true,
      emptyReason: "no-underlying-data",
      baseRateBps,
      baseRatePct,
      targetSpreadBps,
      targetRatePct,
      totalHeldEquityPrincipalAtFull: 0,
      steadyStateFundYieldPct: null,
      byFy: [],
      holdings,
    };
  }

  // Fund-level series: weighted across all holdings per FY.
  const byFy: ReturnProfileFyPoint[] = fyOrder.map((fy, idx) => {
    let heldPrincipal = 0;
    let residualAnnual = 0;
    for (const h of holdings) {
      const point = h.byFy[idx];
      if (!point) continue;
      heldPrincipal += point.tranchePrincipal;
      residualAnnual += point.residualAnnual;
    }
    const fundYieldPct = equityReturnPct(residualAnnual, heldPrincipal);
    return {
      label: fyLabel(fy),
      fyIndex: fy,
      heldPrincipal,
      fundResidualAnnual: residualAnnual,
      fundYieldPct,
      baseRatePct,
      targetRatePct,
    };
  });

  const steadyStateResidual = holdings.reduce((acc, h) => acc + h.steadyStateResidualAnnual, 0);
  const steadyStateFundYieldPct = equityReturnPct(
    steadyStateResidual,
    totalHeldEquityPrincipalAtFull,
  );

  return {
    empty: false,
    baseRateBps,
    baseRatePct,
    targetSpreadBps,
    targetRatePct,
    totalHeldEquityPrincipalAtFull,
    steadyStateFundYieldPct,
    byFy,
    holdings,
  };
}
