import { Types } from "mongoose";
import { type AuditAction, AuditLog } from "@/models";

interface WriteAuditParams {
  userId?: string;
  userEmail?: string;
  action: AuditAction;
  modelName: string;
  documentId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(params: WriteAuditParams): Promise<void> {
  try {
    await AuditLog.create({
      userId:
        params.userId && Types.ObjectId.isValid(params.userId)
          ? new Types.ObjectId(params.userId)
          : undefined,
      userEmail: params.userEmail,
      action: params.action,
      modelName: params.modelName,
      documentId: new Types.ObjectId(params.documentId),
      before: params.before,
      after: params.after,
      metadata: params.metadata,
    });
  } catch {
    // Audit logging is best-effort — never block the main operation.
  }
}
