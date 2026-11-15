import { describe, expect, it } from "vitest";
import {
  formatMinorToMajor,
  formatMoneyDisplay,
  formatPercentageUnits,
  getCurrencyExponent,
  parseMajorToMinor,
  parsePercentageUnits,
  PERCENTAGE_SCALE,
} from "./money";

describe("Exact Decimal Money Utilities", () => {
  it("determines correct exponent for different currencies", () => {
    expect(getCurrencyExponent("USD")).toBe(2);
    expect(getCurrencyExponent("EUR")).toBe(2);
    expect(getCurrencyExponent("INR")).toBe(2);
    expect(getCurrencyExponent("JPY")).toBe(0);
    expect(getCurrencyExponent("KRW")).toBe(0);
    expect(getCurrencyExponent("BHD")).toBe(3);
    expect(getCurrencyExponent("KWD")).toBe(3);
  });

  it("parses major units into integer minor units without floating-point errors", () => {
    // 0.10 + 0.20 in 2-decimal currency
    const ten = parseMajorToMinor("0.10", "USD");
    const twenty = parseMajorToMinor("0.20", "USD");
    expect(ten).toBe(10n);
    expect(twenty).toBe(20n);
    expect(ten! + twenty!).toBe(30n);

    // Standard cases
    expect(parseMajorToMinor("1000.00", "USD")).toBe(100000n);
    expect(parseMajorToMinor("7.25", "USD")).toBe(725n);
    expect(parseMajorToMinor("0", "USD")).toBe(0n);
    expect(parseMajorToMinor("0.05", "USD")).toBe(5n);

    // 0-decimal currency (JPY)
    expect(parseMajorToMinor("500", "JPY")).toBe(500n);
    expect(parseMajorToMinor("500.5", "JPY")).toBeNull(); // rejects fractional digits

    // 3-decimal currency (KWD)
    expect(parseMajorToMinor("1.500", "KWD")).toBe(1500n);
    expect(parseMajorToMinor("1.25", "KWD")).toBe(1250n);
    expect(parseMajorToMinor("1.1234", "KWD")).toBeNull(); // exceeds 3 decimals
  });

  it("rejects invalid money strings", () => {
    expect(parseMajorToMinor("-5.00", "USD")).toBeNull();
    expect(parseMajorToMinor("abc", "USD")).toBeNull();
    expect(parseMajorToMinor("10.00.00", "USD")).toBeNull();
    expect(parseMajorToMinor("10.555", "USD")).toBeNull(); // exceeds 2 decimals for USD
  });

  it("formats integer minor units back to exact major strings", () => {
    expect(formatMinorToMajor(100000n, "USD")).toBe("1000.00");
    expect(formatMinorToMajor(725n, "USD")).toBe("7.25");
    expect(formatMinorToMajor(5n, "USD")).toBe("0.05");
    expect(formatMinorToMajor(0n, "USD")).toBe("0.00");

    // JPY (0 decimals)
    expect(formatMinorToMajor(500n, "JPY")).toBe("500");

    // KWD (3 decimals)
    expect(formatMinorToMajor(1500n, "KWD")).toBe("1.500");
    expect(formatMinorToMajor(25n, "KWD")).toBe("0.025");
  });

  it("formats display with currency symbol", () => {
    expect(formatMoneyDisplay(1000n, "USD")).toBe("$10.00");
    expect(formatMoneyDisplay(250000n, "INR")).toBe("₹2500.00");
    expect(formatMoneyDisplay(500n, "JPY")).toBe("¥500");
  });

  it("parses and formats percentages up to 6 decimal places", () => {
    expect(parsePercentageUnits("100")).toBe(PERCENTAGE_SCALE);
    expect(parsePercentageUnits("100.000000")).toBe(PERCENTAGE_SCALE);
    expect(parsePercentageUnits("50")).toBe(50_000_000n);
    expect(parsePercentageUnits("33.333333")).toBe(33_333_333n);
    expect(parsePercentageUnits("66.666667")).toBe(66_666_667n);

    // Sum verification: 33.333333 + 66.666667 === 100%
    const p1 = parsePercentageUnits("33.333333")!;
    const p2 = parsePercentageUnits("66.666667")!;
    expect(p1 + p2).toBe(PERCENTAGE_SCALE);

    // Out of range or invalid
    expect(parsePercentageUnits("100.000001")).toBeNull();
    expect(parsePercentageUnits("-5")).toBeNull();
    expect(parsePercentageUnits("50.1234567")).toBeNull(); // 7 decimals exceeds limit

    // Format output
    expect(formatPercentageUnits(PERCENTAGE_SCALE)).toBe("100");
    expect(formatPercentageUnits(50_000_000n)).toBe("50");
    expect(formatPercentageUnits(33_333_333n)).toBe("33.333333");
  });
});

