import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

// User type controls platform-wide permission. `superadmin` can manage other
// users and organisations; `admin` can use the app within their org; `viewer`
// is read-only.
export type UserType = "superadmin" | "admin" | "viewer";
export type UserStatus = "active" | "pending" | "disabled";
export type MembershipRole = "admin" | "member";

export interface IUser {
  // Auth.js adapter fields (the MongoDB adapter writes these on the `users`
  // collection — keep their names + shapes intact).
  email: string;
  emailVerified?: Date | null;
  name?: string;
  image?: string;

  // Gallantree-specific profile fields.
  firstName?: string;
  lastName?: string;
  mobile?: {
    country: string; // e.g. "+61"
    number: string; // local number without country code
  };
  userType: UserType;
  designation?: string;
  organisationId?: Types.ObjectId;
  membershipRole?: MembershipRole;
  status: UserStatus;
  lastLogin?: Date;

  createdAt: Date;
  updatedAt: Date;
  _id?: Types.ObjectId;
}

const userSchema = new Schema<IUser>(
  {
    // Auth.js adapter compatibility — these fields are written/read by
    // @auth/mongodb-adapter. Don't rename or remove.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    emailVerified: { type: Date, default: null },
    name: { type: String, trim: true },
    image: { type: String, trim: true },

    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    mobile: {
      country: { type: String, trim: true },
      number: { type: String, trim: true },
    },
    userType: {
      type: String,
      enum: ["superadmin", "admin", "viewer"],
      default: "admin",
      required: true,
    },
    designation: { type: String, trim: true },
    organisationId: { type: Schema.Types.ObjectId, ref: "Organisation" },
    membershipRole: { type: String, enum: ["admin", "member"], default: "admin" },
    status: {
      type: String,
      enum: ["active", "pending", "disabled"],
      default: "active",
      required: true,
    },
    lastLogin: { type: Date },
  },
  { timestamps: true, collection: "users" },
);

userSchema.index({ organisationId: 1, status: 1 });
userSchema.index({ userType: 1, status: 1 });

const User = defineModel<IUser>("User", userSchema);
export default User;
