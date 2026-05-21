import Decimal from "decimal.js";
import { type Money, money, ZERO } from "@/utils/money";
import {
  type CapitalRaiseInput,
  projectConvertibleProceeds,
  projectEquityProceeds,
} from "./capitalRaises";
import type { LoanInput } from "./loans";
import {
  type PlatformLicenseInput,
  projectLicenseBillings,
  projectPlatformLicense,
} from "./platformLicenses";
import { programBalanceFactor } from "./programFactor";
import {
  type ProgramUpfrontFeeInput,
  projectUpfrontFeeAmortisation,
  projectUpfrontFeeCashOutflow,
} from "./programUpfrontFees";
import {
  type CapexStraightLineDriverInput,
  computePnL,
  type DriverInput,
  type HeadcountInput,
  type MonthlyValue,
  type PnL,
  projectCapexDepreciation,
} from "./pnl";
import type { ProgramLiabilityInput } from "./programLiabilities";
import type { ProgramFeeInput } from "./programs";

export interface ScenarioAssumptions {
  dsoDays?: Decimal.Value;
  dpoDays?: Decimal.Value;
  taxRatePct?: Decimal.Value;
  openingCash?: Decimal.Value;
  openingEquity?: Decimal.Value;
  loanBookGrowthPctByYear?: Decimal.Value[];
  baseRateBps?: Decimal.Value;
}

export interface PnLExtended extends PnL {
  depreciation: MonthlyValue[];
  issuanceAmortisation: MonthlyValue[];
  interestExpense: MonthlyValue[];
  ebitda: MonthlyValue[];
  ebit: MonthlyValue[];
  pretaxIncome: MonthlyValue[];
  taxExpense: MonthlyValue[];
  netIncome: MonthlyValue[];
  netIncomeTotal: Money;
}

export interface BalanceSheet {
  ar: MonthlyValue[];
  ap: MonthlyValue[];
  ppeGross: MonthlyValue[];
  accumulatedDepreciation: MonthlyValue[];
  ppeNet: MonthlyValue[];
  prepaidIssuanceCosts: MonthlyValue[];
  cash: MonthlyValue[];
  notesPayable: MonthlyValue[];
  deferredRevenue: MonthlyValue[];
  totalAssets: MonthlyValue[];
  equity: MonthlyValue[];
  totalLiabilitiesAndEquity: MonthlyValue[];
}

export interface CashFlow {
  netIncome: MonthlyValue[];
  depreciation: MonthlyValue[];
  issuanceAmortisation: MonthlyValue[];
  changeInAr: MonthlyValue[];
  changeInAp: MonthlyValue[];
  changeInDeferredRevenue: MonthlyValue[];
  capexOutflow: MonthlyValue[];
  issuanceCostOutflow: MonthlyValue[];
  notesIssuance: MonthlyValue[];
  notesRepayment: MonthlyValue[];
  equityProceeds: MonthlyValue[];
  convertibleProceeds: MonthlyValue[];
  netCashMovement: MonthlyValue[];
  endingCash: MonthlyValue[];
}

export interface Statements {
  horizon: string[];
  pnl: PnLExtended;
  bs: BalanceSheet;
  cf: CashFlow;
}

const DAYS_PER_MONTH = new Decimal(30);

function zeroSeries(horizon: string[]): MonthlyValue[] {
  return horizon.map((pk) => ({ periodKey: pk, value: ZERO as Money }));
}

function sumSeries(series: MonthlyValue[][], horizon: string[]): MonthlyValue[] {
  return horizon.map((pk, i) => ({
    periodKey: pk,
    value: series.reduce((acc, s) => acc.plus(s[i].value), ZERO as Money),
  }));
}

function diffSeries(series: MonthlyValue[], opening: Money, horizon: string[]): MonthlyValue[] {
  let prev = opening;
  return horizon.map((pk, i) => {
    const delta = series[i].value.minus(prev);
    prev = series[i].value;
    return { periodKey: pk, value: delta };
  });
}

function runningSum(series: MonthlyValue[], opening: Money, horizon: string[]): MonthlyValue[] {
  let acc = opening;
  return horizon.map((pk, i) => {
    acc = acc.plus(series[i].value);
    return { periodKey: pk, value: acc };
  });
}

export function computeStatements(
  drivers: DriverInput[],
  headcount: HeadcountInput[],
  horizon: string[],
  assumptions: ScenarioAssumptions = {},
  loans: LoanInput[] = [],
  programFees: ProgramFeeInput[] = [],
  platformLicenses: PlatformLicenseInput[] = [],
  programLiabilities: ProgramLiabilityInput[] = [],
  capitalRaises: CapitalRaiseInput[] = [],
  programUpfrontFees: ProgramUpfrontFeeInput[] = [],
): Statements {
  const pnl = computePnL(
    drivers,
    headcount,
    horizon,
    loans,
    programFees,
    assumptions.loanBookGrowthPctByYear ?? [],
    platformLicenses,
    programLiabilities,
    assumptions.baseRateBps ?? 0,
    programUpfrontFees,
  );

  // Issuance cost cash outflow (full amount at the program's start period) and
  // straight-line amortisation across the deal life. The cash outflow lands in
  // operating CF; the unamortised balance sits on the BS as a prepaid asset.
  const issuanceCostOutflowByFee = programUpfrontFees.map((u) =>
    projectUpfrontFeeCashOutflow(u, horizon),
  );
  const issuanceAmortisationByFee = programUpfrontFees.map((u) =>
    projectUpfrontFeeAmortisation(u, horizon),
  );
  const issuanceCostOutflow: MonthlyValue[] =
    issuanceCostOutflowByFee.length === 0
      ? zeroSeries(horizon)
      : sumSeries(issuanceCostOutflowByFee, horizon);
  const issuanceAmortisation: MonthlyValue[] =
    issuanceAmortisationByFee.length === 0
      ? zeroSeries(horizon)
      : sumSeries(issuanceAmortisationByFee, horizon);
  const cumulativeIssuancePurchases = runningSum(issuanceCostOutflow, ZERO as Money, horizon);
  const cumulativeIssuanceAmortisation = runningSum(issuanceAmortisation, ZERO as Money, horizon);
  const prepaidIssuanceCosts: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: cumulativeIssuancePurchases[i].value.minus(cumulativeIssuanceAmortisation[i].value),
  }));

  const capex = drivers.filter(
    (d): d is CapexStraightLineDriverInput => d.kind === "capex_straight_line",
  );

  // Depreciation: re-project per capex driver and sum.
  const depreciationByDriver = capex.map((d) => projectCapexDepreciation(d, horizon));
  const depreciation =
    depreciationByDriver.length === 0
      ? zeroSeries(horizon)
      : sumSeries(depreciationByDriver, horizon);

  // Capex outflow: full asset cost recognised in the in-service period.
  const capexOutflow: MonthlyValue[] = horizon.map((pk) => {
    const value = capex
      .filter((c) => c.inServicePeriodKey === pk)
      .reduce((acc, c) => acc.plus(money(c.cost)), ZERO as Money);
    return { periodKey: pk, value };
  });

  // Interest expense comes from the capital program liabilities section, which
  // sits below operating income in the cascade.
  const interestExpense: MonthlyValue[] = pnl.liabilities.totals.map((m) => ({
    periodKey: m.periodKey,
    value: m.value,
  }));

  // Proper P&L cascade:
  //   EBITDA          = revenue − (opex − depreciation − issuance amortisation)
  //   EBIT            = EBITDA − depreciation − issuance amortisation
  //   Pre-tax income  = EBIT − interest expense
  //   Tax             = max(0, pre-tax) × rate
  //   Net income      = pre-tax − tax
  // Both depreciation and issuance-cost amortisation are non-cash deductions
  // sitting inside opex; they're added back for EBITDA and re-deducted for EBIT.
  const taxRate = money(assumptions.taxRatePct ?? 0).div(100);
  const ebitda: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: pnl.revenue.totals[i].value
      .minus(pnl.opex.totals[i].value)
      .plus(depreciation[i].value)
      .plus(issuanceAmortisation[i].value),
  }));
  const ebit: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: ebitda[i].value.minus(depreciation[i].value).minus(issuanceAmortisation[i].value),
  }));
  const pretaxIncome: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: ebit[i].value.minus(interestExpense[i].value),
  }));
  const taxExpense: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: pretaxIncome[i].value.gt(0) ? pretaxIncome[i].value.times(taxRate) : (ZERO as Money),
  }));
  const netIncome: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: pretaxIncome[i].value.minus(taxExpense[i].value),
  }));
  const netIncomeTotal = netIncome.reduce((acc, m) => acc.plus(m.value), ZERO as Money);

  // Working capital: AR/AP scaled by monthly P&L flows (DSO/30, DPO/30).
  const dso = money(assumptions.dsoDays ?? 0).div(DAYS_PER_MONTH);
  const dpo = money(assumptions.dpoDays ?? 0).div(DAYS_PER_MONTH);

  // Cash opex = opex total − non-cash items (depreciation, issuance amort).
  // Used to scale AP via DPO so we don't accrue payables against non-cash lines.
  const cashOpex: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: pnl.opex.totals[i].value
      .minus(depreciation[i].value)
      .minus(issuanceAmortisation[i].value),
  }));

  // Deferred revenue from annual-billed platform licences. Annual licences are
  // invoiced upfront for 12 months of recognition; the gap between cash billings
  // and recognised revenue accumulates as a current liability (deferred rev),
  // then drains back to 0 over the year as the revenue is earned.
  const annualLicenceRecognition = horizon.map(() => ZERO as Money);
  const annualLicenceBillings = horizon.map(() => ZERO as Money);
  for (const l of platformLicenses) {
    if (l.type !== "compliance" || l.billingFrequency !== "annual") continue;
    const rec = projectPlatformLicense(l, horizon);
    const bil = projectLicenseBillings(l, horizon);
    for (let i = 0; i < horizon.length; i++) {
      annualLicenceRecognition[i] = annualLicenceRecognition[i].plus(rec[i].value);
      annualLicenceBillings[i] = annualLicenceBillings[i].plus(bil[i].value);
    }
  }
  const changeInDeferredRevenue: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: annualLicenceBillings[i].minus(annualLicenceRecognition[i]),
  }));
  const deferredRevenue = runningSum(changeInDeferredRevenue, ZERO as Money, horizon);

  // AR base excludes annually-prepaid revenue (the customer pays upfront, so
  // there's no receivable — the timing lives in deferred revenue instead).
  const arRevenueBase: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: pnl.revenue.totals[i].value.minus(annualLicenceRecognition[i]),
  }));
  const ar: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: arRevenueBase[i].value.times(dso),
  }));
  const ap: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: cashOpex[i].value.times(dpo),
  }));

  // Capital program liabilities — bullet schedule.
  //   notesPayable[t] = sum of principal for tranches active in period t
  //   issuance[t]     = principal of tranches whose first active period is t
  //   repayment[t]    = principal of tranches whose last active period was t-1
  //                     (i.e. the principal is repaid at the start of the
  //                     period AFTER the tranche matures)
  // Σ issuance − Σ repayment over the horizon equals the closing notesPayable
  // balance, keeping the BS balanced through Δcash on the asset side.
  // Per-tranche balance curve: scaled principal at each period. For tranches
  // without a ramp/amort profile this is a flat full-principal block. With a
  // profile it ramps in step with the deal and amortises at the tail.
  const trancheBalance = programLiabilities.map((l) => {
    const principal = money(l.principal);
    const hasProfile = !!(l.rampUpMonths || l.amortisationMonths);
    return horizon.map((pk) => {
      if (pk.localeCompare(l.startPeriodKey) < 0) return ZERO as Money;
      if (l.endPeriodKey && pk.localeCompare(l.endPeriodKey) > 0) return ZERO as Money;
      if (!hasProfile) return principal;
      const factor = programBalanceFactor(pk, {
        startPeriodKey: l.startPeriodKey,
        endPeriodKey: l.endPeriodKey,
        rampUpMonths: l.rampUpMonths,
        amortisationMonths: l.amortisationMonths,
      });
      return principal.times(factor);
    });
  });
  const notesPayable: MonthlyValue[] = horizon.map((pk, i) => {
    let acc = ZERO as Money;
    for (const tb of trancheBalance) acc = acc.plus(tb[i]);
    return { periodKey: pk, value: acc };
  });
  // Issuance/repayment derived from the period-on-period delta of each
  // tranche's balance. Positive Δ → issuance; negative Δ → repayment. This
  // keeps the BS balanced regardless of ramp/amort shape.
  const notesIssuance: MonthlyValue[] = horizon.map((pk, i) => {
    let acc = ZERO as Money;
    for (const tb of trancheBalance) {
      const prev = i === 0 ? (ZERO as Money) : tb[i - 1];
      const delta = tb[i].minus(prev);
      if (delta.gt(0)) acc = acc.plus(delta);
    }
    return { periodKey: pk, value: acc };
  });
  const notesRepayment: MonthlyValue[] = horizon.map((pk, i) => {
    let acc = ZERO as Money;
    for (const tb of trancheBalance) {
      const prev = i === 0 ? (ZERO as Money) : tb[i - 1];
      const delta = tb[i].minus(prev);
      if (delta.lt(0)) acc = acc.plus(delta.abs());
    }
    return { periodKey: pk, value: acc };
  });

  // PPE: gross = cumulative capex purchases; accumulated dep = cumulative depreciation.
  const ppeGross = runningSum(capexOutflow, ZERO as Money, horizon);
  const accumulatedDepreciation = runningSum(depreciation, ZERO as Money, horizon);
  const ppeNet: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: ppeGross[i].value.minus(accumulatedDepreciation[i].value),
  }));

  // CF (indirect)
  const openingAr = ZERO as Money;
  const openingAp = ZERO as Money;
  const changeInAr = diffSeries(ar, openingAr, horizon);
  const changeInAp = diffSeries(ap, openingAp, horizon);

  // Capital-raise proceeds: cash inflows on each funded investor's date.
  // Equity proceeds roll into the equity line on the BS; convertible-note
  // proceeds roll into notesPayable. Withdrawn investors are excluded inside
  // projectKind, so committed + funded both count toward the forecast.
  const equityProceeds = projectEquityProceeds(capitalRaises, horizon);
  const convertibleProceeds = projectConvertibleProceeds(capitalRaises, horizon);

  const netCashMovement: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: netIncome[i].value
      .plus(depreciation[i].value)
      .plus(issuanceAmortisation[i].value)
      .minus(changeInAr[i].value)
      .plus(changeInAp[i].value)
      .plus(changeInDeferredRevenue[i].value)
      .minus(issuanceCostOutflow[i].value)
      .minus(capexOutflow[i].value)
      .plus(notesIssuance[i].value)
      .minus(notesRepayment[i].value)
      .plus(equityProceeds[i].value)
      .plus(convertibleProceeds[i].value),
  }));

  const openingCash = money(assumptions.openingCash ?? 0);
  const endingCash = runningSum(netCashMovement, openingCash, horizon);

  // Equity = opening + cumulative net income + cumulative equity proceeds.
  // Opening cash is contributed capital on day 0 — add it to the equity
  // baseline so the BS balances at t=0 (Assets = cash = Equity).
  const openingEquity = money(assumptions.openingEquity ?? 0).plus(openingCash);
  const cumulativeEquityProceeds = runningSum(equityProceeds, ZERO as Money, horizon);
  const cumulativeNetIncome = runningSum(netIncome, ZERO as Money, horizon);
  const equity: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: openingEquity.plus(cumulativeNetIncome[i].value).plus(cumulativeEquityProceeds[i].value),
  }));

  // Convertible notes outstanding add to notesPayable (program-tranche
  // principal already accumulated above).
  const cumulativeConvertibleProceeds = runningSum(convertibleProceeds, ZERO as Money, horizon);
  const notesPayableWithConvertibles: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: notesPayable[i].value.plus(cumulativeConvertibleProceeds[i].value),
  }));

  const totalAssets: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: endingCash[i].value
      .plus(ar[i].value)
      .plus(ppeNet[i].value)
      .plus(prepaidIssuanceCosts[i].value),
  }));
  const totalLiabilitiesAndEquity: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: ap[i].value
      .plus(notesPayableWithConvertibles[i].value)
      .plus(deferredRevenue[i].value)
      .plus(equity[i].value),
  }));

  return {
    horizon,
    pnl: {
      ...pnl,
      depreciation,
      issuanceAmortisation,
      interestExpense,
      ebitda,
      ebit,
      pretaxIncome,
      taxExpense,
      netIncome,
      netIncomeTotal,
    },
    bs: {
      ar,
      ap,
      ppeGross,
      accumulatedDepreciation,
      ppeNet,
      prepaidIssuanceCosts,
      cash: endingCash,
      notesPayable: notesPayableWithConvertibles,
      deferredRevenue,
      totalAssets,
      equity,
      totalLiabilitiesAndEquity,
    },
    cf: {
      netIncome,
      depreciation,
      issuanceAmortisation,
      changeInAr,
      changeInAp,
      changeInDeferredRevenue,
      capexOutflow,
      issuanceCostOutflow,
      notesIssuance,
      notesRepayment,
      equityProceeds,
      convertibleProceeds,
      netCashMovement,
      endingCash,
    },
  };
}
