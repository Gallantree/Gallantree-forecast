// One-shot seed: bootstrap a superadmin user so the admin panel is reachable
// before any other users exist.
//
// Usage:
//   npm run seed:superadmin -- brett@gallantree.com.au "Brett Hales"
//
// Idempotent: if a user with that email already exists, the user is upgraded
// to userType=superadmin, status=active. Otherwise a new user is inserted.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env.development.local" });

import { connectToDatabase } from "@/lib/db";
import { User } from "@/models";
import mongoose from "mongoose";

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const fullName = (process.argv[3] ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Usage: npm run seed:superadmin -- <email> [full name]");
    console.error("       email is required and must be valid");
    process.exit(1);
  }
  const [firstName, ...lastParts] = fullName.split(/\s+/);
  const lastName = lastParts.join(" ");

  await connectToDatabase();

  const now = new Date();
  const set: Record<string, unknown> = {
    userType: "superadmin",
    status: "active",
    updatedAt: now,
  };
  if (firstName) set.firstName = firstName;
  if (lastName) set.lastName = lastName;
  if (fullName) set.name = fullName;

  const result = await User.collection.findOneAndUpdate(
    { email },
    {
      $set: set,
      $setOnInsert: {
        email,
        emailVerified: null,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  const doc = result as unknown as { _id: { toString: () => string } } | null;
  if (doc) {
    console.log(
      `✓ Superadmin ready: ${email} (id=${doc._id.toString()}, userType=superadmin, status=active)`,
    );
  } else {
    console.log(`✓ Upserted superadmin: ${email}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("seed-superadmin failed:", err);
  process.exit(1);
});
