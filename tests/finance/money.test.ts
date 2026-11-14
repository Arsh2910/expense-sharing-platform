import { describe, expect, it } from "vitest";
import {
  MAX_EXPENSE_MINOR_UNITS,
  MoneyError,
  absoluteMoney,
  addMoney,
  expenseMoney,
  formatMajorAmount,
  getCurrencyDefinition,
  money,
  negateMoney,
  nonNegativeMoney,
  parseMajorAmount,
  subtractMoney,
  sumMoney,
} from "../../src/modules/finance/index.js";

describe("money", () => {
  it("performs arithmetic entirely with bigint minor units", () => {
    const first = money(10_050n);
    const second = money(950n);

    expect(addMoney(first, second)).toBe(11_000n);
    expect(subtractMoney(first, second)).toBe(9_100n);
    expect(sumMoney([first, second, money(50n)])).toBe(11_050n);
    expect(negateMoney(second)).toBe(-950n);
    expect(absoluteMoney(money(-950n))).toBe(950n);
  });

  it("accepts zero for non-negative allocation amounts", () => {
    expect(nonNegativeMoney(0n)).toBe(0n);
  });

  it("rejects negative non-negative allocation amounts", () => {
    expect(() => nonNegativeMoney(-1n)).toThrowError(
      expect.objectContaining<Partial<MoneyError>>({ code: "NEGATIVE_AMOUNT" }),
    );
  });

  it("enforces the documented single-expense ceiling", () => {
    expect(expenseMoney(1n)).toBe(1n);
    expect(expenseMoney(MAX_EXPENSE_MINOR_UNITS)).toBe(
      MAX_EXPENSE_MINOR_UNITS,
    );

    for (const invalid of [0n, -1n, MAX_EXPENSE_MINOR_UNITS + 1n]) {
      expect(() => expenseMoney(invalid)).toThrowError(
        expect.objectContaining<Partial<MoneyError>>({
          code: "EXPENSE_AMOUNT_OUT_OF_RANGE",
        }),
      );
    }
  });

  it("stores explicit exponents for two, zero and three-decimal currencies", () => {
    expect(getCurrencyDefinition("INR").exponent).toBe(2);
    expect(getCurrencyDefinition("JPY").exponent).toBe(0);
    expect(getCurrencyDefinition("KWD").exponent).toBe(3);
  });

  it("rejects currencies outside the supported MVP table", () => {
    expect(() => getCurrencyDefinition("XYZ")).toThrowError(
      expect.objectContaining<Partial<MoneyError>>({
        code: "UNSUPPORTED_CURRENCY",
      }),
    );
  });

  it("parses major-unit strings without floating-point arithmetic", () => {
    expect(parseMajorAmount("1000.50", "INR")).toBe(100_050n);
    expect(parseMajorAmount("42", "JPY")).toBe(42n);
    expect(parseMajorAmount("1.234", "KWD")).toBe(1_234n);
    expect(parseMajorAmount("-8.05", "USD")).toBe(-805n);
  });

  it("rejects malformed and over-precise major-unit input", () => {
    for (const invalid of ["1e3", "1,000.00", " 1.00", "01.00", "NaN"]) {
      expect(() => parseMajorAmount(invalid, "USD")).toThrowError(
        expect.objectContaining<Partial<MoneyError>>({
          code: "INVALID_AMOUNT",
        }),
      );
    }

    expect(() => parseMajorAmount("1.001", "USD")).toThrowError(
      expect.objectContaining<Partial<MoneyError>>({
        code: "TOO_MANY_DECIMAL_PLACES",
      }),
    );
    expect(() => parseMajorAmount("1.0", "JPY")).toThrowError(
      expect.objectContaining<Partial<MoneyError>>({
        code: "TOO_MANY_DECIMAL_PLACES",
      }),
    );
  });

  it("formats minor units exactly for every supported exponent", () => {
    expect(formatMajorAmount(money(100_050n), "INR")).toBe("1000.50");
    expect(formatMajorAmount(money(42n), "JPY")).toBe("42");
    expect(formatMajorAmount(money(1_234n), "KWD")).toBe("1.234");
    expect(formatMajorAmount(money(-5n), "USD")).toBe("-0.05");
  });
});
