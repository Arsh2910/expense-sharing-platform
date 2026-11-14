export type MoneyErrorCode =
  | "INVALID_AMOUNT"
  | "NEGATIVE_AMOUNT"
  | "EXPENSE_AMOUNT_OUT_OF_RANGE"
  | "UNSUPPORTED_CURRENCY"
  | "TOO_MANY_DECIMAL_PLACES";

export class MoneyError extends Error {
  constructor(
    message: string,
    public readonly code: MoneyErrorCode,
  ) {
    super(message);
    this.name = "MoneyError";
  }
}
