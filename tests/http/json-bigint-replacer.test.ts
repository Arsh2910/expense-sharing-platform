import { describe, expect, it } from "vitest";
import {
  UnsafeJsonIntegerError,
  jsonBigIntReplacer,
  serializeBigIntAsJsonNumber,
} from "../../src/http/json-bigint-replacer.js";

describe("JSON BigInt serialization", () => {
  it("serializes safe BigInt values to JSON numbers", () => {
    expect(serializeBigIntAsJsonNumber(10_000_000_000_000n)).toBe(
      10_000_000_000_000,
    );
    expect(
      JSON.stringify(
        { amount: 12_345n, nested: [1n, { amount: -5n }] },
        jsonBigIntReplacer,
      ),
    ).toBe('{"amount":12345,"nested":[1,{"amount":-5}]}');
  });

  it("refuses lossy JSON number conversion", () => {
    const unsafe = BigInt(Number.MAX_SAFE_INTEGER) + 1n;

    expect(() => serializeBigIntAsJsonNumber(unsafe)).toThrow(
      UnsafeJsonIntegerError,
    );
    expect(() => JSON.stringify({ amount: unsafe }, jsonBigIntReplacer)).toThrow(
      UnsafeJsonIntegerError,
    );
  });
});
