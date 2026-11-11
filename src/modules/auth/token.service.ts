import jwt, { type Secret } from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";

function getAccessSecret(): Secret {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not configured");
  }

  return secret;
}

export function generateAccessToken(userId: string, sessionId: string): string {
  return jwt.sign({ type: "access" }, getAccessSecret(), {
    subject: userId,
    jwtid: sessionId,
    expiresIn: "15m",
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, getAccessSecret(), {
    algorithms: ["HS256"],
  });
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const accessCookieName = "access_token";
export const refreshCookieName = "refresh_token";
