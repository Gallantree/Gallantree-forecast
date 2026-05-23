// Re-usable Vitest mocks for Next-only modules that server actions import.
//
// Without these, importing a `"use server"` file inside a vitest run blows up:
//   - `next/cache` tries to register a path-revalidation hook that only
//     exists inside a running Next server
//   - `next/navigation` redirect() throws by design (it's a control-flow
//     mechanism, not a return value)
//
// USAGE — `vi.mock()` is hoisted above all imports by vitest's transform, so
// these helpers must be CALLED at module top-level (before importing the
// action under test). The static `import` lines below are then rewritten by
// vitest to return the mock; `vi.mocked(...)` gives you the spy.
//
// Example:
//
//   import { mockNextCache } from "../helpers/next-mocks";
//   mockNextCache();
//   import { revalidatePath } from "next/cache";
//   import { createProgram } from "@/app/scenarios/[id]/_actions";
//
//   it("revalidates", async () => {
//     await createProgram(...);
//     expect(revalidatePath).toHaveBeenCalledWith("/scenarios/...");
//   });

import { vi } from "vitest";

/** Mock `next/cache` so `revalidatePath` / `revalidateTag` are inert spies. */
export function mockNextCache(): void {
  vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
  }));
}

/**
 * Mock `next/navigation` so `redirect()` records its target instead of
 * throwing the control-flow signal that only a real Next server understands.
 */
export function mockNextNavigation(): void {
  vi.mock("next/navigation", () => ({
    redirect: vi.fn(),
    notFound: vi.fn(),
  }));
}

/**
 * Mock the `@/lib/auth` module so server actions that check the current
 * user run under a deterministic identity. The default returns a
 * super_admin session; pass a factory to override per suite.
 */
export function mockAuth(
  factory: () => unknown = () => ({
    user: {
      id: "test-user-id",
      email: "test@example.com",
      userType: "super_admin",
    },
  }),
): void {
  vi.mock("@/lib/auth", () => ({
    auth: vi.fn(factory),
    signIn: vi.fn(),
    signOut: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
  }));
}

/**
 * Mock `@/lib/currentUser` to return a deterministic superadmin.
 * Prevents the next-auth → next/server import chain from blowing up in Vitest.
 */
export function mockCurrentUser(): void {
  vi.mock("@/lib/currentUser", () => ({
    getCurrentUser: vi.fn().mockResolvedValue({
      id: "000000000000000000000001",
      email: "test@example.com",
      userType: "superadmin",
      status: "active",
    }),
  }));
}

/**
 * Mock `@/lib/assertScenarioAccess` so all scenario access checks pass in
 * unit/integration tests. Tests that specifically exercise access control
 * should override this mock inline.
 */
export function mockScenarioAccess(): void {
  vi.mock("@/lib/assertScenarioAccess", () => ({
    assertScenarioAccess: vi.fn().mockResolvedValue({ ok: true, scenario: {} }),
  }));
}
