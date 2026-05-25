// Integration tests for the login-activity recorder. Memory-Mongo backed.
//
// Covers: UA parsing for the major browser/OS combos, IP extraction from
// x-forwarded-for vs x-real-ip, linking to a User document when one exists,
// and graceful handling when `next/headers` is unavailable.

import { beforeEach, describe, expect, it, vi } from "vitest";

// next/headers throws outside a request scope — return a stub instead so
// recordLoginActivity can pull headers per test.
let headersStore: Record<string, string> = {};
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (k: string) => headersStore[k.toLowerCase()] ?? null,
  })),
}));

import { recordLoginActivity } from "@/lib/loginActivity";
import { LoginActivity, User } from "@/models";
import { useMemoryMongo } from "../helpers/db";

function setHeaders(h: Record<string, string>) {
  headersStore = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
}

describe("recordLoginActivity", () => {
  useMemoryMongo();

  beforeEach(() => {
    headersStore = {};
  });

  it("persists a success row with parsed Chrome + macOS + xff IP", async () => {
    setHeaders({
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    await recordLoginActivity({
      email: "alice@example.com",
      method: "link",
      outcome: "success",
    });

    const rows = await LoginActivity.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "alice@example.com",
      method: "link",
      outcome: "success",
      ip: "203.0.113.10", // only the first forwarded hop
      browser: "Chrome",
      os: "macOS",
    });
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    setHeaders({
      "x-real-ip": "198.51.100.5",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0",
    });
    await recordLoginActivity({ email: "bob@example.com", method: "code", outcome: "success" });
    const row = await LoginActivity.findOne({ email: "bob@example.com" }).lean();
    expect(row?.ip).toBe("198.51.100.5");
    expect(row?.browser).toBe("Firefox");
    expect(row?.os).toBe("Windows");
  });

  it("parses Edge before Chrome (Edge UA strings contain both)", async () => {
    setHeaders({
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    });
    await recordLoginActivity({ email: "carol@example.com", method: "link", outcome: "success" });
    const row = await LoginActivity.findOne({ email: "carol@example.com" }).lean();
    expect(row?.browser).toBe("Edge");
  });

  it("parses iOS Safari", async () => {
    setHeaders({
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
    });
    await recordLoginActivity({ email: "dave@example.com", method: "link", outcome: "success" });
    const row = await LoginActivity.findOne({ email: "dave@example.com" }).lean();
    expect(row?.browser).toBe("Safari");
    expect(row?.os).toBe("iOS");
  });

  it("links userId when a User document exists for the email", async () => {
    const user = await User.create({
      email: "eve@example.com",
      userType: "admin",
      status: "active",
    });
    await recordLoginActivity({
      email: "eve@example.com",
      method: "google",
      outcome: "success",
    });
    const row = await LoginActivity.findOne({ email: "eve@example.com" }).lean();
    expect(row?.userId?.toString()).toBe(user._id.toString());
  });

  it("leaves userId undefined when no matching user exists", async () => {
    setHeaders({ "user-agent": "x" });
    await recordLoginActivity({
      email: "ghost@example.com",
      method: "link",
      outcome: "failure",
      reason: "unknown-email",
    });
    const row = await LoginActivity.findOne({ email: "ghost@example.com" }).lean();
    expect(row?.userId).toBeUndefined();
    expect(row?.outcome).toBe("failure");
    expect(row?.reason).toBe("unknown-email");
  });

  it("prefers explicit opts.ip / opts.userAgent over headers()", async () => {
    setHeaders({
      "x-forwarded-for": "203.0.113.10",
      "user-agent": "Mozilla/5.0 (Macintosh) Chrome/120",
    });
    await recordLoginActivity({
      email: "frank@example.com",
      method: "code",
      outcome: "failure",
      reason: "bad-code",
      ip: "10.20.30.40",
      userAgent: "Mozilla/5.0 (Linux) Firefox/120",
    });
    const row = await LoginActivity.findOne({ email: "frank@example.com" }).lean();
    expect(row?.ip).toBe("10.20.30.40");
    expect(row?.browser).toBe("Firefox");
    expect(row?.os).toBe("Linux");
  });

  it("lowercases the email regardless of caller casing", async () => {
    await recordLoginActivity({
      email: "MixedCase@Example.COM",
      method: "link",
      outcome: "success",
    });
    const row = await LoginActivity.findOne({}).lean();
    expect(row?.email).toBe("mixedcase@example.com");
  });

  it("never throws even when the DB write fails", async () => {
    // Force a write failure by passing an invalid method value at runtime —
    // the enum constraint rejects it. Recorder catches and warns.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      recordLoginActivity({
        email: "ok@example.com",
        method: "not-a-method" as unknown as "link",
        outcome: "success",
      }),
    ).resolves.toBeUndefined();
    warnSpy.mockRestore();
  });
});
