import { describe, it, expect } from "vitest";
import { money, sum, toDecimal128 } from "../src/utils/money";

describe("money", () => {
  it("avoids IEEE-754 drift", () => {
    expect(money("0.1").plus(money("0.2")).toString()).toBe("0.3");
  });

  it("sums an array exactly", () => {
    const total = sum([money("1.05"), money("2.20"), money("3.75")]);
    expect(total.toString()).toBe("7");
  });

  it("converts to Decimal128 with fixed precision", () => {
    const d128 = toDecimal128(money("1.23456789012"));
    expect(d128.toString()).toBe("1.23456789");
  });
});
