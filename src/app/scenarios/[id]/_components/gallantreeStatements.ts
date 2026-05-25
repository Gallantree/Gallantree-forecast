import Decimal from "decimal.js";
import type { MonthlyValue } from "@/engine/pnl";
import type { Statements } from "@/engine/statements";
import { computeValuation } from "@/engine/valuation";
import type { BalanceSheetData, SerializedSeries } from "./BalanceSheetTab";
import type { CashflowData } from "./CashflowTab";
import type { FYGroup } from "./PnlClientTable";
import type { ValuationData } from "./ValuationTab";

// ── Gallantree statements ──────────────────────────────────────────────────
//
// Re-derives the balance sheet, cashflow statement, and valuation from the
// engine output as Gallantree's standalone view. The transforms are:
//
//   DROP (investor-pass-through items that don't belong to Gallantree):
//     * NIM revenue lines (account codes 4100–4499 — loan-book revenue
//       that flows through to capital-program investors)
//     * Capital-program tranche interest expense (pnl.interestExpense)
//     * Program-tranche financing flows on the CF (notesIssuance, notesRepayment)
//     * Program-tranche portion of notesPayable on the BS, computed as
//       Σ(notesIssuance − notesRepayment); convertible-note proceeds stay
//
//   KEEP (Gallantree's own operating economics):
//     * Management + servicing + program license revenue (4500+)
//     * Upfront issuance fees: prepaidIssuanceCosts (BS), issuanceCostOutflow
//       (CF cash out), issuanceAmortisation (P&L expense + CF add-back)
//     * All OPEX, depreciation, working-capital changes
//     * Convertible-note + equity-raise proceeds (Gallantree's own financing)
//
// Tax preserves the original implied effective rate per month so the
// Gallantree cascade stays internally consistent.
//
// BS balance: cash − ΔprogramNotesNet (we kept everything else that was on
// the original BS, but stripped the program-tranche portion of notesPayable
// and the corresponding net program cash inflow in the CF, so the two sides
// match by construction).
//
// AR/AP are left untouched because the engine doesn't decompose receivables
// by revenue source — treating NIM revenue as cash-settled means removing
// it from the P&L without touching working capital is a mild overstatement
// of operating cash, but the alternative requires changes inside the engine
// itself. Same trade-off as `toGallantreePnl`.

// Account codes 4100–4499 are loan-book NIM revenue (interest earned on the
// underlying loans). Gallantree only recognises the management / servicing /
// platform fees (4500+) as its own revenue — the NIM flows through to
// program noteholders. Exported so the Use of Funds aggregator can apply the
// same filter when offsetting Gallantree's cash uses against revenue.
export const NIM_REVENUE_PATTERN = /^4[1-4]\d\d$/;
const ZERO = new Decimal(0);

function serializeMonthly(series: MonthlyValue[]): SerializedSeries {
  const monthly: Record<string, string> = {};
  for (const m of series) monthly[m.periodKey] = m.value.toFixed(2);
  return { monthly };
}

function fromMonthlyMap(horizon: string[], m: Map<string, Decimal>): MonthlyValue[] {
  return horizon.map((pk) => ({ periodKey: pk, value: m.get(pk) ?? ZERO }));
}

function toMap(series: MonthlyValue[]): Map<string, Decimal> {
  const m = new Map<string, Decimal>();
  for (const v of series) m.set(v.periodKey, v.value);
  return m;
}

function runningSum(series: MonthlyValue[]): MonthlyValue[] {
  let acc = ZERO;
  return series.map((v) => {
    acc = acc.plus(v.value);
    return { periodKey: v.periodKey, value: acc };
  });
}

interface GallantreeStatements {
  balanceSheet: BalanceSheetData;
  cashflow: CashflowData;
  valuation: ValuationData;
}

export function buildGallantreeStatements({
  statements,
  groups,
  scenarioAssumptions,
  valuationAssumptions,
}: {
  statements: Statements;
  groups: FYGroup[];
  scenarioAssumptions: {
    dsoDays?: string;
    dpoDays?: string;
    taxRatePct?: string;
    openingCash?: string;
    openingEquity?: string;
  };
  valuationAssumptions: {
    waccPct?: string;
    terminalGrowthPct?: string;
    evEbitdaMultiple?: string;
    evRevenueMultiple?: string;
    peMultiple?: string;
    netDebt?: string;
  };
}): GallantreeStatements {
  const horizon = statements.horizon;
  const pnl = statements.pnl;
  const bs = statements.bs;
  const cf = statements.cf;

  // ── Per-month deltas ────────────────────────────────────────────────────
  // Dropped NIM revenue per month (positive value to subtract).
  const droppedNim = new Map<string, Decimal>();
  for (const pk of horizon) droppedNim.set(pk, ZERO);
  for (const line of pnl.revenue.lines) {
    if (!NIM_REVENUE_PATTERN.test(line.accountCode)) continue;
    for (const m of line.monthly) {
      droppedNim.set(m.periodKey, (droppedNim.get(m.periodKey) ?? ZERO).plus(m.value));
    }
  }

  const ebitdaMap = toMap(pnl.ebitda);
  const ebitMap = toMap(pnl.ebit);
  const pretaxMap = toMap(pnl.pretaxIncome);
  const taxMap = toMap(pnl.taxExpense);

  // Recompute Gallantree cascade per month.
  const gEbitda: MonthlyValue[] = [];
  const gEbit: MonthlyValue[] = [];
  const gPretax: MonthlyValue[] = [];
  const gTax: MonthlyValue[] = [];
  const gNetIncome: MonthlyValue[] = [];

  for (const pk of horizon) {
    const drop = droppedNim.get(pk) ?? ZERO;
    // Gallantree drops only the NIM revenue lines. Upfront-fee amortisation
    // (issuanceAmortisation) and depreciation stay — they're Gallantree's
    // own expense items. Program-tranche interest (pnl.interestExpense) is
    // the only thing we strip below the EBIT line.
    const ebitda = (ebitdaMap.get(pk) ?? ZERO).minus(drop);
    const ebit = (ebitMap.get(pk) ?? ZERO).minus(drop);
    // No program-tranche interest in the Gallantree view.
    const pretax = ebit;
    // Preserve the original implied effective tax rate so the cascade stays
    // internally consistent with the standard P&L.
    const origPretax = pretaxMap.get(pk) ?? ZERO;
    const origTax = taxMap.get(pk) ?? ZERO;
    const rate = origPretax.isZero() ? ZERO : origTax.div(origPretax);
    const tax = pretax.times(rate);
    const net = pretax.minus(tax);
    gEbitda.push({ periodKey: pk, value: ebitda });
    gEbit.push({ periodKey: pk, value: ebit });
    gPretax.push({ periodKey: pk, value: pretax });
    gTax.push({ periodKey: pk, value: tax });
    gNetIncome.push({ periodKey: pk, value: net });
  }

  // ── Gallantree revenue totals (for valuation) ───────────────────────────
  const gRevenueTotalsMap = new Map<string, Decimal>();
  for (const pk of horizon) gRevenueTotalsMap.set(pk, ZERO);
  for (const line of pnl.revenue.lines) {
    if (NIM_REVENUE_PATTERN.test(line.accountCode)) continue;
    for (const m of line.monthly) {
      gRevenueTotalsMap.set(
        m.periodKey,
        (gRevenueTotalsMap.get(m.periodKey) ?? ZERO).plus(m.value),
      );
    }
  }
  const gRevenueTotals = fromMonthlyMap(horizon, gRevenueTotalsMap);

  // ── Cashflow ────────────────────────────────────────────────────────────
  // Keep upfront-fee items (Gallantree's own cash outflows + non-cash
  // amortisation add-back). Drop program-tranche financing flows:
  // notesIssuance, notesRepayment. Program-tranche interest is already
  // absent from gNetIncome (we stripped it from the cascade above).
  const changeInArMap = toMap(cf.changeInAr);
  const changeInApMap = toMap(cf.changeInAp);
  const changeInDeferredMap = toMap(cf.changeInDeferredRevenue);
  const capexMap = toMap(cf.capexOutflow);
  const issuanceAmortCfMap = toMap(cf.issuanceAmortisation);
  const issuanceCostOutflowMap = toMap(cf.issuanceCostOutflow);
  const equityProceedsMap = toMap(cf.equityProceeds);
  const convertibleProceedsMap = toMap(cf.convertibleProceeds);
  const depreciationMap = toMap(cf.depreciation);

  const gNetCashMovement: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: gNetIncome[i].value
      .plus(depreciationMap.get(pk) ?? ZERO)
      .plus(issuanceAmortCfMap.get(pk) ?? ZERO)
      .minus(changeInArMap.get(pk) ?? ZERO)
      .plus(changeInApMap.get(pk) ?? ZERO)
      .plus(changeInDeferredMap.get(pk) ?? ZERO)
      .minus(capexMap.get(pk) ?? ZERO)
      .minus(issuanceCostOutflowMap.get(pk) ?? ZERO)
      .plus(equityProceedsMap.get(pk) ?? ZERO)
      .plus(convertibleProceedsMap.get(pk) ?? ZERO),
  }));

  const openingCash = new Decimal(scenarioAssumptions.openingCash ?? "0");
  let cashAcc = openingCash;
  const gEndingCash: MonthlyValue[] = gNetCashMovement.map((m) => {
    cashAcc = cashAcc.plus(m.value);
    return { periodKey: m.periodKey, value: cashAcc };
  });

  const zeroSeries: MonthlyValue[] = horizon.map((pk) => ({ periodKey: pk, value: ZERO }));

  const totalNetIncome = gNetIncome.reduce<Decimal>((acc, m) => acc.plus(m.value), ZERO);
  const totalCashMovement = gNetCashMovement.reduce<Decimal>((acc, m) => acc.plus(m.value), ZERO);

  const cashflow: CashflowData = {
    horizon,
    groups,
    netIncome: serializeMonthly(gNetIncome),
    depreciation: serializeMonthly(cf.depreciation),
    issuanceAmortisation: serializeMonthly(cf.issuanceAmortisation),
    changeInAr: serializeMonthly(cf.changeInAr),
    changeInAp: serializeMonthly(cf.changeInAp),
    changeInDeferredRevenue: serializeMonthly(cf.changeInDeferredRevenue),
    capexOutflow: serializeMonthly(cf.capexOutflow),
    issuanceCostOutflow: serializeMonthly(cf.issuanceCostOutflow),
    // Program-tranche financing flows belong to investors, not Gallantree.
    notesIssuance: serializeMonthly(zeroSeries),
    notesRepayment: serializeMonthly(zeroSeries),
    equityProceeds: serializeMonthly(cf.equityProceeds),
    convertibleProceeds: serializeMonthly(cf.convertibleProceeds),
    netCashMovement: serializeMonthly(gNetCashMovement),
    endingCash: serializeMonthly(gEndingCash),
    openingCash: openingCash.toFixed(2),
    closingCash: gEndingCash[gEndingCash.length - 1].value.toFixed(2),
    totalNetIncome: totalNetIncome.toFixed(2),
    totalCashMovement: totalCashMovement.toFixed(2),
  };

  // ── Balance sheet ───────────────────────────────────────────────────────
  // Program-only notes payable = cumulative(notesIssuance − notesRepayment).
  // notesIssuance/notesRepayment from the engine are program-tranche only;
  // convertibles are handled separately via convertibleProceeds.
  const programNotesNet: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: cf.notesIssuance[i].value.minus(cf.notesRepayment[i].value),
  }));
  const cumulativeProgramNotes = runningSum(programNotesNet);
  const programNotesMap = toMap(cumulativeProgramNotes);

  const bsNotesMap = toMap(bs.notesPayable);
  // Gallantree notesPayable = original − program tranche portion = cumulative
  // convertible proceeds only.
  const gNotesPayable: MonthlyValue[] = horizon.map((pk) => ({
    periodKey: pk,
    value: (bsNotesMap.get(pk) ?? ZERO).minus(programNotesMap.get(pk) ?? ZERO),
  }));

  // Equity uses Gallantree NI for retained-earnings accumulation.
  const cumGNI = runningSum(gNetIncome);
  const cumEquityProceeds = runningSum(cf.equityProceeds);
  // Mirror engine: openingEquity = (assumption.openingEquity ?? 0) + openingCash.
  const openingEquity = new Decimal(scenarioAssumptions.openingEquity ?? "0").plus(openingCash);
  const gEquity: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: openingEquity.plus(cumGNI[i].value).plus(cumEquityProceeds[i].value),
  }));

  // Totals — prepaidIssuanceCosts is Gallantree's own prepaid expense (the
  // unamortised portion of upfront issuance fees), so it stays on the
  // asset side and offsets the cash outflow we kept in the CF.
  const arMap = toMap(bs.ar);
  const ppeNetMap = toMap(bs.ppeNet);
  const prepaidIssuanceMap = toMap(bs.prepaidIssuanceCosts);
  const apMap = toMap(bs.ap);
  const deferredMap = toMap(bs.deferredRevenue);

  const gTotalAssets: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: gEndingCash[i].value
      .plus(arMap.get(pk) ?? ZERO)
      .plus(ppeNetMap.get(pk) ?? ZERO)
      .plus(prepaidIssuanceMap.get(pk) ?? ZERO),
  }));
  const gTotalLE: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: (apMap.get(pk) ?? ZERO)
      .plus(gNotesPayable[i].value)
      .plus(deferredMap.get(pk) ?? ZERO)
      .plus(gEquity[i].value),
  }));

  const balanceSheet: BalanceSheetData = {
    horizon,
    groups,
    cash: serializeMonthly(gEndingCash),
    ar: serializeMonthly(bs.ar),
    ppeGross: serializeMonthly(bs.ppeGross),
    accumulatedDepreciation: serializeMonthly(bs.accumulatedDepreciation),
    ppeNet: serializeMonthly(bs.ppeNet),
    prepaidIssuanceCosts: serializeMonthly(bs.prepaidIssuanceCosts),
    totalAssets: serializeMonthly(gTotalAssets),
    ap: serializeMonthly(bs.ap),
    notesPayable: serializeMonthly(gNotesPayable),
    deferredRevenue: serializeMonthly(bs.deferredRevenue),
    equity: serializeMonthly(gEquity),
    totalLiabilitiesAndEquity: serializeMonthly(gTotalLE),
    closingCash: gEndingCash[gEndingCash.length - 1].value.toFixed(2),
    closingEquity: gEquity[gEquity.length - 1].value.toFixed(2),
    closingTotalAssets: gTotalAssets[gTotalAssets.length - 1].value.toFixed(2),
    assumptions: {
      dsoDays: scenarioAssumptions.dsoDays,
      dpoDays: scenarioAssumptions.dpoDays,
      taxRatePct: scenarioAssumptions.taxRatePct,
      openingCash: scenarioAssumptions.openingCash,
      openingEquity: scenarioAssumptions.openingEquity,
    },
  };

  // ── Valuation ───────────────────────────────────────────────────────────
  const v = computeValuation(
    groups,
    {
      revenueTotals: gRevenueTotals,
      ebitda: gEbitda,
      ebit: gEbit,
      netIncome: gNetIncome,
      netCashMovement: gNetCashMovement,
    },
    valuationAssumptions,
  );
  const valuation: ValuationData = {
    fys: v.fys,
    aggregates: v.aggregates.map((a) => ({
      fy: a.fy,
      revenue: a.revenue.toFixed(2),
      ebitda: a.ebitda.toFixed(2),
      ebit: a.ebit.toFixed(2),
      netIncome: a.netIncome.toFixed(2),
      fcf: a.fcf.toFixed(2),
    })),
    dcf: v.dcf.map((d) => ({
      horizonYears: d.horizonYears,
      presentValueFcfs: d.presentValueFcfs.toFixed(2),
      terminalValue: d.terminalValue.toFixed(2),
      presentValueTerminal: d.presentValueTerminal.toFixed(2),
      enterpriseValue: d.enterpriseValue.toFixed(2),
      equityValue: d.equityValue.toFixed(2),
      impliedExitMultipleOnEbitda: d.impliedExitMultipleOnEbitda.toFixed(2),
      invalidReason: d.invalidReason,
    })),
    evEbitda: v.evEbitda.map((m) => ({
      fy: m.fy,
      metric: m.metric.toFixed(2),
      multiple: m.multiple.toFixed(2),
      enterpriseValue: m.enterpriseValue.toFixed(2),
      equityValue: m.equityValue.toFixed(2),
    })),
    evRevenue: v.evRevenue.map((m) => ({
      fy: m.fy,
      metric: m.metric.toFixed(2),
      multiple: m.multiple.toFixed(2),
      enterpriseValue: m.enterpriseValue.toFixed(2),
      equityValue: m.equityValue.toFixed(2),
    })),
    pe: v.pe.map((m) => ({
      fy: m.fy,
      metric: m.metric.toFixed(2),
      multiple: m.multiple.toFixed(2),
      enterpriseValue: m.enterpriseValue.toFixed(2),
      equityValue: m.equityValue.toFixed(2),
    })),
    assumptions: {
      waccPct: v.assumptions.waccPct.toFixed(2),
      terminalGrowthPct: v.assumptions.terminalGrowthPct.toFixed(2),
      evEbitdaMultiple: v.assumptions.evEbitdaMultiple.toFixed(2),
      evRevenueMultiple: v.assumptions.evRevenueMultiple.toFixed(2),
      peMultiple: v.assumptions.peMultiple.toFixed(2),
      netDebt: v.assumptions.netDebt.toFixed(2),
    },
  };

  return { balanceSheet, cashflow, valuation };
}
