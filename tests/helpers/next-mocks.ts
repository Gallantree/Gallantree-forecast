// Re-usable Vitest mocks for Next-only modules that server actions import.
//
// Without these, importing a `"use server"` file inside a vitest run blows up:
//   - `next/cache` tries to register a path-revalidation hook that only
//     exists inside a running Next server
//   - `next/navigation` redirect() throws by design (it's a control-flow
//     mechanism, not a return value)
//
// Each helper returns the corresponding spy(s) so tests can assert on them.

import { vi, type Mock } from "vitest";

/**
 * Mocks `next/cache`'s `revalidatePath` and `revalidateTag`. Call once at the
 * top of a test file before importing any server-action module. Returns
 * accessors that resolve to the live spy on each invocation.
 */
export function mockNextCache(): {
  revalidatePath: () => Mock;
  revalidateTag: () => Mock;
} {
  vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
  }));
  return {
    revalidatePath: () =>
      (vi.mocked(require("next/cache")).revalidatePath as unknown) as Mock,
    revalidateTag: () =>
      (vi.mocked(require("next/cache")).revalidateTag as unknown) as Mock,
  };
}

/**
 * Mocks `next/navigation`'s `redirect` so it records the target URL instead
 * of throwing. `redirect()` in production throws a control-flow signal that
 * Next intercepts at the server boundary — under vitest we want to assert
 * which URL the action wanted to send the user to.
 */
export function mockNextNavigation(): { redirect: () => Mock } {
  vi.mock("next/navigation", () => ({
    redirect: vi.fn(),
    notFound: vi.fn(),
  }));
  return {
    redirect: () =>
      (vi.mocked(require("next/navigation")).redirect as unknown) as Mock,
  };
}

/**
 * Mocks the auth() helper so server actions that check the current user can
 * run under a deterministic identity. Default mock returns a super_admin
 * session; pass your own factory to override per-test.
 */
export function mockAuth(
  factory: () => unknown = () => ({
    user: { id: "test-user-id", email: "test@example.com", userType: "super_admin" },
  }),
): void {
  vi.mock("@/lib/auth", () => ({
    auth: vi.fn(factory),
    signIn: vi.fn(),
    signOut: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
  }));
}
