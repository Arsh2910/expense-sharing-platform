import type { RequestHandler } from "express";
import { verifyAccessToken } from "./token.service.js";
import { prisma } from "../../lib/prisma.js";

export const authenticate: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      message: "Authentication required",
    });
    return;
  }

  const token = authHeader.slice(7).trim();

  let payload;

  try {
    payload = verifyAccessToken(token);
  } catch {
    res.status(401).json({
      message: "Invalid or expired access token",
    });
    return;
  }

  if (typeof payload === "string" || typeof payload.sub !== "string") {
    res.status(401).json({
      message: "Invalid access token",
    });
    return;
  }

  prisma.user
    .findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        status: true,
      },
    })
    .then((user) => {
      if (!user || user.status !== "ACTIVE") {
        res.status(401).json({
          message: "Account unavailable",
        });
        return;
      }

      req.auth = {
        userId: user.id,
      };

      next();
    })
    .catch(next);
};
