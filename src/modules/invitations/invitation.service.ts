import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { hashToken } from "../auth/token.service.js";
import { enqueueEmailOutbox } from "../../queues/email.queue.js";
import type { CreateInvitationInput } from "./invitation.schema.js";

type InvitationErrorCode =
  | "GROUP_NOT_FOUND"
  | "GROUP_ARCHIVED"
  | "FORBIDDEN"
  | "USER_NOT_FOUND"
  | "USER_INACTIVE"
  | "ALREADY_MEMBER"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_EXPIRED"
  | "INVITATION_NOT_FOR_USER"
  | "INVITATION_ALREADY_HANDLED";

export class InvitationServiceError extends Error {
  constructor(
    message: string,
    public readonly code: InvitationErrorCode,
  ) {
    super(message);
    this.name = "InvitationServiceError";
  }
}

const invitationDays = 7;
const invitationInclude = {
  group: { select: { id: true, name: true, currency: true } },
} as const;

function response(invitation: any) {
  return {
    id: invitation.id,
    groupId: invitation.groupId,
    group: invitation.group,
    invitedUserId: invitation.invitedUserId,
    invitedEmail: invitation.invitedEmail,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    declinedAt: invitation.declinedAt,
    revokedAt: invitation.revokedAt,
    createdAt: invitation.createdAt,
  };
}

async function requireInvitePermission(
  tx: any,
  groupId: string,
  actorUserId: string,
) {
  const group = await tx.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, currency: true, archivedAt: true },
  });
  if (!group)
    throw new InvitationServiceError("Group not found", "GROUP_NOT_FOUND");
  if (group.archivedAt)
    throw new InvitationServiceError(
      "Archived groups cannot receive invitations",
      "GROUP_ARCHIVED",
    );
  const actor = await tx.groupMembership.findFirst({
    where: { groupId, userId: actorUserId, leftAt: null },
    select: { role: true },
  });
  if (!actor || (actor.role !== "OWNER" && actor.role !== "ADMIN")) {
    throw new InvitationServiceError(
      "Only group owners and admins can invite members",
      "FORBIDDEN",
    );
  }
  return group;
}

export async function createInvitation(
  groupId: string,
  actorUserId: string,
  input: CreateInvitationInput,
) {
  const result = await prisma.$transaction(async (tx) => {
    const group = await requireInvitePermission(tx, groupId, actorUserId);
    const target =
      "username" in input
        ? await tx.user.findUnique({
            where: { username: input.username },
            select: { id: true, email: true, status: true },
          })
        : await tx.user.findFirst({
            where: { email: { equals: input.email, mode: "insensitive" } },
            select: { id: true, email: true, status: true },
          });
    if (target && target.status !== "ACTIVE")
      throw new InvitationServiceError(
        "Inactive users cannot be invited",
        "USER_INACTIVE",
      );
    const invitedUserId = target?.id ?? null;
    const invitedEmail = invitedUserId
      ? null
      : "email" in input
        ? input.email
        : null;
    if (!invitedUserId && !invitedEmail)
      throw new InvitationServiceError("User not found", "USER_NOT_FOUND");
    if (invitedUserId) {
      const member = await tx.groupMembership.findFirst({
        where: { groupId, userId: invitedUserId, leftAt: null },
        select: { id: true },
      });
      if (member)
        throw new InvitationServiceError(
          "User is already an active member",
          "ALREADY_MEMBER",
        );
    }
    const existing = await tx.groupInvitation.findFirst({
      where: {
        groupId,
        status: "PENDING",
        ...(invitedUserId ? { invitedUserId } : { invitedEmail }),
      },
      select: { id: true },
    });
    if (existing)
      throw new InvitationServiceError(
        "A pending invitation already exists",
        "INVITATION_ALREADY_HANDLED",
      );
    const rawToken = randomBytes(32).toString("base64url");
    const invitation = await tx.groupInvitation.create({
      data: {
        groupId,
        invitedUserId,
        invitedEmail,
        tokenHash: invitedUserId ? null : hashToken(rawToken),
        invitedById: actorUserId,
        expiresAt: new Date(Date.now() + invitationDays * 24 * 60 * 60 * 1000),
      },
      include: invitationInclude,
    });
    let outboxId: string | undefined;
    if (!invitedUserId) {
      const outbox = await tx.emailOutbox.create({
        data: {
          type: "GROUP_INVITATION",
          recipient: invitedEmail!,
          payload: {
            invitationId: invitation.id,
            token: rawToken,
            groupName: group.name,
            expiresAt: invitation.expiresAt.toISOString(),
          },
        },
      });
      outboxId = outbox.id;
    }
    // The raw token is intentionally not returned through the API. It is
    // available only to the trusted delivery worker through the outbox.
    return { invitation: response(invitation), outboxId };
  });
  if (result.outboxId && process.env.REDIS_URL) {
    try {
      await enqueueEmailOutbox(result.outboxId);
    } catch (error) {
      // The outbox is durable; a later reconciler can enqueue it again.
      console.error("Could not enqueue invitation email", error);
    }
  }
  return result.invitation;
}

export async function listMyInvitations(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });
  const invitations = await prisma.groupInvitation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { gt: new Date() },
      OR: [{ invitedUserId: userId }, { invitedEmail: user.email }],
    },
    orderBy: { createdAt: "desc" },
    include: invitationInclude,
  });
  return invitations.map(response);
}

export async function acceptInvitation(invitationId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.groupInvitation.findUnique({
      where: { id: invitationId },
      include: {
        ...invitationInclude,
        group: {
          select: { id: true, name: true, currency: true, archivedAt: true },
        },
      },
    });
    if (!invitation)
      throw new InvitationServiceError(
        "Invitation not found",
        "INVITATION_NOT_FOUND",
      );
    if (invitation.status !== "PENDING")
      throw new InvitationServiceError(
        "Invitation has already been handled",
        "INVITATION_ALREADY_HANDLED",
      );
    if (invitation.expiresAt <= new Date())
      throw new InvitationServiceError(
        "Invitation has expired",
        "INVITATION_EXPIRED",
      );
    if (invitation.group.archivedAt)
      throw new InvitationServiceError("Group is archived", "GROUP_ARCHIVED");
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true },
    });
    if (!user || user.status !== "ACTIVE")
      throw new InvitationServiceError("User not found", "USER_NOT_FOUND");
    if (
      invitation.invitedUserId !== userId &&
      invitation.invitedEmail?.toLowerCase() !== user.email.toLowerCase()
    ) {
      throw new InvitationServiceError(
        "This invitation is not for the current user",
        "INVITATION_NOT_FOR_USER",
      );
    }
    const member = await tx.groupMembership.findFirst({
      where: { groupId: invitation.groupId, userId, leftAt: null },
      select: { id: true },
    });
    if (member)
      throw new InvitationServiceError(
        "User is already an active member",
        "ALREADY_MEMBER",
      );
    await tx.groupMembership.create({
      data: { groupId: invitation.groupId, userId, role: "MEMBER" },
    });
    await tx.groupBalance.upsert({
      where: { groupId_userId: { groupId: invitation.groupId, userId } },
      create: { groupId: invitation.groupId, userId, amount: 0n },
      update: {},
    });
    const accepted = await tx.groupInvitation.update({
      where: { id: invitationId },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
      include: invitationInclude,
    });
    return response(accepted);
  });
}

export async function declineInvitation(invitationId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const invitation = await tx.groupInvitation.findUnique({
      where: { id: invitationId },
      select: {
        id: true,
        invitedUserId: true,
        invitedEmail: true,
        status: true,
        expiresAt: true,
      },
    });
    if (!user || !invitation)
      throw new InvitationServiceError(
        "Invitation not found",
        "INVITATION_NOT_FOUND",
      );
    if (invitation.status !== "PENDING")
      throw new InvitationServiceError(
        "Invitation has already been handled",
        "INVITATION_ALREADY_HANDLED",
      );
    if (invitation.expiresAt <= new Date())
      throw new InvitationServiceError(
        "Invitation has expired",
        "INVITATION_EXPIRED",
      );
    if (
      invitation.invitedUserId !== userId &&
      invitation.invitedEmail?.toLowerCase() !== user.email.toLowerCase()
    ) {
      throw new InvitationServiceError(
        "This invitation is not for the current user",
        "INVITATION_NOT_FOR_USER",
      );
    }
    await tx.groupInvitation.update({
      where: { id: invitationId },
      data: { status: "DECLINED", declinedAt: new Date() },
    });
    return { id: invitationId, status: "DECLINED" as const };
  });
}
