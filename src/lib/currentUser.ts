// Server-side helper: resolve the current user (or null) for header avatars,
// access checks, etc. Reads the JWT-backed session and looks up the matching
// User document for fields not on the token (firstName/lastName).

import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models";

export interface CurrentUser {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  userType: "superadmin" | "admin" | "viewer";
  status: "active" | "pending" | "disabled";
  organisationId?: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  await connectToDatabase();
  const u = await User.findOne({ email: email.toLowerCase() })
    .select("email firstName lastName name userType status organisationId")
    .lean<{
      _id: { toString: () => string };
      email: string;
      firstName?: string;
      lastName?: string;
      name?: string;
      userType?: string;
      status?: string;
      organisationId?: { toString: () => string };
    }>();
  if (!u) return null;
  return {
    id: u._id.toString(),
    email: u.email,
    name: u.name,
    firstName: u.firstName,
    lastName: u.lastName,
    userType: (u.userType ?? "viewer") as CurrentUser["userType"],
    status: (u.status ?? "active") as CurrentUser["status"],
    organisationId: u.organisationId?.toString(),
  };
}
