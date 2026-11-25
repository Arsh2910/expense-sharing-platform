import { randomBytes } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import type { OAuthProvider } from "./oauth.providers.js";
import { hashToken } from "./token.service.js";

const ticketLifetimeMs = 90_000;

export async function createOAuthLinkTicket(provider: OAuthProvider, sessionId: string) {
  const ticket = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.$transaction([
    prisma.oAuthLinkTicket.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.oAuthLinkTicket.create({
      data: {
        tokenHash: hashToken(ticket),
        provider,
        sessionId,
        expiresAt: new Date(now.getTime() + ticketLifetimeMs),
      },
    }),
  ]);
  return ticket;
}

export async function consumeOAuthLinkTicket(provider: OAuthProvider, ticket: string) {
  let claim: { sessionId: string };
  try {
    // Claim and read the ticket in one delete so simultaneous requests cannot
    // both use it. Compare expiry the same way Prisma stored it.
    claim = await prisma.oAuthLinkTicket.delete({
      where: { tokenHash: hashToken(ticket), provider, expiresAt: { gt: new Date() } },
      select: { sessionId: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
    throw error;
  }

  const session = await prisma.session.findFirst({
    where: {
      id: claim.sessionId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      user: { status: "ACTIVE", deletedAt: null, emailVerifiedAt: { not: null } },
    },
    select: { id: true, userId: true },
  });
  return session && { sessionId: session.id, userId: session.userId };
}
