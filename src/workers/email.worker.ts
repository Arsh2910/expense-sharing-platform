import { Worker } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { deliverEmailOutbox, reconcileEmailOutbox } from "../modules/email/email-outbox.service.js";
import { emailQueueName, redisConnection } from "../queues/email.queue.js";

const worker = new Worker<{ outboxId: string }>(
  emailQueueName,
  (job) => deliverEmailOutbox(job.data.outboxId),
  { connection: redisConnection(), concurrency: 5 },
);
worker.on("completed", (job) => console.log(`Email job completed: ${job.id}`));
worker.on("failed", (job, error) => console.error(`Email job failed: ${job?.id}`, error));
worker.on("error", (error) => console.error("Email worker error", error));

let reconciliation: Promise<void> | undefined;
function reconcile() {
  reconciliation ??= reconcileEmailOutbox()
    .catch((error) => console.error("Email outbox reconciliation failed", error))
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
