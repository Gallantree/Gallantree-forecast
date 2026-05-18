import { z } from "zod";
import { decimalStringSchema, periodKeySchema } from "@/validators";

export const headcountCreateSchema = z.object({
  personName: z.string().min(1).max(120).optional(),
  role: z.string().min(1).max(120),
  accountCode: z.string().min(1).max(20),
  employmentType: z.enum(["full_time", "part_time", "contractor"]).default("full_time"),
  ftePct: decimalStringSchema,
  band: z.number().int().min(1).max(11).optional(),
  tier: z.number().int().min(1).max(4).optional(),
  startPeriodKey: periodKeySchema,
  endPeriodKey: periodKeySchema.optional(),
  salaryAnnual: decimalStringSchema,
  superPct: decimalStringSchema.optional(),
  onCostPct: decimalStringSchema,
  salaryGrowthPctAnnual: decimalStringSchema.optional(),
});
export type HeadcountCreate = z.infer<typeof headcountCreateSchema>;
