// In-memory MongoDB lifecycle for integration tests.
//
// Spins up a real mongod process via mongodb-memory-server inside the test
// suite, wires Mongoose to it, and tears it down at the end. Collections are
// cleared between tests so suites stay deterministic without paying the cost
// of restarting the binary.
//
// Usage:
//   import { useMemoryMongo } from "../helpers/db";
//   describe("my repo", () => {
//     useMemoryMongo();
//     // ...tests...
//   });
//
// The Mongoose `connectToDatabase()` cache in src/lib/db.ts is reset on
// teardown so a subsequent suite gets a fresh connection.

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll } from "vitest";

let mongod: MongoMemoryServer | null = null;

/**
 * Mount memory-Mongo lifecycle hooks onto the current describe() block.
 *
 * @param opts.clearBetweenTests defaults to true. When false, data persists
 *   across tests within the suite (useful for building up fixtures once).
 */
export function useMemoryMongo(opts: { clearBetweenTests?: boolean } = {}): void {
  const clearBetweenTests = opts.clearBetweenTests ?? true;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGODB_URI = uri;
    // Reset the connectToDatabase() cache from src/lib/db.ts so the test
    // suite always reconnects to the freshly-minted memory server rather
    // than an unrelated stale connection from a previous run.
    const g = globalThis as unknown as {
      mongooseCache?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
    };
    g.mongooseCache = { conn: null, promise: null };
    await mongoose.connect(uri, { bufferCommands: false });
  }, 60_000);

  afterEach(async () => {
    if (!clearBetweenTests) return;
    if (mongoose.connection.readyState !== 1) return;
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) {
      await mongod.stop();
      mongod = null;
    }
  });
}
