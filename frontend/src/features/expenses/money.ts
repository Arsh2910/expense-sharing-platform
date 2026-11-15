export const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  AED: 2,
  AUD: 2,
  BHD: 3,
  CAD: 2,
  CHF: 2,
  CNY: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  INR: 2,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  NZD: 2,
  SAR: 2,
  SGD: 2,
  USD: 2,
};

export const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  AED: "د.إ",
  AUD: "A$",
  BHD: "د.ب",
  CAD: "C$",
  CHF: "CHF",
  CNY: "¥",
  EUR: "€",
  GBP: "£",
  HKD: "HK$",
  INR: "₹",
  JPY: "¥",
  KRW: "₩",
  KWD: "د.ك",
  NZD: "NZ$",
  SAR: "ر.س",
  SGD: "S$",
  USD: "$",
};

export const PERCENTAGE_SCALE = 100_000_000n; // 100% in fixed-point 1e-6 scale
export const MAX_EXPENSE_MINOR_UNITS = 10_000_000_000_000n;

export function getCurrencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency.toUpperCase()] ?? 2;
}

export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency;
}

/**
 * Parses a major-unit decimal string (e.g. "10.50", "0", "100") into integer minor units (BigInt).
 * Returns null if format is invalid or exceeds currency exponent.
 * Avoids any floating-point arithmetic.
 */
export function parseMajorToMinor(
  value: string,
  currency: string,
): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return null;

  const exponent = getCurrencyExponent(currency);
  const wholePart = match[1];
  const fractionPart = match[2] ?? "";

  if (fractionPart.length > exponent) {
    return null; // Exceeds currency decimal places
  }

  const scale = 10n ** BigInt(exponent);
  const wholeMinor = BigInt(wholePart) * scale;
  const fractionalMinor = fractionPart
    ? BigInt(fractionPart.padEnd(exponent, "0"))
    : 0n;

  return wholeMinor + fractionalMinor;
}

/**
 * Formats integer minor units to a plain major-unit decimal string (e.g. 1050n -> "10.50").
 * Accepts either bigint or number minor units and avoids floating-point math.
 */
export function formatMinorToMajor(
  minorUnits: bigint | number,
  currency: string,
): string {
  const minor =
    typeof minorUnits === "number"
      ? BigInt(Math.trunc(minorUnits))
      : minorUnits;
  const exponent = getCurrencyExponent(currency);
  const isNegative = minor < 0n;
  const absolute = isNegative ? -minor : minor;

  if (exponent === 0) {
    return (isNegative ? "-" : "") + absolute.toString();
  }

  const scale = 10n ** BigInt(exponent);
  const wholePart = absolute / scale;
  const fractionPart = (absolute % scale).toString().padStart(exponent, "0");

  return `${isNegative ? "-" : ""}${wholePart.toString()}.${fractionPart}`;
}

/**
 * Formats integer minor units for user display with currency code or symbol (e.g. "$10.50").
 * Accepts either bigint or number minor units.
 */
export function formatMoneyDisplay(
  minorUnits: bigint | number,
  currency: string,
): string {
  const minor =
    typeof minorUnits === "number"
      ? BigInt(Math.trunc(minorUnits))
      : minorUnits;
  const major = formatMinorToMajor(minor, currency);
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${major}`;
}

/**
 * Parses a percentage string with up to 6 decimal places into 1e-6 fixed point integer (BigInt).
 * Valid range: 0.000000 to 100.000000.
 * Returns null if invalid or out of range.
 */
export function parsePercentageUnits(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = /^(?:100(?:\.0{1,6})?|(?:0|[1-9]\d?)(?:\.(\d{1,6}))?)$/.exec(
    trimmed,
  );
  if (!match) return null;

  const [whole, fraction = ""] = trimmed.split(".");
  const wholeUnits = BigInt(whole) * 1_000_000n;
  const fractionUnits = BigInt(fraction.padEnd(6, "0") || "0");
  const result = wholeUnits + fractionUnits;

  if (result < 0n || result > PERCENTAGE_SCALE) {
    return null;
  }

  return result;
}

/**
 * Formats a fixed-point percentage BigInt into a clean string (up to 6 decimals, trimming trailing zeros).
 */
export function formatPercentageUnits(percentUnits: bigint): string {
  const whole = percentUnits / 1_000_000n;
  const fraction = percentUnits % 1_000_000n;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionString = fraction
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${whole.toString()}.${fractionString}`;
}

