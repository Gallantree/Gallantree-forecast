// Unit tests for the side-effect-free login-code constants module.

import { describe, expect, it } from "vitest";
import {
  LOGIN_CODE_CHARS,
  LOGIN_CODE_FORMAT_REGEX,
  LOGIN_CODE_FORMATTED_LENGTH,
  LOGIN_CODE_LENGTH,
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_SEGMENT_LENGTH,
  normalizeLoginCode,
} from "@/lib/loginCodeConstants";

describe("loginCodeConstants", () => {
  it("has a self-consistent shape (12 chars in 3 segments of 4)", () => {
    expect(LOGIN_CODE_LENGTH).toBe(12);
    expect(LOGIN_CODE_SEGMENT_LENGTH).toBe(4);
    expect(LOGIN_CODE_LENGTH % LOGIN_CODE_SEGMENT_LENGTH).toBe(0);
    // 12 chars + 2 dashes = 14
    expect(LOGIN_CODE_FORMATTED_LENGTH).toBe(14);
    expect(LOGIN_CODE_MAX_ATTEMPTS).toBeGreaterThan(0);
  });

  it("excludes visually confusable characters", () => {
    // 0 O 1 I L 2 Z 5 S 6 G 8 B are explicitly off-limits to avoid typos.
    for (const ch of ["0", "O", "1", "I", "L", "2", "Z", "5", "S", "6", "G", "8", "B"]) {
      expect(LOGIN_CODE_CHARS).not.toContain(ch);
    }
  });

  describe("LOGIN_CODE_FORMAT_REGEX", () => {
    it("accepts well-formed codes", () => {
      expect(LOGIN_CODE_FORMAT_REGEX.test("ACDE-FHJK-MNPQ")).toBe(true);
      expect(LOGIN_CODE_FORMAT_REGEX.test("3479-ACDE-FHJK")).toBe(true);
    });

    it("rejects malformed codes", () => {
      // Wrong segment count
      expect(LOGIN_CODE_FORMAT_REGEX.test("ACDE-FHJK")).toBe(false);
      expect(LOGIN_CODE_FORMAT_REGEX.test("ACDE-FHJK-MNPQ-RSTU")).toBe(false);
      // Missing dashes
      expect(LOGIN_CODE_FORMAT_REGEX.test("ACDEFHJKMNPQ")).toBe(false);
      // Lowercase (regex requires uppercase post-normalize)
      expect(LOGIN_CODE_FORMAT_REGEX.test("acde-fhjk-mnpq")).toBe(false);
      // Contains excluded chars
      expect(LOGIN_CODE_FORMAT_REGEX.test("ACDE-FHJK-MNP0")).toBe(false); // 0
      expect(LOGIN_CODE_FORMAT_REGEX.test("ACDE-FHJK-MNPI")).toBe(false); // I
      // Empty / nonsense
      expect(LOGIN_CODE_FORMAT_REGEX.test("")).toBe(false);
      expect(LOGIN_CODE_FORMAT_REGEX.test("not-a-code")).toBe(false);
    });
  });

  describe("normalizeLoginCode", () => {
    it("strips dashes and whitespace", () => {
      expect(normalizeLoginCode("ACDE-FHJK-MNPQ")).toBe("ACDEFHJKMNPQ");
      expect(normalizeLoginCode("ACDE FHJK MNPQ")).toBe("ACDEFHJKMNPQ");
      expect(normalizeLoginCode(" ACDE - FHJK - MNPQ ")).toBe("ACDEFHJKMNPQ");
    });

    it("uppercases lowercase input", () => {
      expect(normalizeLoginCode("acde-fhjk-mnpq")).toBe("ACDEFHJKMNPQ");
    });

    it("is idempotent on already-canonical input", () => {
      const canonical = "ACDEFHJKMNPQ";
      expect(normalizeLoginCode(canonical)).toBe(canonical);
      expect(normalizeLoginCode(normalizeLoginCode("acde-fhjk-mnpq"))).toBe(canonical);
    });
  });
});
