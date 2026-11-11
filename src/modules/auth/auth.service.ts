import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client.js";
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

export interface RegistrationVerification {
  issue(userId: string, purpose?: "EMAIL" | "EMAIL_CHANGE"): Promise<void>;
  consume(token: string): Promise<string>;
}

export interface VerificationDelivery {
  send(input: {
    userId: string;
    token: string;
    purpose: "EMAIL" | "EMAIL_CHANGE";
  }): Promise<void>;
}

export const verificationDelivery: VerificationDelivery = {
  async send() {
    throw new AuthServiceError(
      "Email verification delivery is not configured",
      "EMAIL_DELIVERY_UNAVAILABLE",
    );
  },
};

export function setVerificationDelivery(delivery: VerificationDelivery): void {
  verificationDelivery.send = delivery.send;
}

export const registrationVerification: RegistrationVerification = {
  async issue(userId, purpose = "EMAIL") {
    const token = randomBytes(32).toString("base64url");
    await prisma.verificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        purpose,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await verificationDelivery.send({ userId, token, purpose });
  },
  async consume(token) {
    const record = await prisma.verificationToken.findFirst({
      where: {
        tokenHash: hashToken(token),
        purpose: { in: ["EMAIL", "EMAIL_CHANGE"] },
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: { select: { pendingEmail: true } } },
    });
    if (!record)
      throw new AuthServiceError(
        "Invalid or expired verification token",
        "TOKEN_INVALID",
      );
    await prisma.$transaction(async (tx) => {
      const consumedAt = new Date();
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

      await tx.user.update({
        where: { id: record.userId },
        data:
          record.purpose === "EMAIL_CHANGE" && record.user.pendingEmail
            ? {
                email: record.user.pendingEmail,
                pendingEmail: null,
                emailVerifiedAt: consumedAt,
              }
            : { emailVerifiedAt: consumedAt },
      });
    });
    return record.userId;
  },
};

async function createSession(
  userId: string,
  meta?: { userAgent?: string; ipAddress?: string },
) {
  const refreshToken = createRefreshToken();
  const session = await prisma.session.create({
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
    const user = await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash: await bcrypt.hash(input.password, 12),
      },
      select: publicUser,
    });
    await registrationVerification.issue(user.id);
    return { user };
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
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash)))
    throw new AuthServiceError(
      "Invalid email or password",
      "INVALID_CREDENTIALS",
    );
  if (user.status !== "ACTIVE" || user.deletedAt)
    throw new AuthServiceError("Account unavailable", "ACCOUNT_UNAVAILABLE");
  if (!user.emailVerifiedAt)
    throw new AuthServiceError(
      "Email verification required",
      "EMAIL_NOT_VERIFIED",
    );
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
    ...(await createSession(user.id, meta)),
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
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash)))
    throw new AuthServiceError(
      "Current password is incorrect",
      "PASSWORD_INVALID",
    );
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    }),
    prisma.session.updateMany({
      where: { userId, id: { not: currentSessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
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
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    throw new AuthServiceError("Password is incorrect", "PASSWORD_INVALID");
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { pendingEmail: email },
      select: publicUser,
    });
    await registrationVerification.issue(userId, "EMAIL_CHANGE");
    return user;
  } catch (error) {
    if (isCode(error, "P2002"))
      throw new AuthServiceError(
        "An account with this email already exists",
        "EMAIL_ALREADY_EXISTS",
      );
    throw error;
  }
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

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
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
