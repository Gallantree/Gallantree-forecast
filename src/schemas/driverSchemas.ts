import { z } from "zod";
import { decimalStringSchema, periodKeySchema } from "@/validators";

const base = {
  name: z.string().min(1).max(120),
  accountCode: z.string().min(1).max(20),
  startPeriodKey: periodKeySchema,
  endPeriodKey: periodKeySchema.optional(),
};

export const driverCreateSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("recurring_revenue"),
    baseMonthly: decimalStringSchema,
    monthlyGrowthPct: decimalStringSchema,
  }),
  z.object({
    ...base,
    type: z.literal("fee_x_volume"),
    feeBps: decimalStringSchema,
    volumeMonthly: decimalStringSchema,
    volumeMonthlyGrowthPct: decimalStringSchema,
  }),
  z.object({
    ...base,
    type: z.literal("one_off"),
    amount: decimalStringSchema,
    periodKey: periodKeySchema,
  }),
  z.object({
    ...base,
    type: z.literal("opex_fixed"),
    baseMonthly: decimalStringSchema,
    monthlyGrowthPct: decimalStringSchema,
  }),
  z.object({
    ...base,
    type: z.literal("opex_pct_revenue"),
    pctOfRevenue: decimalStringSchema,
  }),
  z.object({
    ...base,
    type: z.literal("opex_per_fte"),
    costPerFteMonthly: decimalStringSchema,
  }),
  z.object({
    ...base,
    type: z.literal("capex_straight_line"),
    cost: decimalStringSchema,
    inServicePeriodKey: periodKeySchema,
    usefulLifeMonths: z.number().int().positive(),
  }),
]);
export type DriverCreate = z.infer<typeof driverCreateSchema>;
