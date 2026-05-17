import { z } from "zod";
import { objectIdSchema } from "@/validators";

export const scenarioCreateSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: objectIdSchema.optional(),
});
export type ScenarioCreate = z.infer<typeof scenarioCreateSchema>;

export const scenarioParamsSchema = z.object({ id: objectIdSchema });
export type ScenarioParams = z.infer<typeof scenarioParamsSchema>;
