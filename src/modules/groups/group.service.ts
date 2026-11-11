import { prisma } from "../../lib/prisma.js";
import type { CreateGroupInput } from "./group.schema.js";

export class GroupServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "USER_NOT_FOUND" | "USER_INACTIVE",
  ) {
    super(message);
    this.name = "GroupServiceError";
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
