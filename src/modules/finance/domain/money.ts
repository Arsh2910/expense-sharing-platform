import { getCurrencyDefinition } from "./currency.js";
import { MoneyError } from "./money.error.js";

declare const moneyBrand: unique symbol;

export type Money = bigint & {
  readonly [moneyBrand]: "Money";
};

export const MAX_EXPENSE_MINOR_UNITS = 10_000_000_000_000n;

export function money(minorUnits: bigint): Money {
  return minorUnits as Money;
}

export function nonNegativeMoney(minorUnits: bigint): Money {
  if (minorUnits < 0n) {
    throw new MoneyError("Amount cannot be negative", "NEGATIVE_AMOUNT");
  }

  return money(minorUnits);
}

export function expenseMoney(minorUnits: bigint): Money {
  if (minorUnits <= 0n || minorUnits > MAX_EXPENSE_MINOR_UNITS) {
    throw new MoneyError(
      `Expense amount must be between 1 and ${MAX_EXPENSE_MINOR_UNITS} minor units`,
      "EXPENSE_AMOUNT_OUT_OF_RANGE",
    );
  }

  return money(minorUnits);
}

export function addMoney(left: Money, right: Money): Money {
  return money(left + right);
}

export function subtractMoney(left: Money, right: Money): Money {
  return money(left - right);
}

export function sumMoney(values: Iterable<Money>): Money {
  let total = 0n;

  for (const value of values) {
    total += value;
  }

  return money(total);
}

export function negateMoney(value: Money): Money {
  return money(-value);
}

export function absoluteMoney(value: Money): Money {
  return value < 0n ? negateMoney(value) : value;
}

export function parseMajorAmount(
  value: string,
  currency: string,
): Money {
  const definition = getCurrencyDefinition(currency);
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);

  if (!match) {
    throw new MoneyError(
      "Amount must be a plain decimal string",
      "INVALID_AMOUNT",
    );
  }

  const fraction = match[3] ?? "";
  if (fraction.length > definition.exponent) {
    throw new MoneyError(
      `${currency} supports at most ${definition.exponent} decimal places`,
      "TOO_MANY_DECIMAL_PLACES",
    );
  }

  const scale = 10n ** BigInt(definition.exponent);
  const wholeMinorUnits = BigInt(match[2]) * scale;
  const fractionalMinorUnits = fraction
    ? BigInt(fraction.padEnd(definition.exponent, "0"))
    : 0n;
  const signedMinorUnits = wholeMinorUnits + fractionalMinorUnits;

  return money(match[1] === "-" ? -signedMinorUnits : signedMinorUnits);
}

export function formatMajorAmount(
  value: Money,
  currency: string,
): string {
  const definition = getCurrencyDefinition(currency);
  const negative = value < 0n;
  const absolute = negative ? -value : value;

  if (definition.exponent === 0) {
    return `${negative ? "-" : ""}${absolute}`;
  }

  const scale = 10n ** BigInt(definition.exponent);
  const whole = absolute / scale;
  const fraction = (absolute % scale)
    .toString()
    .padStart(definition.exponent, "0");

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}
