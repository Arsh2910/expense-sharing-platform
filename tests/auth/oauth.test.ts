import { randomInt, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createTestUser } from "../helpers.js";

const frontend = "http://localhost:5173";
const apiOrigin = "http://localhost:5000";
const endpoint = "/api/auth/oauth";

beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", frontend);
  vi.stubEnv("OAUTH_API_ORIGIN", apiOrigin);
  for (const provider of ["GOOGLE", "GITHUB"]) {
    vi.stubEnv(`${provider}_OAUTH_CLIENT_ID`, "test-client-id");
    vi.stubEnv(`${provider}_OAUTH_CLIENT_SECRET`, "test-client-secret");
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(() => prisma.$disconnect());

function mockGoogle(subject: string, email: string, verified = true) {
  const providerFetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "https://oauth2.googleapis.com/token") {
      const form = init?.body as URLSearchParams;
      expect(form.get("code_verifier")).toMatch(/^[\w-]{43}$/);
      expect(form.get("redirect_uri")).toBe(`${apiOrigin}${endpoint}/google/callback`);
      return Response.json({ access_token: "provider-token" });
    }
    expect(url).toBe("https://openidconnect.googleapis.com/v1/userinfo");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer provider-token" });
    return Response.json({ sub: subject, email, email_verified: verified, name: "Social User" });
  });
  vi.stubGlobal("fetch", providerFetch);
  return providerFetch;
}

function flowFrom(start: { headers: Record<string, unknown> }) {
  const target = new URL(String(start.headers.location));
  const [cookie] = start.headers["set-cookie"] as string[];
  expect(target.searchParams.get("code_challenge_method")).toBe("S256");
  expect(target.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
  return { state: target.searchParams.get("state"), cookie: cookie.split(";")[0] };
}

describe("OAuth sign-in", () => {
  it("advertises only configured providers and rejects a mismatched state before exchange", async () => {
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "");
    await request(app).get(`${endpoint}/providers`).expect(200, { data: ["google"] });
    await request(app).get(`${endpoint}/github/start`).expect(303)
      .expect("Location", `${frontend}/login?oauth=unavailable`);
    const flow = flowFrom(await request(app).get(`${endpoint}/google/start`).expect(302));
    const providerFetch = mockGoogle(randomUUID(), "oauth@example.com");
    await request(app).get(`${endpoint}/google/callback`)
      .set("Cookie", flow.cookie).query({ state: "b".repeat(43), code: "example" })
      .expect(303).expect("Location", `${frontend}/login?oauth=expired`);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("creates a verified account and sets the regular SplitCircle session cookies", async () => {
    const subject = randomUUID();
    const email = `oauth-${subject}@gmail.com`;
    mockGoogle(subject, email);
    const agent = request.agent(app);
    const flow = flowFrom(await agent.get(`${endpoint}/google/start`).expect(302));
    await agent.get(`${endpoint}/google/callback`).query({ state: flow.state, code: "example" })
      .expect(303).expect("Location", `${frontend}/oauth/complete`);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.data).toMatchObject({ email, displayName: "Social User" });
    const link = await prisma.oAuthIdentity.findUniqueOrThrow({
      where: { provider_subject: { provider: "google", subject } },
      include: { user: true },
    });
    expect(link.userId).toBe(me.body.data.id);
    expect(link.user.passwordHash).toBeNull();
    await request(app).post("/api/auth/login").send({ email, password: "example password" }).expect(401);

    await agent.post("/api/auth/refresh").send({}).expect(200);
    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);
  });

  it("requires an authenticated connection for an existing email, then signs in by subject", async () => {
    const { user, authHeader } = await createTestUser();
    const subject = randomUUID();
    mockGoogle(subject, user.email);
    const flow = flowFrom(await request(app).get(`${endpoint}/google/start`).expect(302));
    await request(app).get(`${endpoint}/google/callback`)
      .set("Cookie", flow.cookie).query({ state: flow.state, code: "example" })
      .expect(303).expect("Location", `${frontend}/login?oauth=link_required`);
    expect(await prisma.oAuthIdentity.count({ where: { userId: user.id } })).toBe(0);
    await request(app).get(`${endpoint}/google/link`).expect(401);

    const link = flowFrom(await request(app).get(`${endpoint}/google/link`).set("Authorization", authHeader).expect(302));
    await request(app).get(`${endpoint}/google/callback`)
      .set("Cookie", link.cookie).query({ state: link.state, code: "link-example" })
      .expect(303).expect("Location", `${frontend}/settings?oauth=linked`);
    const methods = await request(app).get(`${endpoint}/links`).set("Authorization", authHeader).expect(200);
    expect(methods.body.data.providers).toContainEqual({ provider: "google", linked: true });

    const agent = request.agent(app);
    const signin = flowFrom(await agent.get(`${endpoint}/google/start`).expect(302));
    mockGoogle(subject, "new-provider-address@gmail.com");
    await agent.get(`${endpoint}/google/callback`).query({ state: signin.state, code: "signin-example" })
      .expect(303).expect("Location", `${frontend}/oauth/complete`);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.data).toMatchObject({ id: user.id, email: user.email });
  });

  it("rejects an unverified Google email and can register through GitHub's verified primary email", async () => {
    const subject = randomUUID();
    const email = `oauth-${subject}@example.com`;
    mockGoogle(subject, email, false);
    const flow = flowFrom(await request(app).get(`${endpoint}/google/start`).expect(302));
    await request(app).get(`${endpoint}/google/callback`)
      .set("Cookie", flow.cookie).query({ state: flow.state, code: "example" })
      .expect(303).expect("Location", `${frontend}/login?oauth=email`);
    expect(await prisma.user.findFirst({ where: { email } })).toBeNull();

    mockGoogle(subject, email);
    const external = flowFrom(await request(app).get(`${endpoint}/google/start`).expect(302));
    await request(app).get(`${endpoint}/google/callback`)
      .set("Cookie", external.cookie).query({ state: external.state, code: "external-example" })
      .expect(303).expect("Location", `${frontend}/login?oauth=verify_locally`);
    expect(await prisma.user.findFirst({ where: { email } })).toBeNull();

    const githubId = randomInt(1, 2 ** 40);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "gh-token" });
      if (url === "https://api.github.com/user") return Response.json({ id: githubId, login: "test-user", name: null });
      expect(url).toBe("https://api.github.com/user/emails?per_page=100");
      return Response.json([
        { email: "other@example.com", primary: false, verified: true },
        { email, primary: true, verified: true },
      ]);
    }));
    const agent = request.agent(app);
    const github = flowFrom(await agent.get(`${endpoint}/github/start`).expect(302));
    await agent.get(`${endpoint}/github/callback`).query({ state: github.state, code: "example" })
      .expect(303).expect("Location", `${frontend}/oauth/complete`);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.data).toMatchObject({ email, displayName: "test-user" });
  });
});
