import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { decryptOutboxToken } from "../../src/modules/email/outbox-token-crypto.js";
import { createTestUser } from "../helpers.js";

const password = "CurrentPassword123";
const conflict = { message: "This email address is already in use. Choose a different email address." };

beforeEach(() => vi.stubEnv("PASSWORD_RESET_OUTBOX_KEY", randomBytes(32).toString("hex")));
afterEach(() => vi.unstubAllEnvs());
afterAll(() => prisma.$disconnect());

async function accountWithPassword() {
  const account = await createTestUser();
  await prisma.user.update({
    where: { id: account.user.id },
    data: { passwordHash: await bcrypt.hash(password, 4) },
  });
  return account;
}

function changeEmail(authHeader: string, email: string) {
  return request(app).patch("/api/auth/me/email").set("Authorization", authHeader).send({ email, password });
}

async function tokenFor(email: string) {
  const message = await prisma.emailOutbox.findFirstOrThrow({
    where: { type: "EMAIL_VERIFICATION", recipient: email },
  });
  return decryptOutboxToken((message.payload as { encryptedToken: string }).encryptedToken);
}

const verify = (token: string) => request(app).post("/api/auth/verify-email").send({ token });

it("rejects another account’s address regardless of case before queuing verification", async () => {
  const owner = await createTestUser({ email: `Owner-${randomUUID()}@Example.test` });
  const requester = await accountWithPassword();

  await changeEmail(requester.authHeader, owner.user.email.toLowerCase()).expect(409, conflict);

  expect(await prisma.emailOutbox.count({
    where: { type: "EMAIL_VERIFICATION", recipient: owner.user.email.toLowerCase() },
  })).toBe(0);
  expect(await prisma.verificationToken.count({
    where: { userId: requester.user.id, purpose: "EMAIL_CHANGE" },
  })).toBe(0);
  expect(await prisma.user.findUniqueOrThrow({ where: { id: requester.user.id } }))
    .toMatchObject({ email: requester.user.email, pendingEmail: null });
});

it("returns a conflict if another account claims the address before verification", async () => {
  const requester = await accountWithPassword();
  const target = `${randomUUID()}@example.test`;

  await changeEmail(requester.authHeader, target).expect(200);
  const token = await tokenFor(target);
  const owner = await createTestUser({ email: target.toUpperCase() });

  await verify(token).expect(409, conflict);

  expect(await prisma.user.findUniqueOrThrow({ where: { id: requester.user.id } }))
    .toMatchObject({ email: requester.user.email });
  expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } }))
    .toMatchObject({ email: target.toUpperCase() });

  const replacement = `${randomUUID()}@example.test`;
  await changeEmail(requester.authHeader, replacement).expect(200);
  await verify(await tokenFor(replacement)).expect(200, { message: "Email verified" });
  expect(await prisma.user.findUniqueOrThrow({ where: { id: requester.user.id } }))
    .toMatchObject({ email: replacement, pendingEmail: null });
});
