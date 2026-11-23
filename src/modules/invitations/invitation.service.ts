import { randomBytes } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { enqueueEmailOutbox } from "../../queues/email.queue.js";
import { hashToken } from "../auth/token.service.js";
import type { CreateInvitationInput } from "./invitation.schema.js";

type InvitationErrorCode =
  | "GROUP_NOT_FOUND" | "GROUP_ARCHIVED" | "FORBIDDEN" | "USER_NOT_FOUND"
  | "USER_INACTIVE" | "ALREADY_MEMBER" | "INVITATION_NOT_FOUND"
  | "INVITATION_EXPIRED" | "INVITATION_NOT_FOR_USER" | "INVITATION_ALREADY_HANDLED"
  | "INVITATION_TOKEN_INVALID" | "INVITATION_NOT_EMAIL";

export class InvitationServiceError extends Error {
  constructor(message: string, public readonly code: InvitationErrorCode) {
    super(message);
    this.name = "InvitationServiceError";
  }
}

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const invitationInclude = {
  group: { select: { id: true, name: true, currency: true, archivedAt: true } },
  invitedUser: { select: { username: true, displayName: true } },
} as const;

type Invitation = Prisma.GroupInvitationGetPayload<{ include: typeof invitationInclude }>;

function response(invitation: Invitation) {
  const { tokenHash, invitedById, ...data } = invitation;
  return {
    ...data,
    status: data.status === "PENDING" && data.expiresAt <= new Date() ? "EXPIRED" : data.status,
  };
}

async function requireInvitePermission(tx: Prisma.TransactionClient, groupId: string, userId: string) {
  const group = await tx.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, archivedAt: true },
  });
  if (!group) throw new InvitationServiceError("Group not found", "GROUP_NOT_FOUND");

  const actor = await tx.groupMembership.findFirst({
    where: { groupId, userId, leftAt: null, role: { in: ["OWNER", "ADMIN"] } },
    select: { id: true },
  });
  if (!actor) throw new InvitationServiceError("Only group owners and admins can manage invitations", "FORBIDDEN");
  return group;
}

export async function expireInvitations() {
  await prisma.groupInvitation.updateMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });
}

async function createEmailOutbox(tx: Prisma.TransactionClient, invitation: Invitation, recipient: string, token: string) {
  const outbox = await tx.emailOutbox.create({
    data: {
      type: "GROUP_INVITATION",
      recipient,
      payload: {
        invitationId: invitation.id,
        token,
        groupName: invitation.group.name,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    },
    select: { id: true },
  });
  return outbox.id;
}

async function enqueueAfterCommit(outboxId?: string) {
  if (!outboxId || !process.env.REDIS_URL) return;
  try {
    await enqueueEmailOutbox(outboxId);
  } catch (error) {
    console.error("Could not enqueue invitation email", error);
  }
}

export async function createInvitation(groupId: string, actorUserId: string, input: CreateInvitationInput) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const group = await requireInvitePermission(tx, groupId, actorUserId);
      if (group.archivedAt) throw new InvitationServiceError("Group is archived", "GROUP_ARCHIVED");

      const targetFields = { id: true, email: true, status: true, deletedAt: true } as const;
      const target = "username" in input
        ? await tx.user.findUnique({ where: { username: input.username }, select: targetFields })
        : await tx.user.findFirst({
            where: { email: { equals: input.email, mode: "insensitive" }, deletedAt: null },
            select: targetFields,
          });
      if (target && (target.status !== "ACTIVE" || target.deletedAt)) {
        throw new InvitationServiceError("Inactive users cannot be invited", "USER_INACTIVE");
      }
      if (!target && "username" in input) {
        throw new InvitationServiceError("User not found", "USER_NOT_FOUND");
      }
      if (target) await requireNoMembership(tx, groupId, target.id);

      // A past-due row no longer occupies the partial unique index for pending invitations.
      const now = new Date();
      await tx.groupInvitation.updateMany({
        where: { groupId, status: "PENDING", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });

      // A recipient may have registered after their original email invitation was created.
      if (target && await tx.groupInvitation.findFirst({
        where: {
          groupId,
          status: "PENDING",
          invitedEmail: { equals: target.email, mode: "insensitive" },
        },
        select: { id: true },
      })) {
        throw new InvitationServiceError("A pending invitation already exists", "INVITATION_ALREADY_HANDLED");
      }

      const invitedEmail = !target && "email" in input ? input.email : null;
      const token = invitedEmail ? randomBytes(32).toString("base64url") : null;
      const invitation = await tx.groupInvitation.create({
        data: {
          groupId,
          invitedUserId: target?.id ?? null,
          invitedEmail,
          tokenHash: token ? hashToken(token) : null,
          invitedById: actorUserId,
          expiresAt: new Date(now.getTime() + invitationLifetimeMs),
        },
        include: invitationInclude,
      });
      if (target) {
        await tx.notification.create({
          data: { recipientId: target.id, invitationId: invitation.id },
        });
      }

      const outboxId = invitedEmail && token
        ? await createEmailOutbox(tx, invitation, invitedEmail, token)
        : undefined;
      return { invitation: response(invitation), outboxId };
    });
    await enqueueAfterCommit(result.outboxId);
    return result.invitation;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new InvitationServiceError("A pending invitation already exists", "INVITATION_ALREADY_HANDLED");
    }
    throw error;
  }
}

async function requireNoMembership(tx: Prisma.TransactionClient, groupId: string, userId: string) {
  const membership = await tx.groupMembership.findFirst({
    where: { groupId, userId, leftAt: null },
    select: { id: true },
  });
  if (membership) throw new InvitationServiceError("User is already an active member", "ALREADY_MEMBER");
}

export async function listGroupInvitations(groupId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await requireInvitePermission(tx, groupId, userId);
    const invitations = await tx.groupInvitation.findMany({
      where: { groupId }, orderBy: { createdAt: "desc" }, include: invitationInclude,
    });
    return invitations.map(response);
  });
}

export async function listMyInvitations(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId }, select: { email: true, emailVerifiedAt: true },
  });
  const invitations = await prisma.groupInvitation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { gt: new Date() },
      group: { archivedAt: null },
      OR: [
        { invitedUserId: userId },
        ...(user.emailVerifiedAt ? [{ invitedEmail: { equals: user.email, mode: "insensitive" as const } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    include: invitationInclude,
  });
  return invitations.map(response);
}

async function getInvitation(tx: Prisma.TransactionClient, invitationId: string, groupId?: string) {
  const invitation = await tx.groupInvitation.findFirst({
    where: { id: invitationId, groupId }, include: invitationInclude,
  });
  if (!invitation) throw new InvitationServiceError("Invitation not found", "INVITATION_NOT_FOUND");
  return invitation;
}

function requirePending(invitation: Invitation, now: Date) {
  if (invitation.status === "EXPIRED" || (invitation.status === "PENDING" && invitation.expiresAt <= now)) {
    throw new InvitationServiceError("Invitation has expired", "INVITATION_EXPIRED");
  }
  if (invitation.status !== "PENDING") {
    throw new InvitationServiceError("Invitation has already been handled", "INVITATION_ALREADY_HANDLED");
  }
}

async function updatePending(
  tx: Prisma.TransactionClient, invitation: Invitation, now: Date, data: Prisma.GroupInvitationUpdateManyMutationInput,
) {
  const [updated] = await tx.groupInvitation.updateManyAndReturn({
    where: {
      id: invitation.id,
      status: "PENDING",
      expiresAt: { gt: now, equals: invitation.expiresAt },
      tokenHash: invitation.tokenHash,
    },
    data,
  });
  if (!updated) throw new InvitationServiceError("Invitation changed. Refresh and try again.", "INVITATION_ALREADY_HANDLED");
  return { ...invitation, ...updated };
}

export async function revokeInvitation(groupId: string, invitationId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await requireInvitePermission(tx, groupId, userId);
    const invitation = await getInvitation(tx, invitationId, groupId);
    const now = new Date();
    requirePending(invitation, now);
    return response(await updatePending(tx, invitation, now, { status: "REVOKED", revokedAt: now }));
  });
}

export async function resendInvitation(groupId: string, invitationId: string, userId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const group = await requireInvitePermission(tx, groupId, userId);
    if (group.archivedAt) throw new InvitationServiceError("Group is archived", "GROUP_ARCHIVED");
    const invitation = await getInvitation(tx, invitationId, groupId);
    const now = new Date();
    requirePending(invitation, now);
    if (!invitation.invitedEmail) {
      throw new InvitationServiceError("Only email invitations can be resent", "INVITATION_NOT_EMAIL");
    }
    const token = randomBytes(32).toString("base64url");
    const updated = await updatePending(tx, invitation, now, {
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + invitationLifetimeMs),
    });
    const outboxId = await createEmailOutbox(tx, updated, invitation.invitedEmail, token);
    return { invitation: response(updated), outboxId };
  });
  await enqueueAfterCommit(result.outboxId);
  return result.invitation;
}

async function respondToInvitation(invitationId: string, userId: string, action: "ACCEPTED" | "DECLINED", token?: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const invitation = await getInvitation(tx, invitationId);
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true, emailVerifiedAt: true, status: true, deletedAt: true },
      });
      if (!user || user.status !== "ACTIVE" || user.deletedAt) {
        throw new InvitationServiceError("User not found", "USER_NOT_FOUND");
      }
      const matchesEmail = user.emailVerifiedAt && invitation.invitedEmail?.toLowerCase() === user.email.toLowerCase();
      if (invitation.invitedUserId !== userId && !matchesEmail) {
        throw new InvitationServiceError("This invitation is not for the current user", "INVITATION_NOT_FOR_USER");
      }
      const now = new Date();
      requirePending(invitation, now);
      if (token && invitation.tokenHash !== hashToken(token)) {
        throw new InvitationServiceError("This invitation link is invalid or has been replaced", "INVITATION_TOKEN_INVALID");
      }
      if (invitation.group.archivedAt) throw new InvitationServiceError("Group is archived", "GROUP_ARCHIVED");

      if (action === "DECLINED") {
        await updatePending(tx, invitation, now, { status: action, declinedAt: now });
        return { id: invitationId, status: action };
      }

      // Claim the transition before making any membership changes. All writes commit together.
      const accepted = await updatePending(tx, invitation, now, { status: action, acceptedAt: now });
      await requireNoMembership(tx, invitation.groupId, userId);
      await tx.groupMembership.create({
        data: { groupId: invitation.groupId, userId, role: "MEMBER" },
      });
      await tx.groupBalance.upsert({
        where: { groupId_userId: { groupId: invitation.groupId, userId } },
        create: { groupId: invitation.groupId, userId, amount: 0n },
        update: {},
      });
      return response(accepted);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new InvitationServiceError("User is already an active member", "ALREADY_MEMBER");
    }
    throw error;
  }
}

export function acceptInvitation(invitationId: string, userId: string, token?: string) {
  return respondToInvitation(invitationId, userId, "ACCEPTED", token);
}

export function declineInvitation(invitationId: string, userId: string, token?: string) {
  return respondToInvitation(invitationId, userId, "DECLINED", token);
}
