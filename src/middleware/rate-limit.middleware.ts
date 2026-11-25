import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import type { Request, RequestHandler } from "express";
import {
  createMemoryRateLimitStore,
  createRedisRateLimitStore,
  type RateLimitStore,
} from "./rate-limit.store.js";

interface Limit {
  name: string;
  max: number;
  windowMs: number;
  identify: (req: Request) => string | undefined;
}

const localSecret = randomBytes(32);
const minute = 60_000;
const hour = 60 * minute;

function ipBucket(address: string) {
  const ip = address.split("%")[0];
  if (isIP(ip) !== 6) return ip;

  const canonical = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  const [left, right = ""] = canonical.split("::");
  const first = left ? left.split(":") : [];
  const last = right ? right.split(":") : [];
  const parts = canonical.includes("::")
    ? [...first, ...Array<string>(8 - first.length - last.length).fill("0"), ...last]
    : first;

  if (parts.slice(0, 5).every((part) => part === "0") && parts[5] === "ffff") {
    return parts.slice(6).flatMap((part) => {
      const value = Number.parseInt(part, 16);
      return [value >>> 8, value & 255];
    }).join(".");
  }
  return `${parts.slice(0, 4).join(":")}::/64`;
}

export function rateLimit(
  route: string,
  limits: readonly Limit[],
  store: RateLimitStore,
  secret: string | Buffer = process.env.JWT_ACCESS_SECRET ?? localSecret,
): RequestHandler {
  return async (req, res, next) => {
    try {
      for (const limit of limits) {
        const identity = limit.identify(req);
        if (!identity) continue;
        const hash = createHmac("sha256", secret).update(identity).digest("hex");
        const key = `expense-sharing:rl:v1:${route}:${limit.name}:${hash}`;
        const { count, remainingMs } = await store.hit(key, limit.windowMs);
        if (count > limit.max) {
          res.set("Retry-After", String(Math.max(1, Math.ceil(remainingMs / 1000))));
          res.set("Cache-Control", "no-store");
          res.status(429).json({ message: "Too many requests. Try again later." });
          return;
        }
      }
    } catch {
      res.set("Retry-After", "5");
      res.set("Cache-Control", "no-store");
      res.status(503).json({ message: "Service temporarily unavailable. Try again later." });
      return;
    }
    next();
  };
}

const ip: Limit["identify"] = (req) => ipBucket(req.ip ?? req.socket.remoteAddress ?? "unknown");
const account: Limit["identify"] = (req) => {
  const value: unknown = req.body?.email;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized.length <= 255 ? normalized : undefined;
};
const token: Limit["identify"] = (req) => {
  const value: unknown = req.body?.token;
  return typeof value === "string" && value.length >= 20 && value.length <= 128 ? value : undefined;
};
const user: Limit["identify"] = (req) => req.auth?.userId;
const invitation: Limit["identify"] = (req) => {
  const id = req.params.invitationId;
  return req.auth && typeof id === "string" && id.length === 36 ? `${req.auth.userId}:${id.toLowerCase()}` : undefined;
};

function limit(name: string, max: number, windowMs: number, identify: Limit["identify"]): Limit {
  return { name, max, windowMs, identify };
}

function apiStore(): RateLimitStore {
  if (process.env.NODE_ENV !== "production") return createMemoryRateLimitStore();
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for production rate limiting");
  return createRedisRateLimitStore(url);
}

const store = apiStore();
export const requestLimits = {
  register: rateLimit("register", [limit("ip", 15, hour, ip), limit("account", 5, hour, account)], store),
  login: rateLimit("login", [limit("ip", 30, 15 * minute, ip), limit("account", 10, 15 * minute, account)], store),
  oauthStart: rateLimit("oauth-start", [limit("ip", 30, 15 * minute, ip)], store),
  oauthCallback: rateLimit("oauth-callback", [limit("ip", 60, 15 * minute, ip)], store),
  forgotPassword: rateLimit("forgot-password", [limit("ip", 30, hour, ip), limit("account", 5, hour, account)], store),
  resetPassword: rateLimit("reset-password", [limit("ip", 30, 15 * minute, ip), limit("token", 5, 15 * minute, token)], store),
  verifyEmail: rateLimit("verify-email", [limit("ip", 40, 15 * minute, ip), limit("token", 8, 15 * minute, token)], store),
  resendInvitation: rateLimit("invitation-resend", [
    limit("user", 20, hour, user),
    limit("invitation", 5, hour, invitation),
  ], store),
  createExpense: rateLimit("expense-create", [limit("user", 60, minute, user)], store),
  createSettlement: rateLimit("settlement-create", [limit("user", 30, minute, user)], store),
};
