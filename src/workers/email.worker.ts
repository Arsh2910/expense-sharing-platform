import { Worker } from "bullmq";
import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { sendInvitationEmail } from "../modules/email/email.service.js";
import { emailQueueName } from "../queues/email.queue.js";

type InvitationPayload = { invitationId: string; token: string; groupName: string; expiresAt: string };

function redisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not configured");
  return { url };
}

function parseInvitationPayload(value: unknown): InvitationPayload {
  if (typeof value !== "object" || value === null) throw new Error("Invalid email payload");
  const payload = value as Record<string, unknown>;
  if (["invitationId", "token", "groupName", "expiresAt"].some((key) => typeof payload[key] !== "string")) {
    throw new Error("Invalid invitation email payload");
  }
  return payload as unknown as InvitationPayload;
}

async function deliverEmailOutbox(outboxId: string) {
  const record = await prisma.$transaction(async (tx) => {
    const claimed = await tx.emailOutbox.updateMany({
      where: { id: outboxId, status: { in: ["PENDING", "FAILED"] }, availableAt: { lte: new Date() } },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) return null;
    return tx.emailOutbox.findUnique({ where: { id: outboxId } });
  });
  if (!record) return;

  try {
    if (record.type !== "GROUP_INVITATION") throw new Error(`Unsupported email type: ${record.type}`);
    await sendInvitationEmail({ recipient: record.recipient, ...parseInvitationPayload(record.payload) });
    await prisma.emailOutbox.update({ where: { id: record.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email delivery error";
    await prisma.emailOutbox.update({ where: { id: record.id }, data: { status: "FAILED", availableAt: new Date(Date.now() + 30_000), lastError: message } });
    throw error;
  }
}

const worker = new Worker(emailQueueName, async (job) => deliverEmailOutbox(job.data.outboxId), { connection: redisConnection(), concurrency: 5 });
worker.on("completed", (job) => console.log(`Email job completed: ${job.id}`));
worker.on("failed", (job, error) => console.error(`Email job failed: ${job?.id}`, error));

const shutdown = async () => { await worker.close(); await prisma.$disconnect(); };
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
