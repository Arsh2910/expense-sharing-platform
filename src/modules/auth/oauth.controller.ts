import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { setAuthCookies } from "./auth.controller.js";
import {
  authorizationUrl, fetchOAuthProfile, getOAuthConfig, OAuthError, oauthProviders,
  oauthProviderSchema, type OAuthProvider,
} from "./oauth.providers.js";
import { linkOAuthIdentity, signInWithOAuth } from "./oauth.service.js";

const stateLifetimeSeconds = 600;
const secretPart = z.string().regex(/^[\w-]{43}$/);
const flowSchema = z.object({
  provider: oauthProviderSchema,
  state: secretPart,
  verifier: secretPart,
  actor: z.object({ userId: z.uuid(), sessionId: z.uuid() }).optional(),
});

function signingKey() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET is not configured");
  return createHmac("sha256", secret).update("splitcircle-oauth-state").digest();
}

function flowCookie(provider: OAuthProvider) {
  const secure = process.env.NODE_ENV === "production";
  return {
    name: `${secure ? "__Host-" : ""}splitcircle-oauth-${provider}`,
    options: { httpOnly: true, secure, sameSite: "lax" as const, path: "/" },
  };
}

function readFlow(req: Request, provider: OAuthProvider) {
  const prefix = `${flowCookie(provider).name}=`;
  const cookie = req.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(prefix))?.slice(prefix.length);
  if (!cookie) return null;
  try {
    const claims = jwt.verify(cookie, signingKey(), { algorithms: ["HS256"], audience: "splitcircle:oauth" });
    const flow = flowSchema.safeParse(claims);
    return flow.success && flow.data.provider === provider ? flow.data : null;
  } catch {
    return null;
  }
}

function redirectToApp(res: Response, path: "/oauth/complete" | "/login" | "/settings", result?: string) {
  const target = new URL(path, process.env.APP_BASE_URL ?? "http://localhost:5173");
  if (result) target.searchParams.set("oauth", result);
  res.redirect(303, target.href);
}

function startOAuth(link: boolean): RequestHandler {
  return (req, res) => {
    const provider = oauthProviderSchema.safeParse(req.params.provider);
    if (!provider.success || !getOAuthConfig(provider.data)) {
      redirectToApp(res, link ? "/settings" : "/login", "unavailable");
      return;
    }
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const signed = jwt.sign(
      { provider: provider.data, state, verifier, ...(link ? { actor: req.auth! } : {}) },
      signingKey(),
      { algorithm: "HS256", audience: "splitcircle:oauth", expiresIn: stateLifetimeSeconds },
    );
    const { name, options } = flowCookie(provider.data);
    res.cookie(name, signed, { ...options, maxAge: stateLifetimeSeconds * 1000 });
    res.redirect(302, authorizationUrl(provider.data, state, verifier));
  };
}

export const oauthLoginStart = startOAuth(false);
export const oauthLinkStart = startOAuth(true);

export const listOAuthProviders: RequestHandler = (_req, res) => {
  res.json({ data: oauthProviders.filter((provider) => getOAuthConfig(provider)) });
};

export const listOAuthLinks: RequestHandler = async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.auth!.userId },
    select: { passwordHash: true, oauthIdentities: { select: { provider: true } } },
  });
  res.json({
    data: {
      hasPassword: user.passwordHash !== null,
      providers: oauthProviders.filter((provider) => getOAuthConfig(provider))
        .map((provider) => ({
          provider, linked: user.oauthIdentities.some((identity) => identity.provider === provider),
        })),
    },
  });
};

export const oauthCallback: RequestHandler = async (req, res) => {
  const parsedProvider = oauthProviderSchema.safeParse(req.params.provider);
  if (!parsedProvider.success) {
    redirectToApp(res, "/login", "unavailable");
    return;
  }
  const provider = parsedProvider.data;
  const flow = readFlow(req, provider);
  const state = secretPart.safeParse(req.query.state);
  const returnPath = flow?.actor ? "/settings" : "/login";
  if (!flow || !state.success || !timingSafeEqual(Buffer.from(state.data), Buffer.from(flow.state))) {
    redirectToApp(res, returnPath, "expired");
    return;
  }
  const { name, options } = flowCookie(provider);
  res.clearCookie(name, options);
  const code = z.string().min(1).max(4096).safeParse(req.query.code);
  if (!code.success || req.query.error !== undefined) {
    redirectToApp(res, returnPath, "cancelled");
    return;
  }

  try {
    const profile = await fetchOAuthProfile(provider, code.data, flow.verifier);
    if (flow.actor) {
      await linkOAuthIdentity(provider, profile, flow.actor);
      redirectToApp(res, "/settings", "linked");
      return;
    }
    const tokens = await signInWithOAuth(provider, profile, { userAgent: req.get("user-agent"), ipAddress: req.ip });
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    redirectToApp(res, "/oauth/complete");
  } catch (error) {
    const result = error instanceof OAuthError ? error.code : "provider";
    if (!(error instanceof OAuthError)) console.error("OAuth callback failed", { provider });
    redirectToApp(res, returnPath, result);
  }
};
