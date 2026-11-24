import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import type {
  CreateGroupInput,
  UpdateGroupInput,
  UpdateMemberRoleInput,
} from "./group.schema.js";
import type { GroupRole } from "./group.types.js";

export class GroupServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "USER_NOT_FOUND" | "USER_INACTIVE",
  ) {
    super(message);
    this.name = "GroupServiceError";
  }
}

export class GroupMembershipError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "GROUP_NOT_FOUND"
      | "GROUP_ARCHIVED"
      | "FORBIDDEN"
      | "MEMBER_NOT_FOUND"
      | "MEMBER_ALREADY_LEFT"
      | "CANNOT_REMOVE_LAST_OWNER"
      | "CANNOT_REMOVE_HIGHER_ROLE"
      | "CANNOT_DEMOTE_SOLE_OWNER"
      | "INVALID_ROLE_TRANSITION",
  ) {
    super(message);
    this.name = "GroupMembershipError";
  }
}

// Serialize group settings and membership transitions before reading their previous values.
async function lockGroupForMutation(tx: Prisma.TransactionClient, groupId: string) {
  await tx.$queryRaw`SELECT id FROM groups WHERE id = ${groupId}::uuid FOR NO KEY UPDATE`;
}

export async function createGroup(
  input: CreateGroupInput,
  ownerUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    // Verify the creator.
    const owner = await tx.user.findUnique({
      where: { id: ownerUserId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!owner) {
      throw new GroupServiceError("User not found", "USER_NOT_FOUND");
    }

    if (owner.status !== "ACTIVE") {
      throw new GroupServiceError(
        "Inactive users cannot create groups",
        "USER_INACTIVE",
      );
    }

    // Create group and initial owner membership atomically.
    const created = await tx.group.create({
      data: {
        name: input.name,
        currency: input.currency,

        memberships: {
          create: {
            user: {
              connect: { id: owner.id },
            },
            role: "OWNER",
          },
        },
        groupBalances: {
          create: {
            user: {
              connect: { id: owner.id },
            },
            amount: 0n,
          },
        },
      },

      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
        },
      },
    });
    await recordAuditEvent(tx, {
      groupId: created.id, actorId: ownerUserId, action: "GROUP_CREATED", entityId: created.id,
      metadata: { name: created.name },
    });
    return created;
  });
}

export async function listMyGroups(userId: string) {
  return prisma.group.findMany({
    where: {
      archivedAt: null,
      memberships: {
        some: {
          userId,
          leftAt: null,
        },
      },
    },
    select: {
      id: true,
      name: true,
      currency: true,
      createdAt: true,
      memberships: {
        where: {
          userId,
          leftAt: null,
        },
        select: {
          role: true,
          joinedAt: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getGroupDetails(groupId: string, actorUserId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      currency: true,
      createdAt: true,
      archivedAt: true,
    },
  });

  if (!group) {
    throw new GroupMembershipError("Group not found", "GROUP_NOT_FOUND");
  }

  const actorMembership = await prisma.groupMembership.findFirst({
    where: {
      groupId,
      userId: actorUserId,
      leftAt: null,
    },
    select: {
      role: true,
    },
  });

  if (!actorMembership) {
    throw new GroupMembershipError(
      "Only active group members can view group details",
      "FORBIDDEN",
    );
  }

  const memberCount = await prisma.groupMembership.count({
    where: {
      groupId,
      leftAt: null,
    },
  });

  return {
    ...group,
    memberCount,
    myRole: actorMembership.role as GroupRole,
  };
}

export async function updateGroup(
  groupId: string,
  actorUserId: string,
  input: UpdateGroupInput,
) {
  return prisma.$transaction(async (tx) => {
    await lockGroupForMutation(tx, groupId);
    const group = await tx.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        archivedAt: true,
        name: true,
      },
    });

    if (!group) {
      throw new GroupMembershipError("Group not found", "GROUP_NOT_FOUND");
    }

    if (group.archivedAt) {
      throw new GroupMembershipError(
        "Archived groups cannot be modified",
        "GROUP_ARCHIVED",
      );
    }

    const actorMembership = await tx.groupMembership.findFirst({
      where: {
        groupId,
        userId: actorUserId,
        leftAt: null,
      },
      select: {
        role: true,
      },
    });

    if (!actorMembership) {
      throw new GroupMembershipError(
        "Only active group members can update group settings",
        "FORBIDDEN",
      );
    }

    if (actorMembership.role !== "OWNER" && actorMembership.role !== "ADMIN") {
      throw new GroupMembershipError(
        "Only group owners and admins can update group settings",
        "FORBIDDEN",
      );
    }

    const updated = await tx.group.update({
      where: { id: groupId },
      data: {
        name: input.name,
      },
      select: {
        id: true,
        name: true,
        currency: true,
        createdAt: true,
        archivedAt: true,
      },
    });
    if (group.name !== updated.name) {
      await recordAuditEvent(tx, {
        groupId, actorId: actorUserId, action: "GROUP_RENAMED", entityId: groupId,
        metadata: { fromName: group.name, toName: updated.name },
      });
    }
    return updated;
  });
}

export async function archiveGroup(groupId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    await lockGroupForMutation(tx, groupId);
    const group = await tx.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        archivedAt: true,
      },
    });

    if (!group) {
      throw new GroupMembershipError("Group not found", "GROUP_NOT_FOUND");
    }

    if (group.archivedAt) {
      throw new GroupMembershipError(
        "Group is already archived",
        "GROUP_ARCHIVED",
      );
    }

    const actorMembership = await tx.groupMembership.findFirst({
      where: {
        groupId,
        userId: actorUserId,
        leftAt: null,
      },
      select: {
        role: true,
      },
    });

    if (!actorMembership) {
      throw new GroupMembershipError(
        "Only active group members can archive the group",
        "FORBIDDEN",
      );
    }

    if (actorMembership.role !== "OWNER") {
      throw new GroupMembershipError(
        "Only group owners can archive the group",
        "FORBIDDEN",
      );
    }

    const now = new Date();
    const archived = await tx.group.update({
      where: { id: groupId },
      data: {
        archivedAt: now,
      },
      select: {
        id: true,
        name: true,
        currency: true,
        createdAt: true,
        archivedAt: true,
      },
    });
    await recordAuditEvent(tx, { groupId, actorId: actorUserId, action: "GROUP_ARCHIVED", entityId: groupId });
    return archived;
  });
}

export async function listGroupMembers(groupId: string, actorUserId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true },
  });

  if (!group) {
    throw new GroupMembershipError("Group not found", "GROUP_NOT_FOUND");
  }

  const actorMembership = await prisma.groupMembership.findFirst({
    where: {
      groupId,
      userId: actorUserId,
      leftAt: null,
    },
    select: { id: true },
  });

  if (!actorMembership) {
    throw new GroupMembershipError(
      "Only active group members can view members",
      "FORBIDDEN",
    );
  }

  return prisma.groupMembership.findMany({
    where: {
      groupId,
      leftAt: null,
    },
    orderBy: [
      { joinedAt: "asc" },
      { id: "asc" },
    ],
    select: {
      id: true,
      role: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
  });
}

export async function removeGroupMember(
  groupId: string,
  actorUserId: string,
  targetUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockGroupForMutation(tx, groupId);
    const group = await tx.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        archivedAt: true,
      },
    });

    if (!group) {
      throw new GroupMembershipError("Group not found", "GROUP_NOT_FOUND");
    }

    if (group.archivedAt) {
      throw new GroupMembershipError(
        "Archived groups cannot be modified",
        "GROUP_ARCHIVED",
      );
    }

    const actorMembership = await tx.groupMembership.findFirst({
      where: {
        groupId,
        userId: actorUserId,
        leftAt: null,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!actorMembership) {
      throw new GroupMembershipError(
        "Only active group members can perform this action",
        "FORBIDDEN",
      );
    }

    const targetMembership = await tx.groupMembership.findFirst({
      where: {
        groupId,
        userId: targetUserId,
      },
      orderBy: { joinedAt: "desc" },
      select: {
        id: true,
        role: true,
        leftAt: true,
      },
    });

    if (!targetMembership) {
      throw new GroupMembershipError(
        "Target member not found in group",
        "MEMBER_NOT_FOUND",
      );
    }

    if (targetMembership.leftAt !== null) {
      throw new GroupMembershipError(
        "Member has already left this group",
        "MEMBER_ALREADY_LEFT",
      );
    }

    const now = new Date();
    const isSelfLeave = actorUserId === targetUserId;

    const recordRemoval = () => recordAuditEvent(tx, {
      groupId, actorId: actorUserId, action: isSelfLeave ? "MEMBER_LEFT" : "MEMBER_REMOVED",
      entityId: targetMembership.id, metadata: { userId: targetUserId },
    });

    if (isSelfLeave) {
      if (actorMembership.role === "OWNER") {
        const activeOwnerCount = await tx.groupMembership.count({
          where: {
            groupId,
            role: "OWNER",
            leftAt: null,
          },
        });

        if (activeOwnerCount <= 1) {
          // Sole owner is leaving. Find successor among active members.
          const successor = await tx.groupMembership.findFirst({
            where: {
              groupId,
              leftAt: null,
              userId: { not: actorUserId },
              user: { status: "ACTIVE" },
            },
            orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
            select: { id: true, userId: true, role: true },
          });

          await tx.groupMembership.update({
            where: { id: actorMembership.id },
            data: { leftAt: now },
          });

          await recordRemoval();

          if (successor) {
            await tx.groupMembership.update({
              where: { id: successor.id },
              data: { role: "OWNER" },
            });
            await recordAuditEvent(tx, {
              groupId, actorId: actorUserId, action: "MEMBER_ROLE_CHANGED", entityId: successor.id,
              metadata: { userId: successor.userId, fromRole: successor.role, toRole: "OWNER" },
            });

            return {
              groupId,
              removedUserId: targetUserId,
              leftAt: now,
              successorUserId: successor.userId,
              groupArchived: false,
            };
          } else {
            await tx.group.update({
              where: { id: groupId },
              data: { archivedAt: now },
            });
            await recordAuditEvent(tx, { groupId, actorId: actorUserId, action: "GROUP_ARCHIVED", entityId: groupId });

            return {
              groupId,
              removedUserId: targetUserId,
              leftAt: now,
              successorUserId: null,
              groupArchived: true,
            };
          }
        }
      }

      await tx.groupMembership.update({
        where: { id: targetMembership.id },
        data: { leftAt: now },
      });

      await recordRemoval();
      return {
        groupId,
        removedUserId: targetUserId,
        leftAt: now,
        successorUserId: null,
        groupArchived: false,
      };
    }

    // Forced removal by actor of another member
    if (actorMembership.role === "MEMBER") {
      throw new GroupMembershipError(
        "Regular members cannot remove other members",
        "FORBIDDEN",
      );
    }

    if (actorMembership.role === "ADMIN") {
      if (
        targetMembership.role === "OWNER" ||
        targetMembership.role === "ADMIN"
      ) {
        throw new GroupMembershipError(
          "Admins can only remove regular members",
          "CANNOT_REMOVE_HIGHER_ROLE",
        );
      }
    }

    if (actorMembership.role === "OWNER") {
      if (targetMembership.role === "OWNER") {
        const activeOwnerCount = await tx.groupMembership.count({
          where: {
            groupId,
            role: "OWNER",
            leftAt: null,
          },
        });

        if (activeOwnerCount <= 1) {
          throw new GroupMembershipError(
            "Cannot remove the only group owner",
            "CANNOT_REMOVE_LAST_OWNER",
          );
        }
      }
    }

    await tx.groupMembership.update({
      where: { id: targetMembership.id },
      data: { leftAt: now },
    });

    await recordRemoval();
    return {
      groupId,
      removedUserId: targetUserId,
      leftAt: now,
      successorUserId: null,
      groupArchived: false,
    };
  });
}

export async function updateMemberRole(
  groupId: string,
  actorUserId: string,
  targetUserId: string,
  input: UpdateMemberRoleInput,
) {
  return prisma.$transaction(async (tx) => {
    await lockGroupForMutation(tx, groupId);
    const group = await tx.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        archivedAt: true,
      },
    });

    if (!group) {
      throw new GroupMembershipError("Group not found", "GROUP_NOT_FOUND");
    }

    if (group.archivedAt) {
      throw new GroupMembershipError(
        "Archived groups cannot be modified",
        "GROUP_ARCHIVED",
      );
    }

    const actorMembership = await tx.groupMembership.findFirst({
      where: {
        groupId,
        userId: actorUserId,
        leftAt: null,
      },
      select: {
        role: true,
      },
    });

    if (!actorMembership) {
      throw new GroupMembershipError(
        "Only active group members can update member roles",
        "FORBIDDEN",
      );
    }

    if (actorMembership.role !== "OWNER") {
      throw new GroupMembershipError(
        "Only group owners can update member roles",
        "FORBIDDEN",
      );
    }

    const targetMembership = await tx.groupMembership.findFirst({
      where: {
        groupId,
        userId: targetUserId,
      },
      orderBy: { joinedAt: "desc" },
      select: {
        id: true,
        role: true,
        leftAt: true,
      },
    });

    if (!targetMembership) {
      throw new GroupMembershipError(
        "Target member not found in group",
        "MEMBER_NOT_FOUND",
      );
    }

    if (targetMembership.leftAt !== null) {
      throw new GroupMembershipError(
        "Member has already left this group",
        "MEMBER_ALREADY_LEFT",
      );
    }

    if (targetMembership.role === "OWNER" && input.role !== "OWNER") {
      const activeOwnerCount = await tx.groupMembership.count({
        where: {
          groupId,
          role: "OWNER",
          leftAt: null,
        },
      });

      if (activeOwnerCount <= 1) {
        throw new GroupMembershipError(
          "Cannot demote the only group owner",
          "CANNOT_DEMOTE_SOLE_OWNER",
        );
      }
    }

    const updated = await tx.groupMembership.update({
      where: { id: targetMembership.id },
      data: {
        role: input.role,
      },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
    if (targetMembership.role !== updated.role) {
      await recordAuditEvent(tx, {
        groupId, actorId: actorUserId, action: "MEMBER_ROLE_CHANGED", entityId: updated.id,
        metadata: { userId: targetUserId, fromRole: targetMembership.role, toRole: updated.role },
      });
    }
    return updated;
  });
}
