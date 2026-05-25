// Side-effect-free constants shared by the code generator (auth.ts, Node-only)
// and the verify-code route. Safe to import from anywhere.

export const DEFAULT_LOGIN_CODE_EXPIRY_MINUTES = 10;

/** Code length, dashes excluded. */
export const LOGIN_CODE_LENGTH = 12;

/** Segment length for display formatting (XXXX-XXXX-XXXX). Must divide LOGIN_CODE_LENGTH. */
export const LOGIN_CODE_SEGMENT_LENGTH = 4;

/** Formatted code length including dashes. */
export const LOGIN_CODE_FORMATTED_LENGTH =
  LOGIN_CODE_LENGTH + LOGIN_CODE_LENGTH / LOGIN_CODE_SEGMENT_LENGTH - 1;

/** Reduced alphanumeric set — excludes visually confusable characters (0/O, 1/I/L, 2/Z, 5/S, 6/G, 8/B). */
export const LOGIN_CODE_CHARS = "3479ACDEFHJKMNPQRTUVWXY";

/** Max code-entry attempts per LoginCode row before the row is invalidated. */
export const LOGIN_CODE_MAX_ATTEMPTS = 5;

export const LOGIN_CODE_FORMAT_REGEX = new RegExp(
  `^[${LOGIN_CODE_CHARS}]{${LOGIN_CODE_SEGMENT_LENGTH}}(-[${LOGIN_CODE_CHARS}]{${LOGIN_CODE_SEGMENT_LENGTH}}){${LOGIN_CODE_LENGTH / LOGIN_CODE_SEGMENT_LENGTH - 1}}$`,
);

/** Strip dashes/whitespace and uppercase for comparison. */
export function normalizeLoginCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}
