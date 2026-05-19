"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { auth, signIn } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Organisation, User } from "@/models";

async function requireSuperadmin() {
  const session = await auth();
  if (!session?.user?.email) return null;
  await connectToDatabase();
  const me = await User.findOne({ email: session.user.email })
    .select("userType")
    .lean<{ userType?: string }>();
  if (me?.userType !== "superadmin") return null;
  return session;
}

// ── User actions ────────────────────────────────────────────────────────────

export type CreateUserPayload = {
  firstName?: string;
  lastName?: string;
  email: string;
  mobileCountry?: string;
  mobileNumber?: string;
  userType: "superadmin" | "admin" | "viewer";
  designation?: string;
  organisationId?: string;
  membershipRole?: "admin" | "member";
  status: "active" | "pending" | "disabled";
  sendInvite?: boolean;
};

export async function createUser(
  payload: CreateUserPayload,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSuperadmin();
  if (!session) return { ok: false, error: "Not authorised" };

  const email = payload.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Invalid email" };
  }
  if (!["superadmin", "admin", "viewer"].includes(payload.userType)) {
    return { ok: false, error: "Invalid user type" };
  }
  if (!["active", "pending", "disabled"].includes(payload.status)) {
    return { ok: false, error: "Invalid status" };
  }

  await connectToDatabase();
  const existing = await User.findOne({ email }).lean();
  if (existing) return { ok: false, error: "A user with that email exists" };

  const fullName = [payload.firstName, payload.lastName]
    .map((s) => s?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  const doc: Record<string, unknown> = {
    email,
    name: fullName || undefined,
    firstName: payload.firstName?.trim() || undefined,
    lastName: payload.lastName?.trim() || undefined,
    userType: payload.userType,
    designation: payload.designation?.trim() || undefined,
    membershipRole: payload.membershipRole ?? "admin",
    status: payload.status,
  };
  if (payload.organisationId && Types.ObjectId.isValid(payload.organisationId)) {
    doc.organisationId = new Types.ObjectId(payload.organisationId);
  }
  if (payload.mobileNumber?.trim()) {
    doc.mobile = {
      country: payload.mobileCountry || "+61",
      number: payload.mobileNumber.trim(),
    };
  }

  await User.create(doc);

  // Send magic-link invite if requested (default for active users).
  if (payload.sendInvite !== false && payload.status === "active") {
    try {
      await signIn("email", { email, redirect: false });
    } catch {
      // Magic-link send failed — user is still created, they can request a
      // link manually from /login. Don't surface as an error.
    }
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export type UpdateUserPayload = Partial<CreateUserPayload> & {
  // Note: email is the lookup key and can't be changed via this action.
};

export async function updateUser(
  userId: string,
  patch: UpdateUserPayload,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSuperadmin();
  if (!session) return { ok: false, error: "Not authorised" };
  if (!Types.ObjectId.isValid(userId)) return { ok: false, error: "Invalid user id" };

  await connectToDatabase();
  const set: Record<string, unknown> = {};
  if (patch.firstName !== undefined) set.firstName = patch.firstName?.trim() || undefined;
  if (patch.lastName !== undefined) set.lastName = patch.lastName?.trim() || undefined;
  if (patch.firstName || patch.lastName) {
    set.name = [patch.firstName, patch.lastName].filter(Boolean).join(" ") || undefined;
  }
  if (patch.userType) set.userType = patch.userType;
  if (patch.status) set.status = patch.status;
  if (patch.designation !== undefined) set.designation = patch.designation?.trim() || undefined;
  if (patch.membershipRole) set.membershipRole = patch.membershipRole;
  if (patch.organisationId !== undefined) {
    set.organisationId =
      patch.organisationId && Types.ObjectId.isValid(patch.organisationId)
        ? new Types.ObjectId(patch.organisationId)
        : undefined;
  }
  if (patch.mobileNumber !== undefined) {
    set.mobile = patch.mobileNumber?.trim()
      ? { country: patch.mobileCountry || "+61", number: patch.mobileNumber.trim() }
      : undefined;
  }

  await User.updateOne({ _id: userId }, { $set: set });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function sendInvite(email: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSuperadmin();
  if (!session) return { ok: false, error: "Not authorised" };
  try {
    await signIn("email", { email, redirect: false });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Organisation actions ────────────────────────────────────────────────────

export type CreateOrgPayload = {
  name: string;
  status?: "active" | "pending" | "archived";
  notes?: string;
};

export async function createOrganisation(
  payload: CreateOrgPayload,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSuperadmin();
  if (!session) return { ok: false, error: "Not authorised" };
  const name = payload.name.trim();
  if (!name) return { ok: false, error: "Name is required" };
  await connectToDatabase();
  const existing = await Organisation.findOne({ name }).lean();
  if (existing) return { ok: false, error: "An organisation with that name exists" };
  await Organisation.create({
    name,
    status: payload.status ?? "active",
    notes: payload.notes?.trim() || undefined,
  });
  revalidatePath("/admin/organisations");
  return { ok: true };
}

export async function updateOrganisation(
  orgId: string,
  patch: Partial<CreateOrgPayload>,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSuperadmin();
  if (!session) return { ok: false, error: "Not authorised" };
  if (!Types.ObjectId.isValid(orgId)) return { ok: false, error: "Invalid id" };
  await connectToDatabase();
  const set: Record<string, unknown> = {};
  if (patch.name) set.name = patch.name.trim();
  if (patch.status) set.status = patch.status;
  if (patch.notes !== undefined) set.notes = patch.notes?.trim() || undefined;
  await Organisation.updateOne({ _id: orgId }, { $set: set });
  revalidatePath("/admin/organisations");
  return { ok: true };
}
