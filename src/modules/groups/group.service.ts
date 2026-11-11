import { prisma } from "../../lib/prisma.js";
import type {
  AddGroupMemberInput,
  CreateGroupInput,
} from "./group.schema.js";

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
      | "USER_NOT_FOUND"
      | "USER_INACTIVE"
      | "ALREADY_MEMBER",
  ) {
    super(message);
    this.name = "GroupMembershipError";
  }
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
    return tx.group.create({
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

export async function addGroupMember(
  groupId: string,
  actorUserId: string,
  input: AddGroupMemberInput,
) {
  try {
    return await prisma.$transaction(async (tx) => {
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
          "Archived groups cannot accept new members",
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

      if (
        !actorMembership ||
        (actorMembership.role !== "OWNER" && actorMembership.role !== "ADMIN")
      ) {
        throw new GroupMembershipError(
          "Only group owners and admins can add members",
          "FORBIDDEN",
        );
      }

      const targetUser = await tx.user.findFirst({
        where: {
          email: {
            equals: input.email,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!targetUser) {
        throw new GroupMembershipError(
          "Target user not found",
          "USER_NOT_FOUND",
        );
      }

      if (targetUser.status !== "ACTIVE") {
        throw new GroupMembershipError(
          "Inactive users cannot be added to groups",
          "USER_INACTIVE",
        );
      }

      const existingMembership = await tx.groupMembership.findFirst({
        where: {
          groupId,
          userId: targetUser.id,
          leftAt: null,
        },
        select: {
          id: true,
        },
      });

      if (existingMembership) {
        throw new GroupMembershipError(
          "User is already an active member of this group",
          "ALREADY_MEMBER",
        );
      }

      return tx.groupMembership.create({
        data: {
          groupId,
          userId: targetUser.id,
          role: "MEMBER",
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
    });
  } catch (error) {
    if (
      isPrismaUniqueConstraintError(error) &&
      isActiveMembershipConstraintViolation(error) &&
      (await prisma.groupMembership.findFirst({
        where: {
          groupId,
          user: {
            email: {
              equals: input.email,
              mode: "insensitive",
            },
          },
          leftAt: null,
        },
        select: { id: true },
      }))
    ) {
      throw new GroupMembershipError(
        "User is already an active member of this group",
        "ALREADY_MEMBER",
      );
    }

    throw error;
  }
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

function isPrismaUniqueConstraintError(
  error: unknown,
): error is {
  code: "P2002";
  meta?: {
    target?: unknown;
    driverAdapterError?: {
      cause?: {
        kind?: unknown;
        constraint?: {
          index?: unknown;
        };
      };
    };
  };
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isActiveMembershipConstraintViolation(
  error: {
    meta?: {
      target?: unknown;
      driverAdapterError?: {
        cause?: {
          kind?: unknown;
          constraint?: {
            index?: unknown;
          };
        };
      };
    };
  },
) {
  const target = error.meta?.target;
  const adapterCause = error.meta?.driverAdapterError?.cause;

  return (
    target === "one_active_membership" ||
    (adapterCause?.kind === "UniqueConstraintViolation" &&
      adapterCause.constraint?.index === "one_active_membership") ||
    (Array.isArray(target) &&
      target.length === 2 &&
      ((target[0] === "userId" && target[1] === "groupId") ||
        (target[0] === "user_id" && target[1] === "group_id")))
  );
}
