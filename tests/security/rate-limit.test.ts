import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, expect, it } from "vitest";
import app from "../../src/app.js";
import { trustedProxies } from "../../src/config/environment.js";
import { prisma } from "../../src/lib/prisma.js";
import { rateLimit } from "../../src/middleware/rate-limit.middleware.js";
import { createMemoryRateLimitStore, createRedisRateLimitStore } from "../../src/middleware/rate-limit.store.js";
import { createTestUser } from "../helpers.js";

afterAll(() => prisma.$disconnect());

it("expires local counters and reports the remaining window", async () => {
  let now = 1_000;
  const store = createMemoryRateLimitStore(() => now);
  expect(await store.hit("client", 100)).toEqual({ count: 1, remainingMs: 100 });
  now += 40;
  expect(await store.hit("client", 100)).toEqual({ count: 2, remainingMs: 60 });
  now += 60;
  expect(await store.hit("client", 100)).toEqual({ count: 1, remainingMs: 100 });
});

it("fails closed with a retry hint when the shared store is unavailable", async () => {
  const server = express();
  server.post("/", rateLimit("test", [{ name: "ip", max: 1, windowMs: 100, identify: () => "test" }], {
    async hit() { throw new Error("Unavailable"); },
  }), (_req, res) => { res.sendStatus(204); });
  await request(server).post("/").expect(503).expect("Retry-After", "5");
});

it("limits forgot-password by normalized address regardless of account existence", async () => {
  const email = `${randomUUID()}@example.test`;
  const send = (address: string) => request(app).post("/api/auth/forgot-password").send({ email: address });
  for (let n = 0; n < 5; n++) await send(email).expect(202);
  const blocked = await send(`   ${email.toUpperCase()}`).expect(429);
  expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  await send(`${randomUUID()}@example.test`).expect(202);
});

it("limits malformed login traffic by IP and ignores spoofed forwarding headers on direct connections", async () => {
  const send = (forwarded: string) => request(app).post("/api/auth/login")
    .set("X-Forwarded-For", forwarded).send({});
  for (let n = 1; n <= 30; n++) await send(`192.0.2.${n}`).expect(400);
  await send("192.0.2.250").expect(429);
});

it("applies financial limits after authentication and isolates different users", async () => {
  const user = await createTestUser();
  const other = await createTestUser();
  const endpoint = `/api/groups/${randomUUID()}/settlements`;
  await request(app).post(endpoint).send({}).expect(401);
  const send = (authHeader: string) => request(app).post(endpoint).set("Authorization", authHeader).send({});
  for (let n = 0; n < 30; n++) await send(user.authHeader).expect(400);
  await send(user.authHeader).expect(429);
  await send(other.authHeader).expect(400);
});

it("only accepts explicitly configured proxy addresses and CIDRs", () => {
  expect(trustedProxies({})).toEqual([]);
  expect(trustedProxies({ TRUSTED_PROXY_IPS: "127.0.0.1, 10.0.0.0/24" })).toEqual(["127.0.0.1", "10.0.0.0/24"]);
  for (const value of ["true", "1", "0.0.0.0/0", "::/0", "127.0.0.1/99"]) {
    expect(() => trustedProxies({ TRUSTED_PROXY_IPS: value })).toThrow(/TRUSTED_PROXY_IPS/);
  }
});

const redisUrl = process.env.RATE_LIMIT_TEST_REDIS_URL;
it.runIf(Boolean(redisUrl))("shares atomic expiring counters across Redis clients", async () => {
  const first = createRedisRateLimitStore(redisUrl!);
  const second = createRedisRateLimitStore(redisUrl!);
  try {
    const key = `expense-sharing:test:rate-limit:${randomUUID()}`;
    const counts = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      (index % 2 === 0 ? first : second).hit(key, 5_000),
    ));
    expect(counts.map(({ count }) => count).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(counts.every(({ remainingMs }) => remainingMs > 0 && remainingMs <= 5_000)).toBe(true);
    const expiryKey = `${key}:expiry`;
    expect((await first.hit(expiryKey, 75)).count).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await second.hit(expiryKey, 75)).count).toBe(1);
  } finally {
    first.close();
    second.close();
  }
});
