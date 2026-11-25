import { Worker } from "bullmq";
import "dotenv/config";
import { validateEnvironment } from "../config/environment.js";

import { emailQueueName, redisConnection } from "../queues/email.queue.js";

validateEnvironment("email-worker");
const { prisma } = await import("../lib/prisma.js");
const { OutboxDeliveryError, deliverEmailOutbox, protectLegacyEmailTokens, pruneCompletedEmails, reconcileEmailOutbox } =
  await import("../modules/email/email-outbox.service.js");
const { expireInvitations } = await import("../modules/invitations/invitation.service.js");

const worker = new Worker<{ outboxId: string }>(
  emailQueueName,
  (job) => deliverEmailOutbox(job.data.outboxId),
  { connection: redisConnection(), concurrency: 5 },
);
worker.on("completed", (job) => console.log(`Email job completed: ${job.id}`));
worker.on("failed", (job, error) => console.error(
  `Email job failed: ${job?.id}`,
  error instanceof OutboxDeliveryError ? error.message : "Outbox processing failed",
));
worker.on("error", () => console.error("Email worker error"));

let reconciliation: Promise<void> | undefined;
let nextCleanupAt = 0;

async function reconcileAndMaintain() {
  await expireInvitations();
  await reconcileEmailOutbox();
  await protectLegacyEmailTokens();
  if (Date.now() >= nextCleanupAt) {
    await pruneCompletedEmails();
    nextCleanupAt = Date.now() + 60 * 60_000;
  }
}
function reconcile() {
  reconciliation ??= reconcileAndMaintain()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Email outbox reconciliation failed: ${message}`);
    })
    .finally(() => { reconciliation = undefined; });
}

const timer = setInterval(reconcile, 15_000);
reconcile();

async function shutdown() {
  clearInterval(timer);
  await Promise.all([worker.close(), reconciliation]);
  await prisma.$disconnect();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
