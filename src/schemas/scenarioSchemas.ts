import { z } from "zod";
import { objectIdSchema, decimalStringSchema } from "@/validators";

export const scenarioCreateSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: objectIdSchema.optional(),
  dsoDays: decimalStringSchema.optional(),
  dpoDays: decimalStringSchema.optional(),
  taxRatePct: decimalStringSchema.optional(),
  openingCash: decimalStringSchema.optional(),
  openingEquity: decimalStringSchema.optional(),
  defaultCpiPct: decimalStringSchema.optional(),
  defaultSuperPct: decimalStringSchema.optional(),
});
export type ScenarioCreate = z.infer<typeof scenarioCreateSchema>;

export const scenarioParamsSchema = z.object({ id: objectIdSchema });
export type ScenarioParams = z.infer<typeof scenarioParamsSchema>;
