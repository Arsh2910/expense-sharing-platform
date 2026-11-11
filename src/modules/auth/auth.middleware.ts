import type { RequestHandler } from "express";
import { accessCookieName, verifyAccessToken } from "./token.service.js";
import { prisma } from "../../lib/prisma.js";

export const authenticate: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${accessCookieName}=`))
    ?.slice(accessCookieName.length + 1);

  if (!authHeader?.startsWith("Bearer ") && !cookieToken) {
    res.status(401).json({
      message: "Authentication required",
    });
    return;
  }

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : cookieToken!;

  let payload;

  try {
    payload = verifyAccessToken(token);
  } catch {
    res.status(401).json({
      message: "Invalid or expired access token",
    });
    return;
  }

  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" ||
    typeof payload.jti !== "string" ||
    payload.type !== "access"
  ) {
    res.status(401).json({
      message: "Invalid access token",
    });
    return;
  }
  const sessionId = payload.jti;

  prisma.user
    .findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        status: true,
        sessions: {
          where: {
            id: sessionId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        },
      },
    })
    .then((user) => {
      if (!user || user.status !== "ACTIVE" || user.sessions.length === 0) {
        res.status(401).json({
          message: "Account unavailable",
        });
        return;
      }

      req.auth = {
        userId: user.id,
        sessionId,
      };

      next();
    })
    .catch(next);
};
