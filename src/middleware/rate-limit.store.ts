import { Redis } from "ioredis";

export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<{ count: number; remainingMs: number }>;
}

export function createMemoryRateLimitStore(now = Date.now): RateLimitStore {
  const buckets = new Map<string, { count: number; expiresAt: number }>();
  let nextCleanupAt = 0;

  return {
    async hit(key, windowMs) {
      const timestamp = now();
      if (timestamp >= nextCleanupAt) {
        for (const [id, bucket] of buckets) {
          if (bucket.expiresAt <= timestamp) buckets.delete(id);
        }
        nextCleanupAt = timestamp + 60_000;
      }

      let bucket = buckets.get(key);
      if (!bucket || bucket.expiresAt <= timestamp) {
        if (!bucket && buckets.size >= 10_000) {
          return { count: Number.POSITIVE_INFINITY, remainingMs: nextCleanupAt - timestamp };
        }
        bucket = { count: 0, expiresAt: timestamp + windowMs };
        buckets.set(key, bucket);
      }

      bucket.count += 1;
      return { count: bucket.count, remainingMs: bucket.expiresAt - timestamp };
    },
  };
}

// Increment and attach the expiry in the same Redis operation.
const hitScript = `
  local count = redis.call('INCR', KEYS[1])
  local ttl = redis.call('PTTL', KEYS[1])
  if ttl < 0 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  return { count, ttl }
`;

export function createRedisRateLimitStore(url: string) {
  const client = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    connectTimeout: 1_000,
    commandTimeout: 1_000,
  });
  // Requests report store failures without logging Redis errors or connection credentials.
  client.on("error", () => {});

  let initialConnection: Promise<void> | undefined;
  return {
    async hit(key: string, windowMs: number) {
      if (initialConnection) {
        await initialConnection;
      } else if (client.status === "wait") {
        initialConnection = client.connect().finally(() => { initialConnection = undefined; });
        await initialConnection;
      }
      const result = await client.eval(hitScript, 1, key, windowMs) as [number, number];
      return { count: result[0], remainingMs: result[1] };
    },
    close() {
      client.disconnect();
    },
  } satisfies RateLimitStore & { close(): void };
}
