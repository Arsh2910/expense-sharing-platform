import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

const pageSize = 20;
const notificationSelect = {
  id: true,
  invitationId: true,
  createdAt: true,
  readAt: true,
  invitation: { select: { group: { select: { name: true } } } },
} satisfies Prisma.NotificationSelect;

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
  const items = rows.slice(0, pageSize).map(({ invitation, ...notification }) => ({
    ...notification,
    groupName: invitation.group.name,
  }));
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
