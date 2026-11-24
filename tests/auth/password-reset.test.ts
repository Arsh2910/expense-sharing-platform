import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { hashToken } from "../../src/modules/auth/token.service.js";
import { decryptOutboxToken } from "../../src/modules/email/outbox-token-crypto.js";
import { createTestUser } from "../helpers.js";

beforeEach(() => vi.stubEnv("PASSWORD_RESET_OUTBOX_KEY", randomBytes(32).toString("hex")));
afterEach(() => vi.unstubAllEnvs());
afterAll(() => prisma.$disconnect());

const start = (email: string) => request(app).post("/api/auth/forgot-password").send({ email });
const reset = (token: string, newPassword = "FreshPassword123") =>
  request(app).post("/api/auth/reset-password").send({ token, newPassword });

async function issue(email: string) {
  await start(email).expect(202);
  const mail = await prisma.emailOutbox.findFirstOrThrow({
    where: { recipient: email, type: "PASSWORD_RESET" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const envelope = (mail.payload as { encryptedToken: string }).encryptedToken;
  return { mail, envelope, token: decryptOutboxToken(envelope) };
}

it("returns the same response for known, unknown, and unverified addresses", async () => {
  const { user } = await createTestUser();
  const unknown = `${randomUUID()}@example.test`;
  const unverified = await createTestUser();
  await prisma.user.update({ where: { id: unverified.user.id }, data: { emailVerifiedAt: null } });
  const known = await start(user.email.toUpperCase()).expect(202);
  expect((await start(unknown).expect(202)).body).toEqual(known.body);
  expect((await start(unverified.user.email).expect(202)).body).toEqual(known.body);
  expect(await prisma.emailOutbox.count({
    where: { type: "PASSWORD_RESET", recipient: { in: [unknown, unverified.user.email] } },
  })).toBe(0);
  const mail = await prisma.emailOutbox.findFirstOrThrow({ where: { recipient: user.email, type: "PASSWORD_RESET" } });
  const token = decryptOutboxToken((mail.payload as { encryptedToken: string }).encryptedToken);
  expect(JSON.stringify(mail.payload)).not.toContain(token);
  const stored = await prisma.verificationToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
  expect(stored).toMatchObject({ userId: user.id, purpose: "PASSWORD_RESET", consumedAt: null });
  expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBeGreaterThan(29 * 60_000);
});

it("consumes a reset once under concurrency, revokes sessions, and changes the login password", async () => {
  const { user, authHeader } = await createTestUser();
  await prisma.user.update({
    where: { id: user.id }, data: { passwordHash: await bcrypt.hash("OldPassword123", 4) },
  });
  const login = (password: string) => request(app).post("/api/auth/login").send({ email: user.email, password });
  await login("OldPassword123").expect(200);
  const { token } = await issue(user.email);
  const responses = await Promise.all([reset(token), reset(token)]);
  expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
  expect((await reset(token).expect(400)).body).toEqual({ message: "Invalid or expired reset link" });
  expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  await request(app).get("/api/auth/me").set("Authorization", authHeader).expect(401);
  await login("OldPassword123").expect(401);
  await login("FreshPassword123").expect(200);
});

it("rejects expired, superseded, and wrong-purpose tokens and prevents bcrypt truncation", async () => {
  const { user } = await createTestUser();
  const old = await issue(user.email);
  const current = await issue(user.email);
  await reset(old.token).expect(400);
  await reset(current.token, "é".repeat(37)).expect(400);
  const currentRecord = await prisma.verificationToken.findUniqueOrThrow({ where: { tokenHash: hashToken(current.token) } });
  expect(currentRecord.consumedAt).toBeNull();
  await prisma.verificationToken.update({ where: { id: currentRecord.id }, data: { expiresAt: new Date(0) } });
  await reset(current.token).expect(400);
  const token = randomBytes(32).toString("base64url");
  await prisma.verificationToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), purpose: "EMAIL", expiresAt: new Date(Date.now() + 60_000) },
  });
  await reset(token).expect(400);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(user.passwordHash);
});
