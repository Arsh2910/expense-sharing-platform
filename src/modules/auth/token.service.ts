import jwt, { type Secret } from "jsonwebtoken";

function getAccessSecret(): Secret {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not configured");
  }

  return secret;
}

export function generateAccessToken(userId: string): string {
  return jwt.sign({}, getAccessSecret(), {
    subject: userId,
    expiresIn: "15m",
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, getAccessSecret(), {
    algorithms: ["HS256"],
  });
}
