import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

export type BalanceDirection = "OWES" | "RECEIVES" | "SQUARE";

export class BalanceServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "GROUP_NOT_FOUND" | "FORBIDDEN",
  ) {
    super(message);
    this.name = "BalanceServiceError";
  }
}

function direction(amount: bigint): BalanceDirection {
  if (amount < 0n) return "OWES";
  if (amount > 0n) return "RECEIVES";
  return "SQUARE";
}

function sortedUniqueUserIds(userIds: readonly string[]) {
  return [...new Set(userIds)].sort();
}

/** Create missing rows defensively for groups created before this projection. */
export async function ensureBalanceRows(
  tx: Prisma.TransactionClient,
  groupId: string,
  userIds: readonly string[],
) {
  for (const userId of sortedUniqueUserIds(userIds)) {
    await tx.groupBalance.upsert({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId, amount: 0n },
      update: {},
    });
  }
}

export async function lockBalanceRows(
  tx: Prisma.TransactionClient,
  groupId: string,
  userIds: readonly string[],
) {
  const sortedIds = sortedUniqueUserIds(userIds);
  await ensureBalanceRows(tx, groupId, sortedIds);
  if (sortedIds.length === 0) return;

  await tx.$queryRaw<{ user_id: string }[]>(Prisma.sql`
    SELECT user_id
    FROM group_balances
    WHERE group_id = ${groupId}::uuid
      AND user_id IN (${Prisma.join(sortedIds)})
    ORDER BY user_id
    FOR UPDATE
  `);
}

async function recomputeOneBalance(
  tx: Prisma.TransactionClient,
  groupId: string,
  userId: string,
) {
  const [paid, owed, received, sent] = await Promise.all([
    tx.expensePayer.aggregate({
      where: { userId, expense: { groupId, deletedAt: null } },
      _sum: { amount: true },
    }),
    tx.expenseSplit.aggregate({
      where: { userId, expense: { groupId, deletedAt: null } },
      _sum: { amount: true },
    }),
    tx.settlement.aggregate({
      where: { groupId, toUserId: userId },
      _sum: { amount: true },
    }),
    tx.settlement.aggregate({
      where: { groupId, fromUserId: userId },
      _sum: { amount: true },
    }),
  ]);

  // Positive means the member should receive money. A repayment reduces the
  // recipient's outstanding receivable and reduces the sender's obligation.
  const amount =
    (paid._sum.amount ?? 0n) -
    (owed._sum.amount ?? 0n) -
    (received._sum.amount ?? 0n) +
    (sent._sum.amount ?? 0n);

  await tx.groupBalance.update({
    where: { groupId_userId: { groupId, userId } },
    data: { amount },
  });
  return amount;
}

/** Recompute after the mutation, while rows remain locked in this transaction. */
export async function recomputeLockedBalances(
  tx: Prisma.TransactionClient,
  groupId: string,
  userIds: readonly string[],
) {
  const balances = new Map<string, bigint>();
  for (const userId of sortedUniqueUserIds(userIds)) {
    balances.set(userId, await recomputeOneBalance(tx, groupId, userId));
  }
  return balances;
}

export async function getGroupBalances(groupId: string, actorUserId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, currency: true },
  });
  if (!group) {
    throw new BalanceServiceError("Group not found", "GROUP_NOT_FOUND");
  }

  const actorMembership = await prisma.groupMembership.findFirst({
    where: { groupId, userId: actorUserId, leftAt: null },
    select: { id: true },
  });
  if (!actorMembership) {
    throw new BalanceServiceError(
      "Only active group members can view balances",
      "FORBIDDEN",
    );
  }

  const [balances, memberships] = await Promise.all([
    prisma.groupBalance.findMany({
      where: { groupId },
      orderBy: { userId: "asc" },
      select: {
        userId: true,
        amount: true,
        updatedAt: true,
        user: { select: { id: true, username: true, displayName: true } },
      },
    }),
    prisma.groupMembership.findMany({
      where: { groupId },
      orderBy: [{ userId: "asc" }, { joinedAt: "desc" }],
      select: { userId: true, role: true, leftAt: true },
    }),
  ]);

  const latestMembership = new Map<
    string,
    { role: "OWNER" | "ADMIN" | "MEMBER"; leftAt: Date | null }
  >();
  for (const membership of memberships) {
    if (!latestMembership.has(membership.userId)) {
      latestMembership.set(membership.userId, membership);
    }
  }

  return {
    currency: group.currency,
    members: balances.map((balance) => {
      const membership = latestMembership.get(balance.userId);
      return {
        userId: balance.userId,
        username: balance.user.username,
        displayName: balance.user.displayName,
        role: membership?.role ?? null,
        isActiveMember: membership?.leftAt === null,
        balanceMinor: balance.amount,
        direction: direction(balance.amount),
        updatedAt: balance.updatedAt,
      };
    }),
  };
}

export async function rebuildGroupBalances(groupId: string) {
  return prisma.$transaction(async (tx) => {
    const members = await tx.groupMembership.findMany({
      where: { groupId },
      distinct: ["userId"],
      select: { userId: true },
    });
    const userIds = members.map((member) => member.userId);
    await lockBalanceRows(tx, groupId, userIds);
    await recomputeLockedBalances(tx, groupId, userIds);
    return { groupId, memberCount: userIds.length };
  });
}
