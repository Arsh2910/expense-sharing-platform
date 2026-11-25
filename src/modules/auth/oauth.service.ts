import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { createSession, lockAuthUser } from "./auth.service.js";
import { OAuthError, type OAuthProfile, type OAuthProvider } from "./oauth.providers.js";

type SessionActor = { userId: string; sessionId: string };
type SessionMeta = { userAgent?: string; ipAddress?: string };

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function signInWithOAuth(provider: OAuthProvider, profile: OAuthProfile, meta: SessionMeta) {
  const identity = { provider, subject: profile.subject };
  const signIn = () => prisma.$transaction(async (tx) => {
    const link = await tx.oAuthIdentity.findUnique({
      where: { provider_subject: identity },
      select: { userId: true },
    });
    if (link) {
      await lockAuthUser(tx, link.userId);
      const user = await tx.user.findFirst({
        where: { id: link.userId, status: "ACTIVE", deletedAt: null, emailVerifiedAt: { not: null } },
        select: { id: true },
      });
      if (!user) throw new OAuthError("session");
      return createSession(tx, user.id, meta);
    }

    // PostgreSQL enforces this comparison with a unique index on lower(email).
    const existing = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE lower(email) = ${profile.email}
    `;
    if (existing.length) throw new OAuthError("link_required");
    if (!profile.mayCreateAccount) throw new OAuthError("verify_locally");
    const user = await tx.user.create({
      data: { email: profile.email, displayName: profile.displayName, emailVerifiedAt: new Date() },
      select: { id: true },
    });
    await tx.oAuthIdentity.create({ data: { ...identity, userId: user.id } });
    return createSession(tx, user.id, meta);
  });

  try {
    return await signIn();
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    // A concurrent callback or password registration may have won the insert.
    try {
      return await signIn();
    } catch (retryError) {
      if (isUniqueConflict(retryError)) throw new OAuthError("conflict");
      throw retryError;
    }
  }
}

export async function linkOAuthIdentity(provider: OAuthProvider, profile: OAuthProfile, actor: SessionActor) {
  try {
    await prisma.$transaction(async (tx) => {
      await lockAuthUser(tx, actor.userId);
      const user = await tx.user.findFirst({
        where: {
          id: actor.userId, status: "ACTIVE", deletedAt: null, emailVerifiedAt: { not: null },
          sessions: { some: { id: actor.sessionId, revokedAt: null, expiresAt: { gt: new Date() } } },
        },
        select: { email: true },
      });
      if (!user) throw new OAuthError("session");
      if (user.email.toLowerCase() !== profile.email) throw new OAuthError("email");
      const identity = { provider, subject: profile.subject };
      const linked = await tx.oAuthIdentity.findUnique({ where: { provider_subject: identity } });
      if (linked?.userId === actor.userId) return;
      if (linked) throw new OAuthError("conflict");
      await tx.oAuthIdentity.create({ data: { ...identity, userId: actor.userId } });
    });
  } catch (error) {
    if (isUniqueConflict(error)) throw new OAuthError("conflict");
    throw error;
  }
}
