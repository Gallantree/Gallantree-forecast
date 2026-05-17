import { z } from "zod";
import { decimalStringSchema, periodKeySchema } from "@/validators";

export const headcountCreateSchema = z.object({
  role: z.string().min(1).max(120),
  accountCode: z.string().min(1).max(20),
  startPeriodKey: periodKeySchema,
  endPeriodKey: periodKeySchema.optional(),
  salaryAnnual: decimalStringSchema,
  onCostPct: decimalStringSchema,
  salaryGrowthPctAnnual: decimalStringSchema,
});
export type HeadcountCreate = z.infer<typeof headcountCreateSchema>;
