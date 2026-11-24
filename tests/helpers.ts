import crypto from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { generateAccessToken, hashToken } from "../src/modules/auth/token.service.js";

export async function createTestUser(
  overrides: Partial<{
    email: string;
    username: string;
    displayName: string;
    status: "ACTIVE" | "DEACTIVATED";
  }> = {},
) {
  const id = crypto.randomUUID();
  const email = overrides.email ?? `user_${id.slice(0, 8)}@test.com`;
  const username = overrides.username ?? `user_${id.slice(0, 8)}`;
  const displayName = overrides.displayName ?? `User ${id.slice(0, 8)}`;

  const user = await prisma.user.create({
    data: {
      id,
      email,
      username,
      displayName,
      passwordHash: "test_hash",
      status: overrides.status ?? "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashToken(crypto.randomBytes(32).toString("hex")),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const token = generateAccessToken(user.id, session.id);

  return {
    user,
    session,
    token,
    authHeader: `Bearer ${token}`,
  };
}

export async function joinTestGroup(
  app: Express,
  groupId: string,
  inviter: { authHeader: string },
  invitee: { authHeader: string; user: { email: string } },
) {
  const invitation = await request(app)
    .post(`/api/groups/${groupId}/invitations`)
    .set("Authorization", inviter.authHeader)
    .send({ email: invitee.user.email })
    .expect(201);

  return request(app)
    .post(`/api/invitations/${invitation.body.data.id}/accept`)
    .set("Authorization", invitee.authHeader)
    .expect(200);
}
