import { MoneyError } from "./money.error.js";

export type CurrencyDefinition = Readonly<{
  code: string;
  exponent: 0 | 2 | 3;
  symbol: string;
}>;

export const CURRENCIES = {
  AED: { code: "AED", exponent: 2, symbol: "د.إ" },
  AUD: { code: "AUD", exponent: 2, symbol: "A$" },
  BHD: { code: "BHD", exponent: 3, symbol: "د.ب" },
  CAD: { code: "CAD", exponent: 2, symbol: "C$" },
  CHF: { code: "CHF", exponent: 2, symbol: "CHF" },
  CNY: { code: "CNY", exponent: 2, symbol: "¥" },
  EUR: { code: "EUR", exponent: 2, symbol: "€" },
  GBP: { code: "GBP", exponent: 2, symbol: "£" },
  HKD: { code: "HKD", exponent: 2, symbol: "HK$" },
  INR: { code: "INR", exponent: 2, symbol: "₹" },
  JPY: { code: "JPY", exponent: 0, symbol: "¥" },
  KRW: { code: "KRW", exponent: 0, symbol: "₩" },
  KWD: { code: "KWD", exponent: 3, symbol: "د.ك" },
  NZD: { code: "NZD", exponent: 2, symbol: "NZ$" },
  SAR: { code: "SAR", exponent: 2, symbol: "ر.س" },
  SGD: { code: "SGD", exponent: 2, symbol: "S$" },
  USD: { code: "USD", exponent: 2, symbol: "$" },
} as const satisfies Record<string, CurrencyDefinition>;

export type SupportedCurrencyCode = keyof typeof CURRENCIES;

export function isSupportedCurrencyCode(
  currency: string,
): currency is SupportedCurrencyCode {
  return Object.hasOwn(CURRENCIES, currency);
}

export function getCurrencyDefinition(
  currency: string,
): (typeof CURRENCIES)[SupportedCurrencyCode] {
  if (!isSupportedCurrencyCode(currency)) {
    throw new MoneyError(
      `Unsupported currency: ${currency}`,
      "UNSUPPORTED_CURRENCY",
    );
  }

  return CURRENCIES[currency];
}
