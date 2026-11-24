import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { groupActivityActions } from "./audit.service.js";

const pageSize = 20;
const userIdSchema = z.uuid();

function targetUserId(metadata: Prisma.JsonValue) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const result = userIdSchema.safeParse(metadata.userId ?? metadata.invitedUserId);
  return result.success ? result.data : null;
}

export function listGroupActivity(groupId: string, userId: string, cursor?: string) {
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        memberships: {
          where: { userId, leftAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!group) return { status: "GROUP_NOT_FOUND" } as const;
    if (group.memberships.length === 0) return { status: "FORBIDDEN" } as const;

    const where = { groupId, action: { in: groupActivityActions } };
    if (cursor) {
      const anchor = await tx.auditEvent.findFirst({
        where: { ...where, id: cursor },
        select: { id: true },
      });
      if (!anchor) return { status: "INVALID_CURSOR" } as const;
    }

    const rows = await tx.auditEvent.findMany({
      where,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      select: {
        id: true, actorId: true, action: true, entityType: true,
        entityId: true, metadata: true, createdAt: true,
      },
    });

    const page = rows.slice(0, pageSize).map((event) => ({
      ...event, targetId: targetUserId(event.metadata),
    }));
    const ids = new Set<string>();
    for (const { actorId, targetId } of page) {
      if (actorId) ids.add(actorId);
      if (targetId) ids.add(targetId);
    }
    const users = ids.size > 0 ? await tx.user.findMany({
      where: { id: { in: [...ids] }, deletedAt: null },
      select: { id: true, displayName: true, username: true },
    }) : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    return {
      status: "OK",
      data: page.map(({ actorId, targetId, ...event }) => ({
        ...event,
        actor: actorId ? usersById.get(actorId) ?? null : null,
        targetUser: targetId ? usersById.get(targetId) ?? null : null,
      })),
      pagination: { nextCursor: rows.length > pageSize ? page[pageSize - 1].id : null },
    } as const;
  }, { isolationLevel: "RepeatableRead" });
}
