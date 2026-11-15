import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import {
  computeSplits,
  expenseMoney,
  MoneyError,
  money,
  parseMajorAmount,
  SplitEngineError,
  sumMoney,
  type Money,
  type SplitInput,
  type SplitResult,
} from "../finance/index.js";
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
} from "./expense.schema.js";
import {
  lockBalanceRows,
  recomputeLockedBalances,
} from "../balances/balance.service.js";

type ExpenseServiceErrorCode =
  | "GROUP_NOT_FOUND"
  | "GROUP_ARCHIVED"
  | "EXPENSE_NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_MEMBER"
  | "INVALID_AMOUNT"
  | "TOTAL_MISMATCH"
  | "INVALID_SPLIT"
  | "FUTURE_DATE"
  | "VERSION_CONFLICT"
  | "INVALID_CURSOR";

type ExpenseServiceErrorDetails = Readonly<{
  currentVersion?: number;
}>;

export class ExpenseServiceError extends Error {
  constructor(
    message: string,
    public readonly code: ExpenseServiceErrorCode,
    public readonly details?: ExpenseServiceErrorDetails,
  ) {
    super(message);
    this.name = "ExpenseServiceError";
  }
}

type ExpenseInput = CreateExpenseInput | UpdateExpenseInput;

type PreparedAllocations = Readonly<{
  payerAmounts: readonly { userId: string; amount: Money }[];
  total: Money;
  splits: readonly SplitResult[];
  percentUnitsByUser: ReadonlyMap<string, bigint>;
  allocationUserIds: readonly string[];
}>;

type ExpenseWithAllocations = Readonly<{
  id: string;
  groupId: string;
  description: string;
  category: string | null;
  amount: bigint;
  splitType: "EQUAL" | "EXACT" | "PERCENTAGE";
  expenseDate: Date;
  createdById: string;
  version: number;
  deletedAt: Date | null;
  deletedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  payers: readonly { userId: string; amount: bigint }[];
  splits: readonly {
    userId: string;
    amount: bigint;
    percentUnits: bigint | null;
  }[];
}>;

function parsePercentage(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
}

function participantIds(input: ExpenseInput): string[] {
  return input.split.participants.map((participant) =>
    typeof participant === "string" ? participant : participant.userId,
  );
}

function toSplitInput(
  input: ExpenseInput,
  total: Money,
  currency: string,
): SplitInput {
  switch (input.split.type) {
    case "EQUAL":
      return {
        method: "EQUAL",
        total,
        participants: input.split.participants.map((userId) => ({ userId })),
      };
    case "EXACT":
      return {
        method: "EXACT",
        total,
        participants: input.split.participants.map((participant) => ({
          userId: participant.userId,
          amount: money(parseMajorAmount(participant.amount, currency)),
        })),
      };
    case "PERCENTAGE":
      return {
        method: "PERCENTAGE",
        total,
        participants: input.split.participants.map((participant) => ({
          userId: participant.userId,
          percentUnits: parsePercentage(participant.percentage),
        })),
      };
  }
}

function prepareAllocations(
  input: ExpenseInput,
  currency: string,
): PreparedAllocations {
  const payerAmounts = input.payers.map((payer) => ({
    userId: payer.userId,
    amount: expenseMoney(parseMajorAmount(payer.amount, currency)),
  }));
  const total = expenseMoney(sumMoney(payerAmounts.map((payer) => payer.amount)));

  if (input.total !== undefined) {
    const assertedTotal = expenseMoney(parseMajorAmount(input.total, currency));
    if (assertedTotal !== total) {
      throw new ExpenseServiceError(
        "Declared total must equal the sum of payer amounts",
        "TOTAL_MISMATCH",
      );
    }
  }

  const splits = computeSplits(toSplitInput(input, total, currency));
  const percentUnitsByUser = new Map<string, bigint>();
  if (input.split.type === "PERCENTAGE") {
    for (const participant of input.split.participants) {
      percentUnitsByUser.set(
        participant.userId,
        parsePercentage(participant.percentage),
      );
    }
  }

  return {
    payerAmounts,
    total,
    splits,
    percentUnitsByUser,
    allocationUserIds: [
      ...new Set([
        ...payerAmounts.map((payer) => payer.userId),
        ...participantIds(input),
      ]),
    ],
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseExpenseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatExpenseDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function assertNotFutureDate(value: string) {
  if (value > todayIsoDate()) {
    throw new ExpenseServiceError(
      "Expense date cannot be in the future",
      "FUTURE_DATE",
    );
  }
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
    throw new ExpenseServiceError("Group not found", "GROUP_NOT_FOUND");
  }
  if (group.archivedAt) {
    throw new ExpenseServiceError(
      "Archived groups cannot be modified",
      "GROUP_ARCHIVED",
    );
  }

  const actorMembership = await tx.groupMembership.findFirst({
    where: { groupId, userId: actorUserId, leftAt: null },
    select: { id: true },
  });
  if (!actorMembership) {
    throw new ExpenseServiceError(
      "Only active group members can modify expenses",
      "FORBIDDEN",
    );
  }

  return group;
}

async function requireReadableGroup(groupId: string, actorUserId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, currency: true, archivedAt: true },
  });
  if (!group) {
    throw new ExpenseServiceError("Group not found", "GROUP_NOT_FOUND");
  }

  const membership = await prisma.groupMembership.findFirst({
    where: { groupId, userId: actorUserId, leftAt: null },
    select: { id: true },
  });
  if (!membership) {
    throw new ExpenseServiceError(
      "Only active group members can view expenses",
      "FORBIDDEN",
    );
  }

  return group;
}

async function assertAllocationMembers(
  tx: Prisma.TransactionClient,
  groupId: string,
  allocationUserIds: readonly string[],
  historicalUserIds: ReadonlySet<string> = new Set(),
) {
  const newlyAddedUserIds = allocationUserIds.filter(
    (userId) => !historicalUserIds.has(userId),
  );
  if (newlyAddedUserIds.length === 0) return;

  const activeMembers = await tx.groupMembership.findMany({
    where: {
      groupId,
      userId: { in: newlyAddedUserIds },
      leftAt: null,
      user: { status: "ACTIVE" },
    },
    select: { userId: true },
  });
  const activeUserIds = new Set(activeMembers.map((member) => member.userId));
  const invalidUserIds = newlyAddedUserIds.filter(
    (userId) => !activeUserIds.has(userId),
  );

  if (invalidUserIds.length > 0) {
    throw new ExpenseServiceError(
      `Every new payer and participant must be an active group member: ${invalidUserIds.join(", ")}`,
      "INVALID_MEMBER",
    );
  }
}

function expenseSnapshot(expense: ExpenseWithAllocations) {
  return {
    id: expense.id,
    groupId: expense.groupId,
    description: expense.description,
    category: expense.category,
    amount: expense.amount.toString(),
    splitType: expense.splitType,
    expenseDate: formatExpenseDate(expense.expenseDate),
    version: expense.version,
    deletedAt: expense.deletedAt?.toISOString() ?? null,
    deletedById: expense.deletedById,
    payers: expense.payers.map((payer) => ({
      userId: payer.userId,
      amount: payer.amount.toString(),
    })),
    splits: expense.splits.map((split) => ({
      userId: split.userId,
      amount: split.amount.toString(),
      percentUnits: split.percentUnits?.toString() ?? null,
    })),
  };
}

function expenseResponse(expense: ExpenseWithAllocations, currency: string) {
  return {
    id: expense.id,
    groupId: expense.groupId,
    currency,
    description: expense.description,
    category: expense.category,
    totalMinor: expense.amount,
    splitType: expense.splitType,
    expenseDate: formatExpenseDate(expense.expenseDate),
    version: expense.version,
    createdById: expense.createdById,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
    payers: expense.payers.map((payer) => ({
      userId: payer.userId,
      amountMinor: payer.amount,
    })),
    splits: expense.splits.map((split) => ({
      userId: split.userId,
      amountMinor: split.amount,
      percentUnits: split.percentUnits,
    })),
  };
}

const allocationInclude = {
  payers: { orderBy: { userId: "asc" as const } },
  splits: { orderBy: { userId: "asc" as const } },
};

async function latestVersionOrNotFound(
  tx: Prisma.TransactionClient,
  groupId: string,
  expenseId: string,
): Promise<never> {
  const latest = await tx.expense.findFirst({
    where: { id: expenseId, groupId, deletedAt: null },
    select: { version: true },
  });
  if (!latest) {
    throw new ExpenseServiceError("Expense not found", "EXPENSE_NOT_FOUND");
  }
  throw new ExpenseServiceError(
    "Expense was changed by another request; reload it before retrying",
    "VERSION_CONFLICT",
    { currentVersion: latest.version },
  );
}

export async function createExpense(
  groupId: string,
  actorUserId: string,
  input: CreateExpenseInput,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const group = await requireWritableGroup(tx, groupId, actorUserId);
      assertNotFutureDate(input.expenseDate);
      const prepared = prepareAllocations(input, group.currency);
      await assertAllocationMembers(tx, groupId, prepared.allocationUserIds);
      await lockBalanceRows(tx, groupId, prepared.allocationUserIds);

      const expense = await tx.expense.create({
        data: {
          groupId,
          description: input.description,
          category: input.category,
          amount: prepared.total,
          splitType: input.split.type,
          expenseDate: parseExpenseDate(input.expenseDate),
          createdById: actorUserId,
          payers: {
            create: prepared.payerAmounts.map((payer) => ({
              userId: payer.userId,
              amount: payer.amount,
            })),
          },
          splits: {
            create: prepared.splits.map((split) => ({
              userId: split.userId,
              amount: split.amount,
              percentUnits: prepared.percentUnitsByUser.get(split.userId),
            })),
          },
        },
        include: allocationInclude,
      });

      await tx.expenseRevision.create({
        data: {
          expenseId: expense.id,
          revision: 1,
          snapshot: expenseSnapshot(expense),
          changes: { type: "CREATED" },
          createdById: actorUserId,
        },
      });
      await recomputeLockedBalances(tx, groupId, prepared.allocationUserIds);

      return expenseResponse(expense, group.currency);
    });
  } catch (error) {
    throw translateExpenseError(error);
  }
}

export async function listExpenses(
  groupId: string,
  actorUserId: string,
  options: { limit: number; cursor?: string },
) {
  const group = await requireReadableGroup(groupId, actorUserId);

  if (options.cursor) {
    const cursorExists = await prisma.expense.findFirst({
      where: { id: options.cursor, groupId, deletedAt: null },
      select: { id: true },
    });
    if (!cursorExists) {
      throw new ExpenseServiceError(
        "Expense cursor is invalid for this group",
        "INVALID_CURSOR",
      );
    }
  }

  const expenses = await prisma.expense.findMany({
    where: { groupId, deletedAt: null },
    orderBy: [{ expenseDate: "desc" }, { id: "desc" }],
    take: options.limit + 1,
    ...(options.cursor
      ? { cursor: { id: options.cursor }, skip: 1 }
      : {}),
    include: allocationInclude,
  });
  const hasMore = expenses.length > options.limit;
  const page = hasMore ? expenses.slice(0, options.limit) : expenses;

  return {
    items: page.map((expense) => expenseResponse(expense, group.currency)),
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  };
}

export async function getExpense(
  groupId: string,
  expenseId: string,
  actorUserId: string,
) {
  const group = await requireReadableGroup(groupId, actorUserId);
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, groupId, deletedAt: null },
    include: allocationInclude,
  });
  if (!expense) {
    throw new ExpenseServiceError("Expense not found", "EXPENSE_NOT_FOUND");
  }

  return expenseResponse(expense, group.currency);
}

export async function listExpenseRevisions(
  groupId: string,
  expenseId: string,
  actorUserId: string,
) {
  await requireReadableGroup(groupId, actorUserId);
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, groupId },
    select: { id: true },
  });
  if (!expense) {
    throw new ExpenseServiceError("Expense not found", "EXPENSE_NOT_FOUND");
  }

  return prisma.expenseRevision.findMany({
    where: { expenseId },
    orderBy: { revision: "desc" },
    select: {
      revision: true,
      snapshot: true,
      changes: true,
      createdById: true,
      createdAt: true,
    },
  });
}

export async function updateExpense(
  groupId: string,
  expenseId: string,
  actorUserId: string,
  input: UpdateExpenseInput,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const group = await requireWritableGroup(tx, groupId, actorUserId);
      assertNotFutureDate(input.expenseDate);
      const current = await tx.expense.findFirst({
        where: { id: expenseId, groupId, deletedAt: null },
        include: allocationInclude,
      });
      if (!current) {
        throw new ExpenseServiceError("Expense not found", "EXPENSE_NOT_FOUND");
      }

      const prepared = prepareAllocations(input, group.currency);
      const historicalUserIds = new Set([
        ...current.payers.map((payer) => payer.userId),
        ...current.splits.map((split) => split.userId),
      ]);
      const affectedUserIds = [
        ...new Set([
          ...historicalUserIds,
          ...prepared.allocationUserIds,
        ]),
      ];
      await assertAllocationMembers(
        tx,
        groupId,
        prepared.allocationUserIds,
        historicalUserIds,
      );
      await lockBalanceRows(tx, groupId, affectedUserIds);

      const claimed = await tx.expense.updateMany({
        where: {
          id: expenseId,
          groupId,
          version: input.version,
          deletedAt: null,
        },
        data: {
          description: input.description,
          category: input.category ?? null,
          amount: prepared.total,
          splitType: input.split.type,
          expenseDate: parseExpenseDate(input.expenseDate),
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        return latestVersionOrNotFound(tx, groupId, expenseId);
      }

      await tx.expensePayer.deleteMany({ where: { expenseId } });
      await tx.expenseSplit.deleteMany({ where: { expenseId } });
      await tx.expensePayer.createMany({
        data: prepared.payerAmounts.map((payer) => ({
          expenseId,
          userId: payer.userId,
          amount: payer.amount,
        })),
      });
      await tx.expenseSplit.createMany({
        data: prepared.splits.map((split) => ({
          expenseId,
          userId: split.userId,
          amount: split.amount,
          percentUnits: prepared.percentUnitsByUser.get(split.userId),
        })),
      });

      const updated = await tx.expense.findUniqueOrThrow({
        where: { id: expenseId },
        include: allocationInclude,
      });
      await tx.expenseRevision.create({
        data: {
          expenseId,
          revision: updated.version,
          snapshot: expenseSnapshot(updated),
          changes: {
            type: "UPDATED",
            fromVersion: current.version,
            toVersion: updated.version,
          },
          createdById: actorUserId,
        },
      });
      await recomputeLockedBalances(tx, groupId, affectedUserIds);

      return expenseResponse(updated, group.currency);
    });
  } catch (error) {
    throw translateExpenseError(error);
  }
}

export async function deleteExpense(
  groupId: string,
  expenseId: string,
  actorUserId: string,
  expectedVersion: number,
) {
  return prisma.$transaction(async (tx) => {
    await requireWritableGroup(tx, groupId, actorUserId);
    const current = await tx.expense.findFirst({
      where: { id: expenseId, groupId, deletedAt: null },
      include: allocationInclude,
    });
    if (!current) {
      throw new ExpenseServiceError("Expense not found", "EXPENSE_NOT_FOUND");
    }
    const affectedUserIds = [
      ...new Set([
        ...current.payers.map((payer) => payer.userId),
        ...current.splits.map((split) => split.userId),
      ]),
    ];
    await lockBalanceRows(tx, groupId, affectedUserIds);

    const deletedAt = new Date();
    const deleted = await tx.expense.updateMany({
      where: {
        id: expenseId,
        groupId,
        version: expectedVersion,
        deletedAt: null,
      },
      data: {
        deletedAt,
        deletedById: actorUserId,
        version: { increment: 1 },
      },
    });
    if (deleted.count !== 1) {
      return latestVersionOrNotFound(tx, groupId, expenseId);
    }

    const tombstone = await tx.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: allocationInclude,
    });
    await tx.expenseRevision.create({
      data: {
        expenseId,
        revision: tombstone.version,
        snapshot: expenseSnapshot(tombstone),
        changes: {
          type: "DELETED",
          fromVersion: current.version,
          toVersion: tombstone.version,
        },
        createdById: actorUserId,
      },
    });
    await recomputeLockedBalances(tx, groupId, affectedUserIds);

    return {
      id: expenseId,
      version: tombstone.version,
      deletedAt: tombstone.deletedAt,
    };
  });
}

function translateExpenseError(error: unknown): Error {
  if (error instanceof ExpenseServiceError) return error;
  if (error instanceof MoneyError) {
    return new ExpenseServiceError(error.message, "INVALID_AMOUNT");
  }
  if (error instanceof SplitEngineError) {
    return new ExpenseServiceError(error.message, "INVALID_SPLIT");
  }
  return error instanceof Error ? error : new Error("Unknown expense error");
}
