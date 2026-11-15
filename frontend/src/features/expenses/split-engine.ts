import { PERCENTAGE_SCALE } from "./money";

function compareUserIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function computeEqualPreview(
  totalMinor: bigint,
  participantIds: readonly string[],
): Map<string, bigint> {
  const result = new Map<string, bigint>();
  if (participantIds.length === 0 || totalMinor <= 0n) {
    return result;
  }

  const sorted = [...participantIds].sort(compareUserIds);
  const count = BigInt(sorted.length);
  const base = totalMinor / count;
  const remainder = Number(totalMinor % count);

  sorted.forEach((userId, index) => {
    result.set(userId, base + (index < remainder ? 1n : 0n));
  });

  return result;
}

export function computePercentagePreview(
  totalMinor: bigint,
  participants: readonly { userId: string; percentUnits: bigint }[],
): Map<string, bigint> {
  const result = new Map<string, bigint>();
  if (participants.length === 0 || totalMinor <= 0n) {
    return result;
  }

  const shares = participants.map((p) => {
    const numerator = totalMinor * p.percentUnits;
    return {
      userId: p.userId,
      amount: numerator / PERCENTAGE_SCALE,
      remainder: numerator % PERCENTAGE_SCALE,
    };
  });

  const allocated = shares.reduce((acc, s) => acc + s.amount, 0n);
  const leftover = Number(totalMinor - allocated);

  const remainderOrder = [...shares].sort((a, b) => {
    if (a.remainder > b.remainder) return -1;
    if (a.remainder < b.remainder) return 1;
    return compareUserIds(a.userId, b.userId);
  });

  const recipients = new Set(
    remainderOrder.slice(0, leftover).map((s) => s.userId),
  );

  shares.forEach((share) => {
    result.set(
      share.userId,
      share.amount + (recipients.has(share.userId) ? 1n : 0n),
    );
  });

  return result;
}

