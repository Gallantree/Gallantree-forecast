// Dedicated native-driver MongoClient for the Auth.js adapter.
//
// The rest of the app uses Mongoose (src/lib/db.ts), but @auth/mongodb-adapter
// wants a plain MongoClient with its own connection pool. Mixing the two is
// well-supported by MongoDB — both point at the same database, so the auth
// collections (users, sessions, verification_tokens) sit alongside our
// Mongoose-managed collections without conflict.
//
// We cache the connection promise at module scope so Next.js's
// re-evaluations don't open a new pool per request.

import { MongoClient } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var __authMongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  if (!global.__authMongoClientPromise) {
    const client = new MongoClient(uri);
    global.__authMongoClientPromise = client.connect();
  }
  return global.__authMongoClientPromise;
}

export const authClientPromise: Promise<MongoClient> = getClientPromise();
