export type SplitEngineErrorCode =
  | "INVALID_TOTAL"
  | "NO_PARTICIPANTS"
  | "INVALID_PARTICIPANT"
  | "DUPLICATE_PARTICIPANT"
  | "NEGATIVE_EXACT_AMOUNT"
  | "EXACT_TOTAL_MISMATCH"
  | "INVALID_PERCENTAGE"
  | "PERCENTAGE_TOTAL_MISMATCH";

export class SplitEngineError extends Error {
  constructor(
    message: string,
    public readonly code: SplitEngineErrorCode,
    public readonly details?: Readonly<Record<string, bigint | string>>,
  ) {
    super(message);
    this.name = "SplitEngineError";
  }
}
