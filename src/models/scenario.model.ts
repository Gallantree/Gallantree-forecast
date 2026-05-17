import mongoose, { Schema, type Types } from "mongoose";

export interface IScenario {
  name: string;
  parentId?: Types.ObjectId;
  status: "draft" | "active" | "archived";
  lockedAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const scenarioSchema = new Schema<IScenario>(
  {
    name: { type: String, required: true, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Scenario" },
    status: { type: String, enum: ["draft", "active", "archived"], default: "draft" },
    lockedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

scenarioSchema.index({ parentId: 1 });
scenarioSchema.index({ status: 1, updatedAt: -1 });

const Scenario =
  mongoose.models.Scenario || mongoose.model<IScenario>("Scenario", scenarioSchema);

export default Scenario;
