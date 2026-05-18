const AUD0 = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

const AUD2 = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});

const NUM0 = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 });
const NUM2 = new Intl.NumberFormat("en-AU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtMoney0(value: string | number): string {
  return AUD0.format(typeof value === "string" ? Number(value) : value);
}

export function fmtMoney2(value: string | number): string {
  return AUD2.format(typeof value === "string" ? Number(value) : value);
}

export function fmtMoney(value: string | number): string {
  // Default money formatter — 2dp, thousand-separated, AUD currency symbol.
  return AUD2.format(typeof value === "string" ? Number(value) : value);
}

export function fmtNum0(value: string | number): string {
  return NUM0.format(typeof value === "string" ? Number(value) : value);
}

export function fmtNum2(value: string | number): string {
  return NUM2.format(typeof value === "string" ? Number(value) : value);
}

/**
 * Format a number for prefill into a text input: thousand-separated, exactly
 * 2 decimal places. e.g. 1160000000 → "1,160,000,000.00". Empty / NaN → "".
 */
export function fmtMoneyInput(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "";
  return NUM2.format(n);
}

/**
 * Strip thousand-separator commas and whitespace from a decimal-bearing input,
 * returning a string suitable for `toDecimal128`. Empty / invalid → "0".
 */
export function parseDecimalInput(value: string | undefined | null): string {
  if (!value) return "0";
  const stripped = String(value).replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return "0";
  return stripped;
}

/**
 * Strip trailing zeros from a stringified decimal, useful when prefilling form
 * inputs from Decimal128.toString() — which pads to the stored precision (e.g.
 * "1160000000.00000000" → "1160000000", "12.5000" → "12.5", "0E-8" → "0").
 */
export function cleanDecimal(value: string | undefined | null): string {
  if (value === undefined || value === null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  // Normalise via Number first so "0E-8" → 0; then back to string.
  // toString() on Number gives "1160000000" not "1.16e+9" for typical sizes.
  // For very small fractions Number still does the right thing without padding.
  return String(n);
}

export function fmtPercent(value: string | number, decimals = 2): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return `0.${"0".repeat(decimals)}%`;
  return `${n.toFixed(decimals)}%`;
}
