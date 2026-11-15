import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import {
  lockBalanceRows,
  recomputeLockedBalances,
} from "../balances/balance.service.js";
import { expenseMoney, parseMajorAmount, type Money } from "../finance/index.js";
import type { CreateSettlementInput } from "./settlement.schema.js";

type SettlementErrorCode =
  | "GROUP_NOT_FOUND"
  | "GROUP_ARCHIVED"
  | "FORBIDDEN"
  | "INVALID_MEMBER"
  | "INVALID_AMOUNT"
  | "SAME_USER"
  | "FUTURE_DATE"
  | "SETTLEMENT_NOT_FOUND"
  | "ALREADY_REVERSED";

export class SettlementServiceError extends Error {
  constructor(
    message: string,
    public readonly code: SettlementErrorCode,
  ) {
    super(message);
    this.name = "SettlementServiceError";
  }
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseSettlementDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function settlementResponse(
  settlement: {
    id: string;
    groupId: string;
    fromUserId: string;
    toUserId: string;
    amount: bigint;
    settledOn: Date;
    note: string | null;
    reversesId: string | null;
    createdById: string;
    createdAt: Date;
  },
  currency: string,
) {
  return {
    id: settlement.id,
    groupId: settlement.groupId,
    currency,
    fromUserId: settlement.fromUserId,
    toUserId: settlement.toUserId,
    amountMinor: settlement.amount,
    settledOn: formatDate(settlement.settledOn),
    note: settlement.note,
    reversesId: settlement.reversesId,
    createdById: settlement.createdById,
    createdAt: settlement.createdAt,
  };
}

async function requireWritableGroup(
  tx: Prisma.TransactionClient,
  groupId: string,
  actorUserId: string,
) {
  const group = await tx.group.findUnique({
    where: { id: groupId },
    select: { id: true, currency: true, archivedAt: true },
  });
  if (!group) {
    throw new SettlementServiceError("Group not found", "GROUP_NOT_FOUND");
  }
  if (group.archivedAt) {
    throw new SettlementServiceError(
      "Archived groups cannot be modified",
      "GROUP_ARCHIVED",
    );
  }

  const actorMembership = await tx.groupMembership.findFirst({
    where: { groupId, userId: actorUserId, leftAt: null },
    select: { id: true },
  });
  if (!actorMembership) {
    throw new SettlementServiceError(
      "Only active group members can record settlements",
      "FORBIDDEN",
    );
  }
  return group;
}

async function requireReadableGroup(groupId: string, actorUserId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, currency: true },
  });
  if (!group) {
    throw new SettlementServiceError("Group not found", "GROUP_NOT_FOUND");
  }
  const actorMembership = await prisma.groupMembership.findFirst({
    where: { groupId, userId: actorUserId, leftAt: null },
    select: { id: true },
  });
  if (!actorMembership) {
    throw new SettlementServiceError(
      "Only active group members can view settlements",
      "FORBIDDEN",
    );
  }
  return group;
}

async function assertCurrentParticipants(
  tx: Prisma.TransactionClient,
  groupId: string,
  fromUserId: string,
  toUserId: string,
) {
  const memberships = await tx.groupMembership.findMany({
    where: {
      groupId,
      userId: { in: [fromUserId, toUserId] },
      leftAt: null,
      user: { status: "ACTIVE" },
    },
    select: { userId: true },
  });
  const activeIds = new Set(memberships.map((membership) => membership.userId));
  if (!activeIds.has(fromUserId) || !activeIds.has(toUserId)) {
    throw new SettlementServiceError(
      "Both settlement participants must be active group members",
      "INVALID_MEMBER",
    );
  }
}

function assertInputDates(input: CreateSettlementInput) {
  if (input.settledOn > todayIsoDate()) {
    throw new SettlementServiceError(
      "Settlement date cannot be in the future",
      "FUTURE_DATE",
    );
  }
}

function parseAmount(value: string, currency: string): Money {
  try {
    return expenseMoney(parseMajorAmount(value, currency));
  } catch (error) {
    if (error instanceof Error) {
      throw new SettlementServiceError(error.message, "INVALID_AMOUNT");
    }
    throw error;
  }
}

export async function createSettlement(
  groupId: string,
  actorUserId: string,
  input: CreateSettlementInput,
) {
  return prisma.$transaction(async (tx) => {
    const group = await requireWritableGroup(tx, groupId, actorUserId);
    assertInputDates(input);
    if (input.fromUserId === input.toUserId) {
      throw new SettlementServiceError(
        "A settlement must involve two different users",
        "SAME_USER",
      );
    }

    await assertCurrentParticipants(
      tx,
      groupId,
      input.fromUserId,
      input.toUserId,
    );
    const amount = parseAmount(input.amount, group.currency);
    await lockBalanceRows(tx, groupId, [input.fromUserId, input.toUserId]);

    const settlement = await tx.settlement.create({
      data: {
        groupId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amount,
        settledOn: parseSettlementDate(input.settledOn),
        note: input.note,
        createdById: actorUserId,
      },
    });
    await recomputeLockedBalances(tx, groupId, [
      input.fromUserId,
      input.toUserId,
    ]);
    return settlementResponse(settlement, group.currency);
  });
}

export async function listSettlements(groupId: string, actorUserId: string) {
  const group = await requireReadableGroup(groupId, actorUserId);
  const settlements = await prisma.settlement.findMany({
    where: { groupId },
    orderBy: [{ settledOn: "desc" }, { createdAt: "desc" }],
  });
  return settlements.map((settlement) =>
    settlementResponse(settlement, group.currency),
  );
}

export async function reverseSettlement(
  groupId: string,
  settlementId: string,
  actorUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    const group = await requireWritableGroup(tx, groupId, actorUserId);
    const original = await tx.settlement.findFirst({
      where: { id: settlementId, groupId },
    });
    if (!original) {
      throw new SettlementServiceError(
        "Settlement not found",
        "SETTLEMENT_NOT_FOUND",
      );
    }
    if (original.reversesId) {
      throw new SettlementServiceError(
        "A reversal cannot itself be reversed",
        "ALREADY_REVERSED",
      );
    }

    const existingReversal = await tx.settlement.findUnique({
      where: { reversesId: settlementId },
      select: { id: true },
    });
    if (existingReversal) {
      throw new SettlementServiceError(
        "This settlement has already been reversed",
        "ALREADY_REVERSED",
      );
    }

    await lockBalanceRows(tx, groupId, [original.fromUserId, original.toUserId]);
    const reversal = await tx.settlement.create({
      data: {
        groupId,
        fromUserId: original.toUserId,
        toUserId: original.fromUserId,
        amount: original.amount,
        settledOn: new Date(),
        note: `Reversal of settlement ${original.id}`,
        reversesId: original.id,
        createdById: actorUserId,
      },
    });
    await recomputeLockedBalances(tx, groupId, [
      original.fromUserId,
      original.toUserId,
    ]);
    return settlementResponse(reversal, group.currency);
  }).catch((error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new SettlementServiceError(
        "This settlement has already been reversed",
        "ALREADY_REVERSED",
      );
    }
    throw error;
  });
}
