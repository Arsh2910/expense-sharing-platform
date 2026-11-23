import { Queue } from "bullmq";

export const emailQueueName = "email-outbox";

export function redisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not configured");
  return { url };
}

export async function enqueueEmailOutbox(outboxId: string) {
  await enqueueEmailOutboxBatch([outboxId]);
}

export async function enqueueEmailOutboxBatch(outboxIds: string[]) {
  if (outboxIds.length === 0) return;

  const queue = new Queue(emailQueueName, {
    connection: {
      ...redisConnection(),
      enableOfflineQueue: false,
      connectTimeout: 2_000,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    },
  });
  queue.on("error", () => { /* Readiness and enqueue errors propagate to the caller. */ });
  try {
    await queue.waitUntilReady();
    await queue.addBulk(outboxIds.map((outboxId) => ({
      name: "deliver-email",
      data: { outboxId },
      opts: {
        jobId: `email-outbox-${outboxId}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    })));
  } finally {
    await queue.close();
  }
}
