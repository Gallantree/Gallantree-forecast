import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export type OrganisationStatus = "active" | "pending" | "archived";

export interface IOrganisation {
  name: string;
  slug?: string; // optional human-friendly id
  status: OrganisationStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  _id?: Types.ObjectId;
}

const organisationSchema = new Schema<IOrganisation>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["active", "pending", "archived"],
      default: "active",
      required: true,
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

organisationSchema.index({ status: 1, updatedAt: -1 });

const Organisation = defineModel<IOrganisation>("Organisation", organisationSchema);
export default Organisation;
