import { z } from "zod";
import { decimalStringSchema, periodKeySchema } from "@/validators";

export const driverCreateSchema = z.object({
  name: z.string().min(1).max(120),
  accountCode: z.string().min(1).max(20),
  type: z.literal("recurring_revenue"),
  startPeriodKey: periodKeySchema,
  baseMonthly: decimalStringSchema,
  monthlyGrowthPct: decimalStringSchema,
});
export type DriverCreate = z.infer<typeof driverCreateSchema>;
