import { prisma } from "../../lib/prisma.js";
import { enqueueEmailOutboxBatch } from "../../queues/email.queue.js";
import { hashToken } from "../auth/token.service.js";
import { sendInvitationEmail, sendPasswordResetEmail, sendVerificationEmail } from "./email.service.js";

import { decryptResetToken } from "./reset-token-crypto.js";

const claimDurationMs = 5 * 60_000;
const maxAttempts = 5;

class PermanentEmailError extends Error {}

function parseVerificationPayload(value: unknown): { userId: string; token: string; purpose: "EMAIL" | "EMAIL_CHANGE" } {
  if (typeof value !== "object" || value === null) throw new PermanentEmailError("Invalid verification payload");
  const { userId, token, purpose } = value as Record<string, unknown>;
  if (typeof userId !== "string" || typeof token !== "string" || (purpose !== "EMAIL" && purpose !== "EMAIL_CHANGE")) {
    throw new PermanentEmailError("Invalid verification payload");
  }
  return { userId, token, purpose };
}

type InvitationPayload = { invitationId: string; token: string; groupName: string; expiresAt: string };

function parseInvitationPayload(value: unknown): InvitationPayload {
  if (typeof value !== "object" || value === null) throw new PermanentEmailError("Invalid email payload");
  const { invitationId, token, groupName, expiresAt } = value as Record<string, unknown>;
  if (typeof invitationId !== "string" || typeof token !== "string" || typeof groupName !== "string"
    || typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt))) {
    throw new PermanentEmailError("Invalid invitation email payload");
  }
  return { invitationId, token, groupName, expiresAt };
}

function dueOutbox(now: Date) {
  return {
    availableAt: { lte: now },
    attempts: { lt: maxAttempts },
    // While processing, availableAt is the claim deadline.
    status: { in: ["PENDING" as const, "FAILED" as const, "PROCESSING" as const] },
  };
}

export async function reconcileEmailOutbox() {
  const now = new Date();
  await prisma.emailOutbox.updateMany({
    where: {
      attempts: { gte: maxAttempts },
      OR: [{ status: "FAILED" }, { status: "PROCESSING", availableAt: { lte: now } }],
    },
    data: { status: "DEAD" },
  });
  const records = await prisma.emailOutbox.findMany({
    where: dueOutbox(now),
    select: { id: true },
    orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    take: 100,
  });

  await enqueueEmailOutboxBatch(records.map((record) => record.id));
}

export async function pruneCompletedEmails() {
  const retentionMs = 30 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - retentionMs);
  await prisma.emailOutbox.deleteMany({
    where: {
      type: { in: ["GROUP_INVITATION", "EMAIL_VERIFICATION", "PASSWORD_RESET"] },
      OR: [
        { status: "SENT", sentAt: { lt: cutoff } },
        { status: "DEAD", availableAt: { lt: cutoff } },
      ],
    },
  });
}

export async function deliverEmailOutbox(outboxId: string) {
  const now = new Date();
  const [record] = await prisma.emailOutbox.updateManyAndReturn({
    where: { id: outboxId, ...dueOutbox(now) },
    data: {
      status: "PROCESSING",
      availableAt: new Date(now.getTime() + claimDurationMs),
      attempts: { increment: 1 },
    },
  });
  if (!record) return;

  const claim = { id: record.id, status: "PROCESSING" as const, attempts: record.attempts };
  try {
    const idempotencyKey = `email-outbox/${record.id}`;
    if (record.type === "GROUP_INVITATION") {
      const payload = parseInvitationPayload(record.payload);
      if (Date.parse(payload.expiresAt) <= Date.now()) throw new PermanentEmailError("Invitation email expired");
      const invitation = await prisma.groupInvitation.findFirst({
        where: {
          id: payload.invitationId,
          invitedEmail: record.recipient,
          status: "PENDING",
          expiresAt: { gt: new Date() },
          tokenHash: hashToken(payload.token),
          group: { archivedAt: null },
        },
        select: { id: true },
      });
      if (!invitation) throw new PermanentEmailError("Invitation is no longer current");
      await sendInvitationEmail({ recipient: record.recipient, ...payload }, idempotencyKey);
    } else if (record.type === "EMAIL_VERIFICATION") {
      const { userId, token, purpose } = parseVerificationPayload(record.payload);
      const verification = await prisma.verificationToken.findFirst({
        where: {
          userId, purpose, tokenHash: hashToken(token), consumedAt: null, expiresAt: { gt: new Date() },
          user: {
            status: "ACTIVE",
            deletedAt: null,
            ...(purpose === "EMAIL" ? { email: record.recipient, emailVerifiedAt: null } : { pendingEmail: record.recipient }),
          },
        },
        select: { id: true },
      });
      if (!verification) throw new PermanentEmailError("Verification email is no longer current");
      await sendVerificationEmail({ recipient: record.recipient, token, purpose }, idempotencyKey);
    } else if (record.type === "PASSWORD_RESET") {
      if (!record.payload || typeof record.payload !== "object" || Array.isArray(record.payload)) {
        throw new PermanentEmailError("Invalid password reset email payload");
      }
      const { userId, encryptedToken } = record.payload;
      if (typeof userId !== "string" || typeof encryptedToken !== "string") {
        throw new PermanentEmailError("Invalid password reset email payload");
      }
      const token = decryptResetToken(encryptedToken);
      const reset = await prisma.verificationToken.findFirst({
        where: {
          userId, tokenHash: hashToken(token), purpose: "PASSWORD_RESET",
          consumedAt: null, expiresAt: { gt: new Date() },
          user: { status: "ACTIVE", deletedAt: null, emailVerifiedAt: { not: null }, email: record.recipient },
        },
        select: { id: true },
      });
      if (!reset) throw new PermanentEmailError("Password reset email is no longer current");
      await sendPasswordResetEmail(record.recipient, token, idempotencyKey);
    } else {
      throw new PermanentEmailError(`Unsupported email type: ${record.type}`);
    }
  } catch (error) {
    const message = record.type === "PASSWORD_RESET" && !(error instanceof PermanentEmailError)
      ? "Password reset email delivery failed"
      : error instanceof Error ? error.message : "Unknown email delivery error";
    const terminal = error instanceof PermanentEmailError || record.attempts >= maxAttempts;
    await prisma.emailOutbox.updateMany({
      where: claim,
      data: {
        status: terminal ? "DEAD" : "FAILED",
        ...(terminal && record.type === "PASSWORD_RESET" ? { payload: {} } : {}),
        availableAt: new Date(Date.now() + 30_000 * 2 ** Math.min(record.attempts - 1, maxAttempts - 1)),
        lastError: message,
      },
    });
    throw record.type === "PASSWORD_RESET" ? new Error(message) : error;
  }

  await prisma.emailOutbox.updateMany({
    where: claim,
    data: {
      status: "SENT", sentAt: new Date(), lastError: null,
      ...(record.type === "PASSWORD_RESET" ? { payload: {} } : {}),
    },
  });
}
