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
    type: z.literal("opex_fixed"),
    baseMonthly: decimalStringSchema,
    monthlyGrowthPct: decimalStringSchema,
  }),
  z.object({
    ...base,
    type: z.literal("opex_pct_revenue"),
    pctOfRevenue: decimalStringSchema,
  }),
]);
export type DriverCreate = z.infer<typeof driverCreateSchema>;
