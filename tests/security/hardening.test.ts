import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import app from "../../src/app.js";
import { browserOrigins, validateEnvironment } from "../../src/config/environment.js";
import { prisma } from "../../src/lib/prisma.js";
import { protectLegacyEmailTokens } from "../../src/modules/email/email-outbox.service.js";
import { decryptOutboxToken } from "../../src/modules/email/outbox-token-crypto.js";
import { createTestUser } from "../helpers.js";

afterEach(() => vi.unstubAllEnvs());
afterAll(() => prisma.$disconnect());

it("sets security headers, allows credentialed preflight for the frontend, and rejects foreign origins", async () => {
  const origin = "http://localhost:5173";
  const allowed = await request(app).options("/api/groups")
    .set("Origin", origin)
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "Content-Type, Idempotency-Key, X-Client-Time-Zone")
    .expect(204);
  expect(allowed.headers["access-control-allow-origin"]).toBe(origin);
  expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
  expect(allowed.headers["access-control-allow-headers"]).toContain("x-client-time-zone");
  expect(allowed.headers["content-security-policy"]).toBeDefined();
  expect(allowed.headers["strict-transport-security"]).toBeUndefined();

  const blocked = await request(app).post("/api/auth/logout").set("Origin", "https://foreign.example").expect(403);
  expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  await request(app).options("/api/groups").set("Origin", origin)
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "X-Unapproved-Header").expect(403);
  await request(app).post("/api/auth/logout").set("Sec-Fetch-Site", "cross-site").expect(403);
});

it("returns safe JSON errors for invalid and oversized bodies", async () => {
  const secret = "private-body-sentinel";
  const invalid = await request(app).post("/api/auth/login").type("json")
    .send(`{"password":"${secret}`,).expect(400);
  expect(invalid.body).toEqual({ message: "Invalid JSON request body" });
  await request(app).post("/api/auth/login").send({ password: "a".repeat(105_000) })
    .expect(413, { message: "Request body too large" });
});

it("enforces the bcrypt byte limit and uses generic credential and refresh errors", async () => {
  await request(app).post("/api/auth/register").send({
    email: `${randomUUID()}@example.test`, displayName: "Too long", password: "é".repeat(37),
  }).expect(400);
  const send = (email: string) => request(app).post("/api/auth/login").send({ email, password: "BadPassword123" });
  const { user } = await createTestUser();
  const known = await send(user.email).expect(401);
  const unknown = await send(`${randomUUID()}@example.test`).expect(401);
  expect(known.body).toEqual(unknown.body);
  const missing = await request(app).post("/api/auth/refresh").expect(401);
  const invalid = await request(app).post("/api/auth/refresh").send({ refreshToken: "x".repeat(64) }).expect(401);
  expect(missing.body).toEqual(invalid.body);
});

it("sets and clears HttpOnly cookies with cross-site production settings", async () => {
  const password = "CookiePassword123";
  const { user } = await createTestUser();
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 4) } });
  const login = () => request(app).post("/api/auth/login").send({ email: user.email, password }).expect(200);
  const development = await login();
  expect(development.headers["cache-control"]).toBe("no-store");
  for (const cookie of development.get("Set-Cookie") ?? []) {
    expect(cookie).toMatch(/HttpOnly; SameSite=Lax$/);
  }
  vi.stubEnv("NODE_ENV", "production");
  const production = await login();
  const cookies = production.get("Set-Cookie") ?? [];
  expect(cookies).toHaveLength(2);
  for (const cookie of cookies) expect(cookie).toMatch(/HttpOnly; SameSite=None; Secure$/);
  const logout = await request(app).post("/api/auth/logout").set("Cookie", cookies.map((cookie) => cookie.split(";")[0])).expect(204);
  for (const cookie of logout.get("Set-Cookie") ?? []) expect(cookie).toMatch(/Max-Age=0.*HttpOnly; SameSite=None; Secure$/);
});

it("validates production settings without disclosing values in errors", () => {
  const env = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://localhost/expense",
    JWT_ACCESS_SECRET: "x".repeat(32),
    REDIS_URL: "rediss://localhost",
    APP_BASE_URL: "https://app.example.test",
    CORS_ALLOWED_ORIGINS: "https://other.example.test",
    PASSWORD_RESET_OUTBOX_KEY: "aa".repeat(32),
  };
  expect(validateEnvironment("api", env).PORT).toBe(5000);
  expect(browserOrigins(env)).toEqual(new Set([env.APP_BASE_URL, env.CORS_ALLOWED_ORIGINS]));
  expect(() => validateEnvironment("email-worker", env)).toThrow(/RESEND_API_KEY/);
  expect(() => validateEnvironment("api", { ...env, DATABASE_URL: "private-value" })).toThrow(/^Invalid environment configuration: DATABASE_URL$/);
  expect(() => validateEnvironment("api", { ...env, APP_BASE_URL: "http://app.example.test" })).toThrow(/HTTPS/);
  expect(() => browserOrigins({ ...env, CORS_ALLOWED_ORIGINS: "*" })).toThrow(/origins/);
});

it("encrypts pending legacy tokens and removes terminal token data without losing rows", async () => {
  const token = randomBytes(32).toString("base64url");
  const common = { type: "GROUP_INVITATION", recipient: "legacy@example.test", payload: { token, groupName: "Trip" } };
  const pending = await prisma.emailOutbox.create({ data: common });
  const sent = await prisma.emailOutbox.create({ data: { ...common, status: "SENT", sentAt: new Date() } });
  await protectLegacyEmailTokens();
  const updated = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: pending.id } });
  const updatedPayload = updated.payload as { encryptedToken: string };
  expect(decryptOutboxToken(updatedPayload.encryptedToken)).toBe(token);
  expect(updated.payload).not.toHaveProperty("token");
  expect((await prisma.emailOutbox.findUniqueOrThrow({ where: { id: sent.id } })).payload).toEqual({ groupName: "Trip" });
});
