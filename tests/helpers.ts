import crypto from "node:crypto";
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
