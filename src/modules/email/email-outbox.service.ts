import { prisma } from "../../lib/prisma.js";
import { enqueueEmailOutboxBatch } from "../../queues/email.queue.js";
import { sendInvitationEmail } from "./email.service.js";

const claimDurationMs = 5 * 60_000;
const maxAttempts = 5;

type InvitationPayload = { invitationId: string; token: string; groupName: string; expiresAt: string };

function parseInvitationPayload(value: unknown): InvitationPayload {
  if (typeof value !== "object" || value === null) throw new Error("Invalid email payload");
  const { invitationId, token, groupName, expiresAt } = value as Record<string, unknown>;
  if (typeof invitationId !== "string" || typeof token !== "string" || typeof groupName !== "string"
    || typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt))) {
    throw new Error("Invalid invitation email payload");
  }
  return { invitationId, token, groupName, expiresAt };
}

function dueOutbox(now: Date) {
  return {
    availableAt: { lte: now },
    // While processing, availableAt is the claim deadline.
    OR: [
      { status: "PROCESSING" as const },
      { status: { in: ["PENDING" as const, "FAILED" as const] }, attempts: { lt: maxAttempts } },
    ],
  };
}

export async function reconcileEmailOutbox() {
  const records = await prisma.emailOutbox.findMany({
    where: dueOutbox(new Date()),
    select: { id: true },
    orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    take: 100,
  });

  await enqueueEmailOutboxBatch(records.map((record) => record.id));
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
    if (record.type !== "GROUP_INVITATION") throw new Error(`Unsupported email type: ${record.type}`);
    const payload = parseInvitationPayload(record.payload);
    if (Date.parse(payload.expiresAt) <= Date.now()) {
      throw new Error("Invitation email expired");
    }
    await sendInvitationEmail({ recipient: record.recipient, ...payload }, `email-outbox/${record.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email delivery error";
    await prisma.emailOutbox.updateMany({
      where: claim,
      data: {
        status: "FAILED",
        availableAt: new Date(Date.now() + 30_000 * 2 ** Math.min(record.attempts - 1, maxAttempts - 1)),
        lastError: message,
      },
    });
    throw error;
  }

  await prisma.emailOutbox.updateMany({
    where: claim,
    data: { status: "SENT", sentAt: new Date(), lastError: null },
  });
}
