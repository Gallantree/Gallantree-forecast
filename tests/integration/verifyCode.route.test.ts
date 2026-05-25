// Integration test for POST /api/auth/verify-code.
//
// Drives the route handler the way Next would (constructing a Request),
// against a real memory-Mongo so LoginCode + LoginActivity persistence is
// covered end-to-end. Covers: success path (URL returned + cookie set + row
// consumed), bad code (attempt counter + activity row), rate-limit (auto-
// consume after MAX_ATTEMPTS), missing/expired code, and malformed input.

import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// recordLoginActivity calls next/headers — stub it cleanly.
let headersStore: Record<string, string> = {};
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (k: string) => headersStore[k.toLowerCase()] ?? null,
  })),
}));

import { POST } from "@/app/api/auth/verify-code/route";
import {
  LOGIN_CODE_MAX_ATTEMPTS,
  normalizeLoginCode,
} from "@/lib/loginCodeConstants";
import { LoginActivity, LoginCode } from "@/models";
import { useMemoryMongo } from "../helpers/db";

function hashCode(canonical: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${canonical}`).digest("hex");
}

async function seedCode(opts: {
  email: string;
  code: string;
  loginUrl?: string;
  expiresAt?: Date;
  attempts?: number;
  consumedAt?: Date | null;
}) {
  const canonical = normalizeLoginCode(opts.code);
  const codeSalt = crypto.randomBytes(8).toString("hex");
  return LoginCode.create({
    email: opts.email.toLowerCase(),
    codeHash: hashCode(canonical, codeSalt),
    codeSalt,
    loginUrl: opts.loginUrl ?? "https://example.com/api/auth/callback/email?token=abc",
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 10 * 60_000),
    attempts: opts.attempts ?? 0,
    consumedAt: opts.consumedAt ?? null,
  });
}

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/auth/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/verify-code", () => {
  useMemoryMongo();

  beforeEach(() => {
    headersStore = {};
  });

  it("accepts the correct code, returns loginUrl, consumes the row, and sets the auth_method cookie", async () => {
    const code = "ACDE-FHJK-MNPQ";
    const row = await seedCode({
      email: "alice@example.com",
      code,
      loginUrl: "https://example.com/api/auth/callback/email?token=zzz",
    });
    const res = await POST(makeReq({ email: "alice@example.com", code }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; loginUrl: string };
    expect(body.ok).toBe(true);
    expect(body.loginUrl).toBe("https://example.com/api/auth/callback/email?token=zzz");

    // Cookie carries the method tag so events.signIn can mark it as code-based.
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("auth_method=code");
    expect(setCookie).toContain("HttpOnly");

    // Row is consumed; can't be replayed.
    const reloaded = await LoginCode.findById(row._id).lean();
    expect(reloaded?.consumedAt).toBeTruthy();
  });

  it("normalises lower-case input and accepts it", async () => {
    await seedCode({ email: "alice@example.com", code: "ACDE-FHJK-MNPQ" });
    const res = await POST(makeReq({ email: "alice@example.com", code: "acde-fhjk-mnpq" }));
    expect(res.status).toBe(200);
  });

  it("rejects a wrong code, increments attempts, and records a failure activity row", async () => {
    const row = await seedCode({ email: "alice@example.com", code: "ACDE-FHJK-MNPQ" });
    const res = await POST(makeReq({ email: "alice@example.com", code: "QQQQ-QQQQ-QQQQ" }));
    expect(res.status).toBe(400);
    const reloaded = await LoginCode.findById(row._id).lean();
    expect(reloaded?.attempts).toBe(1);
    expect(reloaded?.consumedAt).toBeNull();
    const failure = await LoginActivity.findOne({ outcome: "failure" }).lean();
    expect(failure?.reason).toBe("bad-code");
    expect(failure?.method).toBe("code");
  });

  it("consumes the row and records rate-limited after MAX_ATTEMPTS bad submissions", async () => {
    const row = await seedCode({
      email: "alice@example.com",
      code: "ACDE-FHJK-MNPQ",
      attempts: LOGIN_CODE_MAX_ATTEMPTS,
    });
    const res = await POST(makeReq({ email: "alice@example.com", code: "ACDE-FHJK-MNPQ" }));
    expect(res.status).toBe(400);
    const reloaded = await LoginCode.findById(row._id).lean();
    expect(reloaded?.consumedAt).toBeTruthy(); // burned even though the code was correct
    const failure = await LoginActivity.findOne({ reason: "rate-limited" }).lean();
    expect(failure).toBeTruthy();
  });

  it("returns 400 when no active code exists for the email", async () => {
    const res = await POST(makeReq({ email: "nobody@example.com", code: "ACDE-FHJK-MNPQ" }));
    expect(res.status).toBe(400);
    const failure = await LoginActivity.findOne({ reason: "no-active-code" }).lean();
    expect(failure?.email).toBe("nobody@example.com");
  });

  it("returns 400 when the only code on file has already been consumed", async () => {
    await seedCode({
      email: "alice@example.com",
      code: "ACDE-FHJK-MNPQ",
      consumedAt: new Date(),
    });
    const res = await POST(makeReq({ email: "alice@example.com", code: "ACDE-FHJK-MNPQ" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the code on file has expired", async () => {
    await seedCode({
      email: "alice@example.com",
      code: "ACDE-FHJK-MNPQ",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const res = await POST(makeReq({ email: "alice@example.com", code: "ACDE-FHJK-MNPQ" }));
    expect(res.status).toBe(400);
  });

  it("rejects malformed input without touching the database", async () => {
    await seedCode({ email: "alice@example.com", code: "ACDE-FHJK-MNPQ" });
    // Missing dashes, wrong length, excluded characters — all rejected pre-DB.
    for (const code of ["", "not-a-code", "ABCDEF", "AAAA-AAAA-AAAA-AAAA", "0000-0000-0000"]) {
      const res = await POST(makeReq({ email: "alice@example.com", code }));
      expect(res.status).toBe(400);
    }
    // No activity rows written for purely-malformed input — those bail before
    // we know which email's record to attribute to.
    const failureCount = await LoginActivity.countDocuments({ outcome: "failure" });
    expect(failureCount).toBe(0);
  });

  it("rejects non-string fields and unparseable bodies", async () => {
    const r1 = await POST(makeReq({ email: 123, code: "ACDE-FHJK-MNPQ" }));
    expect(r1.status).toBe(400);
    const r2 = await POST(
      new Request("http://localhost/api/auth/verify-code", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(r2.status).toBe(400);
  });

  it("uses the most recent unconsumed code when multiple exist", async () => {
    // Older, valid but stale row — should be ignored in favour of newest.
    await seedCode({
      email: "alice@example.com",
      code: "ACDE-FHJK-MNPQ",
      expiresAt: new Date(Date.now() + 60_000),
    });
    // Small delay so createdAt strictly orders.
    await new Promise((r) => setTimeout(r, 5));
    await seedCode({
      email: "alice@example.com",
      code: "QQQQ-RRRR-TTTT",
      loginUrl: "https://example.com/newest",
    });
    const res = await POST(makeReq({ email: "alice@example.com", code: "QQQQ-RRRR-TTTT" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { loginUrl: string };
    expect(body.loginUrl).toBe("https://example.com/newest");
  });
});
