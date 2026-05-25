/**
 * Pure waterfall calculation helpers for capital program deal economics.
 * Extracted from ProgramWaterfallTab so they can be unit-tested without
 * importing React or Next.js.
 */

export type WaterfallFee = {
  basisAmount: number;
  feeBps: number;
};

export type WaterfallTranche = {
  numNotes: number;
  faceValuePerNote: number;
  returnProfileBps: number;
  rateType: "fixed" | "variable";
};

/**
 * Annual fee = basisAmount × feeBps / 10000
 * (basisAmount is already in dollars; feeBps is basis points e.g. 25 = 0.25%)
 */
export function annualFeeAmount(basisAmount: number, feeBps: number): number {
  return (basisAmount * feeBps) / 10000;
}

/**
 * Annual interest cost for a liability tranche.
 * Variable tranches use baseRateBps + returnProfileBps (all-in).
 * Fixed tranches use returnProfileBps only.
 */
export function trancheAnnualInterest(
  numNotes: number,
  faceValuePerNote: number,
  returnProfileBps: number,
  rateType: "fixed" | "variable",
  baseRateBps: number,
): number {
  const principal = numNotes * faceValuePerNote;
  const rateBps = rateType === "variable" ? baseRateBps + returnProfileBps : returnProfileBps;
  return (principal * rateBps) / 10000;
}

/**
 * Gross interest income using the all-in rate (credit spread + base rate).
 * Must match how variable-tranche note interest is computed so the waterfall
 * is internally consistent. Using only the credit spread understates income
 * and makes equity returns appear falsely negative.
 */
export function grossCollectionsAllIn(
  totalBalance: number,
  waSpreadBps: number,
  baseRateBps: number,
): number {
  return (totalBalance * (waSpreadBps + baseRateBps)) / 10000;
}

/**
 * Cash-on-cash yield for the equity tranche(s) as a percentage per annum.
 * Returns null when equityPrincipal is zero (avoids div-by-zero).
 */
export function equityReturnPct(residual: number, equityPrincipal: number): number | null {
  if (equityPrincipal <= 0) return null;
  return (residual / equityPrincipal) * 100;
}

export type WaterfallResult = {
  grossCollections: number;
  totalFees: number;
  totalNoteInterest: number;
  totalOutflows: number;
  residual: number;
  equityPrincipal: number;
  equityReturnPct: number | null;
};

/**
 * Compute the full waterfall for a single capital program period.
 * Fees, debt tranche interest, and equity principal are all passed in already
 * split by the caller (e.g. the server component that knows which liabilities
 * are funding vs equity).
 */
export function computeWaterfall(opts: {
  totalBalance: number;
  waSpreadBps: number;
  baseRateBps: number;
  fees: WaterfallFee[];
  debtTranches: WaterfallTranche[];
  equityTranches: WaterfallTranche[];
}): WaterfallResult {
  const { totalBalance, waSpreadBps, baseRateBps, fees, debtTranches, equityTranches } = opts;

  const grossCollections = grossCollectionsAllIn(totalBalance, waSpreadBps, baseRateBps);
  const totalFees = fees.reduce((acc, f) => acc + annualFeeAmount(f.basisAmount, f.feeBps), 0);
  const totalNoteInterest = debtTranches.reduce(
    (acc, t) =>
      acc + trancheAnnualInterest(t.numNotes, t.faceValuePerNote, t.returnProfileBps, t.rateType, baseRateBps),
    0,
  );
  const totalOutflows = totalFees + totalNoteInterest;
  const residual = grossCollections - totalOutflows;
  const equityPrincipal = equityTranches.reduce(
    (acc, t) => acc + t.numNotes * t.faceValuePerNote,
    0,
  );

  return {
    grossCollections,
    totalFees,
    totalNoteInterest,
    totalOutflows,
    residual,
    equityPrincipal,
    equityReturnPct: equityReturnPct(residual, equityPrincipal),
  };
}
