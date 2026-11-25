import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { transactionCalendarDate } from "../../lib/calendar-date.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import {
  lockBalanceRows,
  recomputeLockedBalances,
} from "../balances/balance.service.js";
import { expenseMoney, parseMajorAmount, type Money } from "../finance/index.js";
import {
  beginIdempotency,
  completeIdempotency,
  IdempotencyServiceError,
} from "../idempotency/idempotency.service.js";
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
  | "ALREADY_REVERSED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "IDEMPOTENCY_IN_PROGRESS";

export class SettlementServiceError extends Error {
  constructor(
    message: string,
    public readonly code: SettlementErrorCode,
  ) {
    super(message);
    this.name = "SettlementServiceError";
  }
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
    select: { role: true },
  });
  if (!actorMembership) {
    throw new SettlementServiceError(
      "Only active group members can manage settlements",
      "FORBIDDEN",
    );
  }
  return { ...group, actorRole: actorMembership.role };
}

function assertCanManageSettlement(
  role: "OWNER" | "ADMIN" | "MEMBER",
  actorUserId: string,
  fromUserId: string,
  toUserId: string,
) {
  if (role === "MEMBER" && actorUserId !== fromUserId && actorUserId !== toUserId) {
    throw new SettlementServiceError(
      "Only a settlement participant or group admin can manage this settlement",
      "FORBIDDEN",
    );
  }
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

function assertInputDates(input: CreateSettlementInput, today: string) {
  if (input.settledOn > today) {
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

async function notifySettlementParticipants(
  tx: Prisma.TransactionClient,
  settlement: { id: string; fromUserId: string; toUserId: string },
  actorUserId: string,
) {
  const recipients = [settlement.fromUserId, settlement.toUserId].filter((id) => id !== actorUserId);
  await tx.notification.createMany({
    data: recipients.map((recipientId) => ({ recipientId, settlementId: settlement.id })),
  });
}

export async function createSettlement(
  groupId: string,
  actorUserId: string,
  input: CreateSettlementInput,
  idempotencyKey?: string,
  clientTimeZone?: string,
) {
  try {
    return await prisma.$transaction(async (tx) => {
    const group = await requireWritableGroup(tx, groupId, actorUserId);
    assertCanManageSettlement(group.actorRole, actorUserId, input.fromUserId, input.toUserId);
    const scope = `settlement:create:${groupId}`;
    const idempotency = await beginIdempotency(
      tx,
      actorUserId,
      scope,
      idempotencyKey,
      input,
    );
    if (idempotency.replayResourceId) {
      const replay = await tx.settlement.findFirst({
        where: { id: idempotency.replayResourceId, groupId },
      });
      if (replay) return settlementResponse(replay, group.currency);
    }
    assertInputDates(input, await transactionCalendarDate(tx, clientTimeZone));
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
    await notifySettlementParticipants(tx, settlement, actorUserId);
    await recordAuditEvent(tx, {
      groupId, actorId: actorUserId, action: "SETTLEMENT_CREATED", entityId: settlement.id,
      metadata: { fromUserId: settlement.fromUserId, toUserId: settlement.toUserId },
    });
    await completeIdempotency(
      tx,
      actorUserId,
      scope,
      idempotencyKey,
      settlement.id,
    );
    return settlementResponse(settlement, group.currency);
    });
  } catch (error) {
    if (error instanceof IdempotencyServiceError) {
      throw new SettlementServiceError(
        error.message,
        error.code === "KEY_REUSED"
          ? "IDEMPOTENCY_KEY_REUSED"
          : "IDEMPOTENCY_IN_PROGRESS",
      );
    }
    throw error;
  }
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
  clientTimeZone?: string,
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
    assertCanManageSettlement(group.actorRole, actorUserId, original.fromUserId, original.toUserId);
    const settledOn = parseSettlementDate(await transactionCalendarDate(tx, clientTimeZone));

    await lockBalanceRows(tx, groupId, [original.fromUserId, original.toUserId]);
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

    const reversal = await tx.settlement.create({
      data: {
        groupId,
        fromUserId: original.toUserId,
        toUserId: original.fromUserId,
        amount: original.amount,
        settledOn,
        note: `Reversal of settlement ${original.id}`,
        reversesId: original.id,
        createdById: actorUserId,
      },
    });
    await recomputeLockedBalances(tx, groupId, [
      original.fromUserId,
      original.toUserId,
    ]);
    await notifySettlementParticipants(tx, reversal, actorUserId);
    await recordAuditEvent(tx, {
      groupId, actorId: actorUserId, action: "SETTLEMENT_REVERSED", entityId: reversal.id,
      metadata: { fromUserId: reversal.fromUserId, toUserId: reversal.toUserId, reversesId: original.id },
    });
    return settlementResponse(reversal, group.currency);
  });
}
