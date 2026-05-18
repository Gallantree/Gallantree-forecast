import { z } from "zod";
import { decimalStringSchema, periodKeySchema } from "@/validators";

export const programFeeSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(["senior_mgmt", "subordinate_mgmt", "servicing", "other"]),
  basisAmount: decimalStringSchema,
  feeBps: z.number().min(0),
  accountCode: z.string().min(1).max(20),
});

export const programCreateSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["CRE_CLO", "CMBS", "MIT_FUND", "WAREHOUSE", "OTHER"]),
  dealSize: decimalStringSchema.optional(),
  faceValuePerNote: decimalStringSchema.optional(),
  startPeriodKey: periodKeySchema,
  endPeriodKey: periodKeySchema.optional(),
  notes: z.string().max(2000).optional(),
  fees: z.array(programFeeSchema).default([]),
});
export type ProgramCreate = z.infer<typeof programCreateSchema>;
