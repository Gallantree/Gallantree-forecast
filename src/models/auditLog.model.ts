import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export type AuditAction = "create" | "update" | "delete" | "restore";

export interface IAuditLog {
  userId?: Types.ObjectId;
  userEmail?: string;
  action: AuditAction;
  modelName: string;
  documentId: Types.ObjectId;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    userEmail: { type: String },
    action: { type: String, enum: ["create", "update", "delete", "restore"], required: true },
    modelName: { type: String, required: true },
    documentId: { type: Schema.Types.ObjectId, required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ modelName: 1, documentId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });

const AuditLog = defineModel<IAuditLog>("AuditLog", auditLogSchema);
export default AuditLog;
