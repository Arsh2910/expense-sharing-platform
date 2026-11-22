import { Queue } from "bullmq";

export const emailQueueName = "email-outbox";

function redisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not configured");
  return { url };
}

export async function enqueueEmailOutbox(outboxId: string) {
  const queue = new Queue(emailQueueName, { connection: redisConnection() });
  try {
    await queue.add("deliver-email", { outboxId }, {
      jobId: `email-outbox:${outboxId}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    });
  } finally {
    await queue.close();
  }
}
