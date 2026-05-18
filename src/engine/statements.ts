import Decimal from "decimal.js";
import { money, ZERO, type Money } from "@/utils/money";
import {
  computePnL,
  projectCapexDepreciation,
  type DriverInput,
  type HeadcountInput,
  type CapexStraightLineDriverInput,
  type MonthlyValue,
  type PnL,
} from "./pnl";
import type { LoanInput, NimTier } from "./loans";
import type { ProgramFeeInput } from "./programs";

export interface ScenarioAssumptions {
  dsoDays?: Decimal.Value;
  dpoDays?: Decimal.Value;
  taxRatePct?: Decimal.Value;
  openingCash?: Decimal.Value;
  openingEquity?: Decimal.Value;
  nimTier?: NimTier;
}

export interface PnLExtended extends PnL {
  depreciation: MonthlyValue[];
  ebitda: MonthlyValue[];
  ebit: MonthlyValue[];
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
  cash: MonthlyValue[];
  totalAssets: MonthlyValue[];
  equity: MonthlyValue[];
  totalLiabilitiesAndEquity: MonthlyValue[];
}

export interface CashFlow {
  netIncome: MonthlyValue[];
  depreciation: MonthlyValue[];
  changeInAr: MonthlyValue[];
  changeInAp: MonthlyValue[];
  capexOutflow: MonthlyValue[];
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

function runningSum(
  series: MonthlyValue[],
  opening: Money,
  horizon: string[],
): MonthlyValue[] {
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
): Statements {
  const pnl = computePnL(
    drivers,
    headcount,
    horizon,
    loans,
    assumptions.nimTier ?? "default",
    programFees,
  );

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

  // P&L extension: EBITDA = revenue - (opex - depreciation); EBIT = EBITDA - dep; tax on EBIT.
  const taxRate = money(assumptions.taxRatePct ?? 0).div(100);
  const ebitda: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: pnl.revenue.totals[i].value
      .minus(pnl.opex.totals[i].value)
      .plus(depreciation[i].value),
  }));
  const ebit: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: ebitda[i].value.minus(depreciation[i].value),
  }));
  const taxExpense: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: ebit[i].value.gt(0) ? ebit[i].value.times(taxRate) : (ZERO as Money),
  }));
  const netIncome: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: ebit[i].value.minus(taxExpense[i].value),
  }));
  const netIncomeTotal = netIncome.reduce(
    (acc, m) => acc.plus(m.value),
    ZERO as Money,
  );

  // Working capital: AR/AP scaled by monthly P&L flows (DSO/30, DPO/30).
  const dso = money(assumptions.dsoDays ?? 0).div(DAYS_PER_MONTH);
  const dpo = money(assumptions.dpoDays ?? 0).div(DAYS_PER_MONTH);

  // Cash opex = opex total - depreciation (depreciation is non-cash and not on AP).
  const cashOpex: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: pnl.opex.totals[i].value.minus(depreciation[i].value),
  }));

  const ar: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: pnl.revenue.totals[i].value.times(dso),
  }));
  const ap: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: cashOpex[i].value.times(dpo),
  }));

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

  const netCashMovement: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: netIncome[i].value
      .plus(depreciation[i].value)
      .minus(changeInAr[i].value)
      .plus(changeInAp[i].value)
      .minus(capexOutflow[i].value),
  }));

  const openingCash = money(assumptions.openingCash ?? 0);
  const endingCash = runningSum(netCashMovement, openingCash, horizon);

  // Equity = opening + cumulative net income (no dividends modelled).
  const openingEquity = money(assumptions.openingEquity ?? 0);
  const equity = runningSum(netIncome, openingEquity, horizon);

  const totalAssets: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: endingCash[i].value.plus(ar[i].value).plus(ppeNet[i].value),
  }));
  const totalLiabilitiesAndEquity: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: ap[i].value.plus(equity[i].value),
  }));

  return {
    horizon,
    pnl: {
      ...pnl,
      depreciation,
      ebitda,
      ebit,
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
      cash: endingCash,
      totalAssets,
      equity,
      totalLiabilitiesAndEquity,
    },
    cf: {
      netIncome,
      depreciation,
      changeInAr,
      changeInAp,
      capexOutflow,
      netCashMovement,
      endingCash,
    },
  };
}
