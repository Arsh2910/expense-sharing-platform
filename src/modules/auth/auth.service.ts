import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client.js";
import { encryptOutboxToken } from "../email/outbox-token-crypto.js";
import { prisma } from "../../lib/prisma.js";
import {
  createRefreshToken,
  generateAccessToken,
  hashToken,
} from "./token.service.js";
import type { RegisterInput, LoginInput } from "./auth.schema.js";

const publicUser = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;
const sessionDays = 30;
const emailChangeConflictMessage = "This email address is already in use. Choose a different email address.";
// Run the same bcrypt work for an unknown email as for a known account.
const dummyLoginHash = "$2b$12$FE0HDp0zyxo.QeskACBs0.lbK2g/HUqZ8O0DONiqeYSU1qw3dhyX2";

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "EMAIL_ALREADY_EXISTS"
      | "INVALID_CREDENTIALS"
      | "ACCOUNT_UNAVAILABLE"
      | "INVALID_REFRESH_TOKEN"
      | "TOKEN_INVALID"
      | "EMAIL_NOT_AVAILABLE"
      | "PASSWORD_INVALID"
      | "EMAIL_NOT_VERIFIED"
      | "EMAIL_DELIVERY_UNAVAILABLE",
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

const passwordResetLifetimeMs = 30 * 60_000;

export async function lockAuthUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
}

function invalidatePasswordResets(tx: Prisma.TransactionClient, userId: string, now: Date) {
  return tx.verificationToken.updateMany({
    where: { userId, purpose: "PASSWORD_RESET", consumedAt: null },
    data: { consumedAt: now },
  });
}

export async function requestPasswordReset(email: string) {
  const token = randomBytes(32).toString("base64url");
  const encryptedToken = encryptOutboxToken(token);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { email, status: "ACTIVE", deletedAt: null, emailVerifiedAt: { not: null } },
      select: { id: true },
    });
    if (!user) return;

    await lockAuthUser(tx, user.id);
    const eligible = await tx.user.findFirst({
      where: { id: user.id, email, status: "ACTIVE", deletedAt: null, emailVerifiedAt: { not: null } },
      select: { id: true },
    });
    if (!eligible) return;

    const now = new Date();
    await invalidatePasswordResets(tx, user.id, now);
    await tx.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        purpose: "PASSWORD_RESET",
        expiresAt: new Date(now.getTime() + passwordResetLifetimeMs),
      },
    });
    await tx.emailOutbox.create({
      data: { type: "PASSWORD_RESET", recipient: email, payload: { userId: user.id, encryptedToken } },
    });
  });
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashToken(token);
  const record = await prisma.verificationToken.findFirst({
    where: { tokenHash, purpose: "PASSWORD_RESET", consumedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userId: true },
  });
  if (!record) return false;

  const passwordHash = await bcrypt.hash(newPassword, 12);
  return prisma.$transaction(async (tx) => {
    await lockAuthUser(tx, record.userId);
    const now = new Date();
    const claimed = await tx.verificationToken.updateMany({
      where: { id: record.id, purpose: "PASSWORD_RESET", consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) return false;

    const updated = await tx.user.updateMany({
      where: { id: record.userId, status: "ACTIVE", deletedAt: null, emailVerifiedAt: { not: null } },
      data: { passwordHash },
    });
    if (updated.count !== 1) throw new AuthServiceError("Invalid or expired reset link", "TOKEN_INVALID");
    await invalidatePasswordResets(tx, record.userId, now);
    await tx.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return true;
  });
}

export interface RegistrationVerification {
  consume(token: string): Promise<string>;
}

async function queueVerification(
  tx: Prisma.TransactionClient,
  userId: string,
  recipient: string,
  purpose: "EMAIL" | "EMAIL_CHANGE",
) {
  const token = randomBytes(32).toString("base64url");
  await tx.verificationToken.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await tx.verificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      purpose,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  await tx.emailOutbox.create({
    data: { type: "EMAIL_VERIFICATION", recipient, payload: { userId, encryptedToken: encryptOutboxToken(token), purpose } },
  });
}

export const registrationVerification: RegistrationVerification = {
  async consume(token) {
    const record = await prisma.verificationToken.findFirst({
      where: {
        tokenHash: hashToken(token),
        purpose: { in: ["EMAIL", "EMAIL_CHANGE"] },
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: { select: { email: true, pendingEmail: true } } },
    });
    if (!record)
      throw new AuthServiceError(
        "Invalid or expired verification token",
        "TOKEN_INVALID",
      );
    const newEmail = record.purpose === "EMAIL_CHANGE" ? record.user.pendingEmail : null;
    if (record.purpose === "EMAIL_CHANGE" && !newEmail) {
      throw new AuthServiceError("Invalid or expired verification token", "TOKEN_INVALID");
    }
    await prisma.$transaction(async (tx) => {
      const consumedAt = new Date();
      const updated = await tx.user.updateMany({
        where: {
          id: record.userId,
          status: "ACTIVE",
          deletedAt: null,
          email: record.user.email,
          ...(newEmail ? { pendingEmail: newEmail } : {}),
        },
        data: {
          emailVerifiedAt: consumedAt,
          ...(newEmail ? { email: newEmail, pendingEmail: null } : {}),
        },
      });
      if (updated.count !== 1) {
        throw new AuthServiceError("Invalid or expired verification token", "TOKEN_INVALID");
      }
      const claimed = await tx.verificationToken.updateMany({
        where: {
          id: record.id,
          consumedAt: null,
          expiresAt: { gt: consumedAt },
        },
        data: { consumedAt },
      });

      if (claimed.count !== 1) {
        throw new AuthServiceError(
          "Invalid or expired verification token",
          "TOKEN_INVALID",
        );
      }
      if (newEmail) await invalidatePasswordResets(tx, record.userId, consumedAt);
    }).catch((error: unknown) => {
      // The address may have been claimed after the verification was requested.
      if (newEmail && isCode(error, "P2002")) {
        throw new AuthServiceError(emailChangeConflictMessage, "EMAIL_ALREADY_EXISTS");
      }
      throw error;
    });
    return record.userId;
  },
};

export async function createSession(
  tx: Prisma.TransactionClient,
  userId: string,
  meta?: { userAgent?: string; ipAddress?: string },
) {
  const refreshToken = createRefreshToken();
  const session = await tx.session.create({
    data: {
      userId,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + sessionDays * 86400000),
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
    },
  });
  return { refreshToken, accessToken: generateAccessToken(userId, session.id) };
}

export async function registerUser(
  input: RegisterInput,
  meta?: { userAgent?: string; ipAddress?: string },
) {
  try {
    const passwordHash = await bcrypt.hash(input.password, 12);
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, displayName: input.displayName, passwordHash },
        select: publicUser,
      });
      await queueVerification(tx, user.id, user.email, "EMAIL");
      return { user };
    });
  } catch (error) {
    if (isCode(error, "P2002"))
      throw new AuthServiceError(
        "An account with this email already exists",
        "EMAIL_ALREADY_EXISTS",
      );
    throw error;
  }
}

export async function loginUser(
  input: LoginInput,
  meta?: { userAgent?: string; ipAddress?: string },
) {
  const user = await prisma.user.findFirst({ where: { email: input.email } });
  const passwordMatches = await bcrypt.compare(input.password, user?.passwordHash ?? dummyLoginHash);
  if (!user?.passwordHash || !passwordMatches || user.status !== "ACTIVE" || user.deletedAt)
    throw new AuthServiceError(
      "Invalid email or password",
      "INVALID_CREDENTIALS",
    );
  if (!user.emailVerifiedAt)
    throw new AuthServiceError(
      "Email verification required",
      "EMAIL_NOT_VERIFIED",
    );
  const tokens = await prisma.$transaction(async (tx) => {
    await lockAuthUser(tx, user.id);
    const current = await tx.user.findFirst({
      where: { id: user.id, passwordHash: user.passwordHash, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
    if (!current) throw new AuthServiceError("Invalid email or password", "INVALID_CREDENTIALS");
    return createSession(tx, user.id, meta);
  });
  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    },
    ...tokens,
  };
}

export async function refreshSession(
  token: string,
  meta?: { userAgent?: string; ipAddress?: string },
) {
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: hashToken(token) },
    include: { user: { select: publicUser } },
  });
  if (!session)
    throw new AuthServiceError(
      "Invalid or expired refresh token",
      "INVALID_REFRESH_TOKEN",
    );
  if (session.revokedAt || session.expiresAt <= new Date()) {
    await prisma.session.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AuthServiceError(
      "Refresh token reuse detected",
      "INVALID_REFRESH_TOKEN",
    );
  }
  if (session.user.status !== "ACTIVE")
    throw new AuthServiceError(
      "Invalid or expired refresh token",
      "INVALID_REFRESH_TOKEN",
    );
  let next: { refreshToken: string; accessToken: string };
  try {
    next = await prisma.$transaction(async (tx) => {
      await lockAuthUser(tx, session.userId);
      const rotated = await tx.session.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      });
      if (rotated.count !== 1)
        throw new AuthServiceError(
          "Refresh token reuse detected",
          "INVALID_REFRESH_TOKEN",
        );
      const refreshToken = createRefreshToken();
      const created = await tx.session.create({
        data: {
          userId: session.userId,
          refreshTokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + sessionDays * 86400000),
          userAgent: meta?.userAgent,
          ipAddress: meta?.ipAddress,
        },
      });
      return {
        refreshToken,
        accessToken: generateAccessToken(session.userId, created.id),
      };
    });
  } catch (error) {
    if (
      error instanceof AuthServiceError &&
      error.code === "INVALID_REFRESH_TOKEN"
    ) {
      await prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw error;
  }
  return { user: session.user, ...next };
}

export async function revokeSession(token: string) {
  await prisma.session.updateMany({
    where: { refreshTokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
export async function getProfile(userId: string) {
  return prisma.user.findFirst({
    where: {
      id: userId,
      status: "ACTIVE",
      deletedAt: null,
    },
    select: publicUser,
  });
}

export async function updateProfile(
  userId: string,
  data: { displayName?: string; username?: string | null },
) {
  try {
    return await prisma.user.update({
      where: { id: userId },
      data,
      select: publicUser,
    });
  } catch (error) {
    if (isCode(error, "P2002"))
      throw new AuthServiceError(
        "Username is already in use",
        "EMAIL_NOT_AVAILABLE",
      );
    throw error;
  }
}
export async function changePassword(
  userId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash)))
    throw new AuthServiceError(
      "Current password is incorrect",
      "PASSWORD_INVALID",
    );
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, passwordHash: user.passwordHash },
      data: { passwordHash },
    });
    if (updated.count !== 1) throw new AuthServiceError("Current password is incorrect", "PASSWORD_INVALID");
    const now = new Date();
    await invalidatePasswordResets(tx, userId, now);
    await tx.session.updateMany({
      where: { userId, id: { not: currentSessionId }, revokedAt: null },
      data: { revokedAt: now },
    });
  });
}
export async function changeEmail(
  userId: string,
  email: string,
  password: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash)))
    throw new AuthServiceError("Password is incorrect", "PASSWORD_INVALID");
  return prisma.$transaction(async (tx) => {
    // Use the same case-insensitive comparison as the unique index on users.
    const [result] = await tx.$queryRaw<{ taken: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM users WHERE lower(email) = lower(${email})) AS taken
    `;
    if (result.taken) {
      throw new AuthServiceError(emailChangeConflictMessage, "EMAIL_ALREADY_EXISTS");
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { pendingEmail: email },
      select: publicUser,
    });
    await queueVerification(tx, userId, email, "EMAIL_CHANGE");
    return updated;
  });
}
export async function deleteAccount(
  userId: string,
  currentPassword: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, status: true, deletedAt: true },
  });

  if (!user || user.status !== "ACTIVE" || user.deletedAt) {
    throw new AuthServiceError(
      "Account is already unavailable",
      "ACCOUNT_UNAVAILABLE",
    );
  }

  if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AuthServiceError(
      "Current password is incorrect",
      "PASSWORD_INVALID",
    );
  }

  const replacementPasswordHash = await bcrypt.hash(
    randomBytes(32).toString("hex"),
    12,
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const memberships = await tx.groupMembership.findMany({
            where: {
              userId,
              role: { in: ["OWNER", "ADMIN"] },
              leftAt: null,
            },
            orderBy: [{ groupId: "asc" }, { joinedAt: "asc" }, { id: "asc" }],
          });

          for (const membership of memberships) {
            const successor = await tx.groupMembership.findFirst({
              where: {
                groupId: membership.groupId,
                leftAt: null,
                userId: { not: userId },
                user: { status: "ACTIVE" },
                ...(membership.role === "ADMIN"
                  ? { role: { not: "OWNER" } }
                  : {}),
              },
              orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
              select: { id: true },
            });

            await tx.groupMembership.update({
              where: { id: membership.id },
              data: { leftAt: now },
            });

            if (successor) {
              await tx.groupMembership.update({
                where: { id: successor.id },
                data: { role: membership.role },
              });
            } else {
              await tx.group.update({
                where: { id: membership.groupId },
                data: { archivedAt: now },
              });
            }
          }

          await tx.groupMembership.updateMany({
            where: { userId, leftAt: null },
            data: { leftAt: now },
          });
          await tx.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: now },
          });

          const deleted = await tx.user.updateMany({
            where: {
              id: userId,
              status: "ACTIVE",
              deletedAt: null,
              passwordHash: user.passwordHash,
            },
            data: {
              status: "DEACTIVATED",
              deletedAt: now,
              email: `deleted+${userId}@example.invalid`,
              username: null,
              displayName: "Deleted user",
              pendingEmail: null,
              passwordHash: replacementPasswordHash,
            },
          });

          if (deleted.count !== 1) {
            throw new AuthServiceError(
              "Account is already unavailable",
              "ACCOUNT_UNAVAILABLE",
            );
          }

          return { deleted: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isCode(error, "P2034") && attempt < 2) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Account deletion transaction could not be completed");
}
function isCode(error: unknown, code: string): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
