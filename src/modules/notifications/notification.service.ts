import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

const pageSize = 20;
const notificationSelect = {
  id: true,
  createdAt: true,
  readAt: true,
  invitation: { select: { id: true, group: { select: { name: true } } } },
  settlement: { select: { id: true, groupId: true, reversesId: true, group: { select: { name: true } } } },
  expenseRevision: { select: {
    revision: true,
    changes: true,
    snapshot: true,
    expense: { select: { id: true, groupId: true, deletedAt: true, group: { select: { name: true } } } },
  } },
} satisfies Prisma.NotificationSelect;

function jsonString(value: Prisma.JsonValue, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

export async function listNotifications(recipientId: string, after?: string) {
  if (after && !await prisma.notification.findFirst({
    where: { id: after, recipientId },
    select: { id: true },
  })) return null;

  const rows = await prisma.notification.findMany({
    where: { recipientId },
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    select: notificationSelect,
  });
  const items = rows.slice(0, pageSize).map(({ invitation, settlement, expenseRevision, ...notification }) => {
    if (expenseRevision) {
      const { expense } = expenseRevision;
      const action = jsonString(expenseRevision.changes, "type");
      return {
        ...notification,
        type: action === "DELETED" ? "EXPENSE_DELETED" as const
          : expenseRevision.revision === 1 ? "EXPENSE_CREATED" as const : "EXPENSE_UPDATED" as const,
        expenseId: expense.id,
        groupId: expense.groupId,
        groupName: expense.group.name,
        expenseDescription: jsonString(expenseRevision.snapshot, "description") ?? null,
        expenseDeleted: expense.deletedAt !== null,
      };
    }
    if (settlement) {
      return {
        ...notification,
        type: settlement.reversesId ? "SETTLEMENT_REVERSED" as const : "SETTLEMENT_RECORDED" as const,
        settlementId: settlement.id,
        groupId: settlement.groupId,
        groupName: settlement.group.name,
      };
    }
    return { ...notification, type: "INVITATION" as const, invitationId: invitation!.id, groupName: invitation!.group.name };
  });
  return {
    items,
    nextCursor: rows.length > pageSize ? items[items.length - 1].id : null,
  };
}

export function countUnreadNotifications(recipientId: string) {
  return prisma.notification.count({ where: { recipientId, readAt: null } });
}

export async function markNotificationRead(recipientId: string, id: string) {
  await prisma.notification.updateMany({
    where: { id, recipientId, readAt: null },
    data: { readAt: new Date() },
  });
  return prisma.notification.findFirst({
    where: { id, recipientId },
    select: { id: true, readAt: true },
  });
}

export function markAllNotificationsRead(recipientId: string) {
  return prisma.notification.updateMany({
    where: { recipientId, readAt: null },
    data: { readAt: new Date() },
  });
}
