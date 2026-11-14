export class UnsafeJsonIntegerError extends Error {
  readonly code = "UNSAFE_JSON_INTEGER";

  constructor() {
    super("BigInt value cannot be represented safely as a JSON number");
    this.name = "UnsafeJsonIntegerError";
  }
}

export function serializeBigIntAsJsonNumber(value: bigint): number {
  const serialized = Number(value);

  if (!Number.isSafeInteger(serialized)) {
    throw new UnsafeJsonIntegerError();
  }

  return serialized;
}

export function jsonBigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint"
    ? serializeBigIntAsJsonNumber(value)
    : value;
}
