import {
  MAX_EXPENSE_MINOR_UNITS,
  type Money,
  money,
  sumMoney,
} from "./money.js";
import { SplitEngineError } from "./split-engine.error.js";

export const PERCENTAGE_SCALE = 100_000_000n;

export type SplitMethod = "EQUAL" | "EXACT" | "PERCENTAGE";

export type EqualSplitParticipant = Readonly<{
  userId: string;
}>;

export type ExactSplitParticipant = Readonly<{
  userId: string;
  amount: Money;
}>;

export type PercentageSplitParticipant = Readonly<{
  userId: string;
  percentUnits: bigint;
}>;

export type EqualSplitInput = Readonly<{
  method: "EQUAL";
  total: Money;
  participants: readonly EqualSplitParticipant[];
}>;

export type ExactSplitInput = Readonly<{
  method: "EXACT";
  total: Money;
  participants: readonly ExactSplitParticipant[];
}>;

export type PercentageSplitInput = Readonly<{
  method: "PERCENTAGE";
  total: Money;
  participants: readonly PercentageSplitParticipant[];
}>;

export type SplitInput =
  | EqualSplitInput
  | ExactSplitInput
  | PercentageSplitInput;

export type SplitResult = Readonly<{
  userId: string;
  amount: Money;
}>;

function compareUserIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function validateCommonInput(
  total: Money,
  participants: readonly { userId: string }[],
): void {
  if (total <= 0n || total > MAX_EXPENSE_MINOR_UNITS) {
    throw new SplitEngineError(
      `Total must be between 1 and ${MAX_EXPENSE_MINOR_UNITS} minor units`,
      "INVALID_TOTAL",
      { total },
    );
  }

  if (participants.length === 0) {
    throw new SplitEngineError(
      "At least one participant is required",
      "NO_PARTICIPANTS",
    );
  }

  const seen = new Set<string>();
  for (const participant of participants) {
    if (
      !participant.userId ||
      participant.userId.trim() !== participant.userId
    ) {
      throw new SplitEngineError(
        "Participant user IDs must be non-empty and normalized",
        "INVALID_PARTICIPANT",
        { userId: participant.userId },
      );
    }

    if (seen.has(participant.userId)) {
      throw new SplitEngineError(
        `Duplicate participant: ${participant.userId}`,
        "DUPLICATE_PARTICIPANT",
        { userId: participant.userId },
      );
    }

    seen.add(participant.userId);
  }
}

function sortedParticipants<T extends { userId: string }>(
  participants: readonly T[],
): T[] {
  return [...participants].sort((left, right) =>
    compareUserIds(left.userId, right.userId),
  );
}

export function computeEqualSplits(input: EqualSplitInput): SplitResult[] {
  validateCommonInput(input.total, input.participants);

  const participants = sortedParticipants(input.participants);
  const count = BigInt(participants.length);
  const base = input.total / count;
  const remainder = Number(input.total % count);

  return participants.map((participant, index) => ({
    userId: participant.userId,
    amount: money(base + (index < remainder ? 1n : 0n)),
  }));
}

export function computeExactSplits(input: ExactSplitInput): SplitResult[] {
  validateCommonInput(input.total, input.participants);

  for (const participant of input.participants) {
    if (participant.amount < 0n) {
      throw new SplitEngineError(
        `Exact amount cannot be negative for ${participant.userId}`,
        "NEGATIVE_EXACT_AMOUNT",
        { userId: participant.userId, amount: participant.amount },
      );
    }
  }

  const actualTotal = sumMoney(
    input.participants.map((participant) => participant.amount),
  );
  if (actualTotal !== input.total) {
    throw new SplitEngineError(
      "Exact split amounts must equal the expense total",
      "EXACT_TOTAL_MISMATCH",
      {
        expected: input.total,
        actual: actualTotal,
        difference: actualTotal - input.total,
      },
    );
  }

  return sortedParticipants(input.participants).map((participant) => ({
    userId: participant.userId,
    amount: participant.amount,
  }));
}

export function computePercentageSplits(
  input: PercentageSplitInput,
): SplitResult[] {
  validateCommonInput(input.total, input.participants);

  let percentageTotal = 0n;
  for (const participant of input.participants) {
    if (
      participant.percentUnits < 0n ||
      participant.percentUnits > PERCENTAGE_SCALE
    ) {
      throw new SplitEngineError(
        `Percentage is out of range for ${participant.userId}`,
        "INVALID_PERCENTAGE",
        { userId: participant.userId, percentUnits: participant.percentUnits },
      );
    }

    percentageTotal += participant.percentUnits;
  }

  if (percentageTotal !== PERCENTAGE_SCALE) {
    throw new SplitEngineError(
      `Percentage units must total exactly ${PERCENTAGE_SCALE}`,
      "PERCENTAGE_TOTAL_MISMATCH",
      {
        expected: PERCENTAGE_SCALE,
        actual: percentageTotal,
        difference: percentageTotal - PERCENTAGE_SCALE,
      },
    );
  }

  const shares = input.participants.map((participant) => {
    const numerator = input.total * participant.percentUnits;

    return {
      userId: participant.userId,
      amount: numerator / PERCENTAGE_SCALE,
      remainder: numerator % PERCENTAGE_SCALE,
    };
  });
  const allocated = shares.reduce((total, share) => total + share.amount, 0n);
  const leftover = Number(input.total - allocated);
  const remainderOrder = [...shares].sort((left, right) => {
    if (left.remainder > right.remainder) return -1;
    if (left.remainder < right.remainder) return 1;
    return compareUserIds(left.userId, right.userId);
  });
  const recipients = new Set(
    remainderOrder.slice(0, leftover).map((share) => share.userId),
  );

  return shares
    .map((share) => ({
      userId: share.userId,
      amount: money(share.amount + (recipients.has(share.userId) ? 1n : 0n)),
    }))
    .sort((left, right) => compareUserIds(left.userId, right.userId));
}

export function computeSplits(input: SplitInput): SplitResult[] {
  switch (input.method) {
    case "EQUAL":
      return computeEqualSplits(input);
    case "EXACT":
      return computeExactSplits(input);
    case "PERCENTAGE":
      return computePercentageSplits(input);
  }
}
