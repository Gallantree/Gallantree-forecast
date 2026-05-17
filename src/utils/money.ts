import Decimal from "decimal.js";
import { Types } from "mongoose";

/**
 * Money math helpers. NEVER use raw `+ - * /` on monetary or percentage values.
 * Storage is Mongoose `Decimal128`; in-process math is `decimal.js`.
 *
 * Convert at the boundary: API input -> Decimal -> compute -> Decimal128 -> store.
 */

export type Money = Decimal;

export const ZERO: Money = new Decimal(0);

export function money(value: Decimal.Value | Types.Decimal128): Money {
  if (value instanceof Types.Decimal128) return new Decimal(value.toString());
  return new Decimal(value);
}

export function toDecimal128(value: Money | Decimal.Value): Types.Decimal128 {
  const d = value instanceof Decimal ? value : new Decimal(value);
  return Types.Decimal128.fromString(d.toFixed(8));
}

export function sum(values: Money[]): Money {
  return values.reduce((acc, v) => acc.plus(v), ZERO);
}
