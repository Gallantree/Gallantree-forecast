// Ownership check for scenario routes and actions.
//
// Rules:
//   - Superadmins can access any scenario.
//   - If the scenario has no organisationId (legacy/unseeded data), any
//     authenticated user may access it — avoids breaking existing records.
//   - Otherwise, the requesting user's organisationId must match.
//
// Returns the scenario doc on success, throws with an appropriate HTTP-status-
// style error on failure. Callers should call notFound() or return 403 on
// error.

import { Types } from "mongoose";
import { Scenario } from "@/models";
import type { CurrentUser } from "./currentUser";

export type ScenarioAccessError = "not_found" | "forbidden";

interface AccessResult {
  ok: true;
  scenario: { _id: Types.ObjectId; organisationId?: Types.ObjectId; [key: string]: unknown };
}
interface AccessFail {
  ok: false;
  reason: ScenarioAccessError;
}

export async function assertScenarioAccess(
  scenarioId: string,
  user: CurrentUser | null,
): Promise<AccessResult | AccessFail> {
  if (!user) return { ok: false, reason: "forbidden" };
  if (!Types.ObjectId.isValid(scenarioId)) return { ok: false, reason: "not_found" };

  const scenario = await Scenario.findOne({ _id: scenarioId, deletedAt: null })
    .select("organisationId")
    .lean<{ _id: Types.ObjectId; organisationId?: Types.ObjectId }>();

  if (!scenario) return { ok: false, reason: "not_found" };

  // Superadmins bypass all ownership checks.
  if (user.userType === "superadmin") return { ok: true, scenario };

  // Legacy scenario with no org — open to all authenticated users.
  if (!scenario.organisationId) return { ok: true, scenario };

  // Org-level isolation.
  if (!user.organisationId) return { ok: false, reason: "forbidden" };
  if (scenario.organisationId.toString() !== user.organisationId) {
    return { ok: false, reason: "forbidden" };
  }

  return { ok: true, scenario };
}
