import { createHash } from "node:crypto";
import { z } from "zod";

export const oauthProviders = ["google", "github"] as const;
export type OAuthProvider = typeof oauthProviders[number];
export const oauthProviderSchema = z.enum(oauthProviders);

const endpoints = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
  },
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
  },
} as const;

export class OAuthError extends Error {
  constructor(public readonly code: "unavailable" | "provider" | "email" | "verify_locally" | "link_required" | "conflict" | "session") {
    super(code);
  }
}

export function getOAuthConfig(provider: OAuthProvider) {
  const prefix = provider.toUpperCase();
  const clientId = process.env[`${prefix}_OAUTH_CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${prefix}_OAUTH_CLIENT_SECRET`]?.trim();
  const apiOrigin = process.env.OAUTH_API_ORIGIN;
  if (!clientId || !clientSecret || !apiOrigin) return null;
  return {
    ...endpoints[provider],
    clientId,
    clientSecret,
    redirectUri: new URL(`/api/auth/oauth/${provider}/callback`, apiOrigin).href,
  };
}

export function authorizationUrl(provider: OAuthProvider, state: string, verifier: string) {
  const config = getOAuthConfig(provider);
  if (!config) throw new OAuthError("unavailable");
  const url = new URL(config.authorize);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scope,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.href;
}

const emailSchema = z.email().max(255).transform((email) => email.toLowerCase());
const googleProfile = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  hd: z.string().min(1).optional(),
  name: z.string().optional(),
});
const githubProfile = z.object({ id: z.int().positive(), login: z.string(), name: z.string().nullish() });
const githubEmails = z.array(z.object({
  email: z.string(),
  primary: z.boolean(),
  verified: z.boolean(),
}));
const tokenResponse = z.object({ access_token: z.string().min(1) });

export type OAuthProfile = {
  subject: string;
  email: string;
  displayName: string;
  mayCreateAccount: boolean;
};

async function providerJson(url: string, init: RequestInit) {
  try {
    const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new OAuthError("provider");
    return await response.json() as unknown;
  } catch {
    throw new OAuthError("provider");
  }
}

function verifiedProfile(subject: string, providerEmail: string | undefined, name?: string | null) {
  const email = emailSchema.safeParse(providerEmail);
  if (!email.success) throw new OAuthError("email");
  return { subject, email: email.data, displayName: name?.trim().slice(0, 100) || "SplitCircle member" };
}

export async function fetchOAuthProfile(provider: OAuthProvider, code: string, verifier: string) {
  const config = getOAuthConfig(provider);
  if (!config) throw new OAuthError("unavailable");
  const token = tokenResponse.safeParse(await providerJson(config.token, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
    }),
  }));
  if (!token.success) throw new OAuthError("provider");
  const Authorization = `Bearer ${token.data.access_token}`;

  if (provider === "google") {
    const profile = googleProfile.safeParse(await providerJson("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization },
    }));
    if (!profile.success) throw new OAuthError("provider");
    const identity = verifiedProfile(profile.data.sub, profile.data.email_verified ? profile.data.email : undefined, profile.data.name);
    return { ...identity, mayCreateAccount: identity.email.endsWith("@gmail.com") || Boolean(profile.data.hd) };
  }

  const headers = {
    Authorization,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2026-03-10",
    "User-Agent": "SplitCircle",
  };
  const [rawProfile, rawEmails] = await Promise.all([
    providerJson("https://api.github.com/user", { headers }),
    providerJson("https://api.github.com/user/emails?per_page=100", { headers }),
  ]);
  const profile = githubProfile.safeParse(rawProfile);
  const emails = githubEmails.safeParse(rawEmails);
  if (!profile.success || !emails.success) throw new OAuthError("provider");
  const email = emails.data.find((entry) => entry.primary && entry.verified)?.email;
  return { ...verifiedProfile(String(profile.data.id), email, profile.data.name || profile.data.login), mayCreateAccount: true };
}
