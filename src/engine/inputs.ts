import { Driver, Headcount } from "@/models";
import type { DriverInput, HeadcountInput } from "./pnl";

interface DriverDoc {
  _id: unknown;
  name: string;
  type: "recurring_revenue" | "opex_fixed" | "opex_pct_revenue";
  accountCode: string;
  startPeriodKey: string;
  endPeriodKey?: string;
  baseMonthly?: { toString: () => string };
  monthlyGrowthPct?: { toString: () => string };
  pctOfRevenue?: { toString: () => string };
}

interface HeadcountDoc {
  _id: unknown;
  role: string;
  accountCode: string;
  startPeriodKey: string;
  endPeriodKey?: string;
  salaryAnnual: { toString: () => string };
  onCostPct: { toString: () => string };
  salaryGrowthPctAnnual: { toString: () => string };
}

function toDriverInput(d: DriverDoc): DriverInput {
  const id = String(d._id);
  if (d.type === "recurring_revenue") {
    return {
      kind: "recurring_revenue",
      id,
      name: d.name,
      accountCode: d.accountCode,
      startPeriodKey: d.startPeriodKey,
      endPeriodKey: d.endPeriodKey,
      baseMonthly: d.baseMonthly!.toString(),
      monthlyGrowthPct: d.monthlyGrowthPct!.toString(),
    };
  }
  if (d.type === "opex_fixed") {
    return {
      kind: "opex_fixed",
      id,
      name: d.name,
      accountCode: d.accountCode,
      startPeriodKey: d.startPeriodKey,
      endPeriodKey: d.endPeriodKey,
      baseMonthly: d.baseMonthly!.toString(),
      monthlyGrowthPct: d.monthlyGrowthPct!.toString(),
    };
  }
  return {
    kind: "opex_pct_revenue",
    id,
    name: d.name,
    accountCode: d.accountCode,
    startPeriodKey: d.startPeriodKey,
    endPeriodKey: d.endPeriodKey,
    pctOfRevenue: d.pctOfRevenue!.toString(),
  };
}

function toHeadcountInput(h: HeadcountDoc): HeadcountInput {
  return {
    id: String(h._id),
    role: h.role,
    accountCode: h.accountCode,
    startPeriodKey: h.startPeriodKey,
    endPeriodKey: h.endPeriodKey,
    salaryAnnual: h.salaryAnnual.toString(),
    onCostPct: h.onCostPct.toString(),
    salaryGrowthPctAnnual: h.salaryGrowthPctAnnual.toString(),
  };
}

export async function loadEngineInputs(scenarioId: string): Promise<{
  drivers: DriverInput[];
  headcount: HeadcountInput[];
}> {
  const [driverDocs, headcountDocs] = await Promise.all([
    Driver.find({ scenarioId }).lean<DriverDoc[]>(),
    Headcount.find({ scenarioId }).lean<HeadcountDoc[]>(),
  ]);
  return {
    drivers: driverDocs.map(toDriverInput),
    headcount: headcountDocs.map(toHeadcountInput),
  };
}
