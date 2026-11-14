import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MAX_EXPENSE_MINOR_UNITS,
  PERCENTAGE_SCALE,
  SplitEngineError,
  computeSplits,
  money,
} from "../../src/modules/finance/index.js";

function amountMap(results: readonly { userId: string; amount: bigint }[]) {
  return Object.fromEntries(
    results.map((result) => [result.userId, result.amount.toString()]),
  );
}

function totalOf(results: readonly { amount: bigint }[]): bigint {
  return results.reduce((total, result) => total + result.amount, 0n);
}

describe("split engine", () => {
  it("splits equal amounts deterministically by user ID", () => {
    const result = computeSplits({
      method: "EQUAL",
      total: money(100_000n),
      participants: [{ userId: "u_c" }, { userId: "u_a" }, { userId: "u_b" }],
    });

    expect(result).toEqual([
      { userId: "u_a", amount: 33_334n },
      { userId: "u_b", amount: 33_333n },
      { userId: "u_c", amount: 33_333n },
    ]);
  });

  it("accepts exact splits containing zero while requiring an exact total", () => {
    expect(
      computeSplits({
        method: "EXACT",
        total: money(500n),
        participants: [
          { userId: "adult", amount: money(500n) },
          { userId: "child", amount: money(0n) },
        ],
      }),
    ).toEqual([
      { userId: "adult", amount: 500n },
      { userId: "child", amount: 0n },
    ]);

    expect(() =>
      computeSplits({
        method: "EXACT",
        total: money(500n),
        participants: [
          { userId: "a", amount: money(200n) },
          { userId: "b", amount: money(200n) },
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SplitEngineError>>({
        code: "EXACT_TOTAL_MISMATCH",
      }),
    );
  });

  it("uses Hamilton largest-remainder allocation for percentage splits", () => {
    expect(
      computeSplits({
        method: "PERCENTAGE",
        total: money(100_000n),
        participants: [
          { userId: "u_a", percentUnits: 33_333_333n },
          { userId: "u_b", percentUnits: 33_333_333n },
          { userId: "u_c", percentUnits: 33_333_334n },
        ],
      }),
    ).toEqual([
      { userId: "u_a", amount: 33_333n },
      { userId: "u_b", amount: 33_333n },
      { userId: "u_c", amount: 33_334n },
    ]);
  });

  it("rejects duplicate participants and invalid percentage totals", () => {
    expect(() =>
      computeSplits({
        method: "EQUAL",
        total: money(100n),
        participants: [{ userId: "same" }, { userId: "same" }],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SplitEngineError>>({
        code: "DUPLICATE_PARTICIPANT",
      }),
    );

    expect(() =>
      computeSplits({
        method: "PERCENTAGE",
        total: money(100n),
        participants: [
          { userId: "a", percentUnits: 50_000_000n },
          { userId: "b", percentUnits: 49_999_999n },
        ],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SplitEngineError>>({
        code: "PERCENTAGE_TOTAL_MISMATCH",
      }),
    );
  });

  it("satisfies equal-split invariants for generated inputs", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: MAX_EXPENSE_MINOR_UNITS }),
        fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 25 }),
        (total, userIds) => {
          const participants = userIds.map((userId) => ({ userId }));
          const forward = computeSplits({
            method: "EQUAL",
            total: money(total),
            participants,
          });
          const reversed = computeSplits({
            method: "EQUAL",
            total: money(total),
            participants: [...participants].reverse(),
          });
          const amounts = forward.map((result) => result.amount);

          expect(totalOf(forward)).toBe(total);
          expect(amounts.every((amount) => amount >= 0n)).toBe(true);
          expect(Math.max(...amounts.map(Number)) - Math.min(...amounts.map(Number))).toBeLessThanOrEqual(1);
          expect(amountMap(reversed)).toEqual(amountMap(forward));
          expect(forward.map((result) => result.userId)).toEqual(
            [...userIds].sort(),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("preserves generated exact allocations", () => {
    const exactInput = fc
      .array(fc.bigInt({ min: 0n, max: 1_000_000n }), {
        minLength: 1,
        maxLength: 20,
      })
      .filter((amounts) => amounts.some((amount) => amount > 0n))
      .chain((amounts) =>
        fc
          .uniqueArray(fc.uuid(), {
            minLength: amounts.length,
            maxLength: amounts.length,
          })
          .map((userIds) => ({ amounts, userIds })),
      );

    fc.assert(
      fc.property(exactInput, ({ amounts, userIds }) => {
        const total = amounts.reduce((sum, amount) => sum + amount, 0n);
        const participants = userIds.map((userId, index) => ({
          userId,
          amount: money(amounts[index]),
        }));
        const result = computeSplits({
          method: "EXACT",
          total: money(total),
          participants: [...participants].reverse(),
        });

        expect(totalOf(result)).toBe(total);
        expect(amountMap(result)).toEqual(
          Object.fromEntries(
            participants.map((participant) => [
              participant.userId,
              participant.amount.toString(),
            ]),
          ),
        );
      }),
      { numRuns: 200 },
    );
  });

  it("keeps generated percentage splits exact and order-independent", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: MAX_EXPENSE_MINOR_UNITS }),
        fc.bigInt({ min: 0n, max: PERCENTAGE_SCALE }),
        fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 2 }),
        (total, firstPercentage, userIds) => {
          const participants = [
            { userId: userIds[0], percentUnits: firstPercentage },
            {
              userId: userIds[1],
              percentUnits: PERCENTAGE_SCALE - firstPercentage,
            },
          ];
          const forward = computeSplits({
            method: "PERCENTAGE",
            total: money(total),
            participants,
          });
          const reversed = computeSplits({
            method: "PERCENTAGE",
            total: money(total),
            participants: [...participants].reverse(),
          });

          expect(totalOf(forward)).toBe(total);
          expect(forward.every((result) => result.amount >= 0n)).toBe(true);
          expect(amountMap(reversed)).toEqual(amountMap(forward));
        },
      ),
      { numRuns: 300 },
    );
  });
});
