import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createTestUser } from "../helpers.js";

describe("Invitation APIs", () => {
  afterAll(async () => { await prisma.$disconnect(); });

  async function createGroup(owner: { authHeader: string }) {
    const response = await request(app).post("/api/groups").set("Authorization", owner.authHeader).send({ name: "Invitation Test Group", currency: "INR" });
    return response.body.data.id as string;
  }

  it("creates a username invitation and lets the target accept atomically", async () => {
    const owner = await createTestUser(); const target = await createTestUser(); const groupId = await createGroup(owner);
    const created = await request(app).post(`/api/groups/${groupId}/invitations`).set("Authorization", owner.authHeader).send({ username: target.user.username });
    expect(created.status).toBe(201); expect(created.body.data.invitedUserId).toBe(target.user.id);
    const listed = await request(app).get("/api/invitations").set("Authorization", target.authHeader);
    expect(listed.status).toBe(200); expect(listed.body.data).toHaveLength(1);
    const accepted = await request(app).post(`/api/invitations/${created.body.data.id}/accept`).set("Authorization", target.authHeader);
    expect(accepted.status).toBe(200);
    const membership = await prisma.groupMembership.findFirst({ where: { groupId, userId: target.user.id, leftAt: null } });
    const balance = await prisma.groupBalance.findUnique({ where: { groupId_userId: { groupId, userId: target.user.id } } });
    expect(membership?.role).toBe("MEMBER"); expect(balance?.amount).toBe(0n);
  });

  it("creates an email outbox item for an unregistered email", async () => {
    const owner = await createTestUser(); const groupId = await createGroup(owner); const email = "new-person@example.com";
    const created = await request(app).post(`/api/groups/${groupId}/invitations`).set("Authorization", owner.authHeader).send({ email });
    expect(created.status).toBe(201); expect(created.body.data.invitedEmail).toBe(email);
    const outbox = (await prisma.emailOutbox.findMany({ where: { type: "GROUP_INVITATION", recipient: email }, orderBy: { createdAt: "desc" } })).find((item) => (item.payload as { invitationId?: string }).invitationId === created.body.data.id);
    expect(outbox?.status).toBe("PENDING"); expect(outbox?.payload).toMatchObject({ invitationId: created.body.data.id });
  });

  it("rejects duplicate invitations and invitations from regular members", async () => {
    const owner = await createTestUser(); const member = await createTestUser(); const target = await createTestUser(); const groupId = await createGroup(owner);
    await request(app).post(`/api/groups/${groupId}/members`).set("Authorization", owner.authHeader).send({ email: member.user.email });
    const forbidden = await request(app).post(`/api/groups/${groupId}/invitations`).set("Authorization", member.authHeader).send({ username: target.user.username });
    expect(forbidden.status).toBe(403);
    const first = await request(app).post(`/api/groups/${groupId}/invitations`).set("Authorization", owner.authHeader).send({ username: target.user.username });
    expect(first.status).toBe(201);
    const duplicate = await request(app).post(`/api/groups/${groupId}/invitations`).set("Authorization", owner.authHeader).send({ username: target.user.username });
    expect(duplicate.status).toBe(409);
  });

  it("rejects acceptance by a different user", async () => {
    const owner = await createTestUser(); const target = await createTestUser(); const outsider = await createTestUser(); const groupId = await createGroup(owner);
    const created = await request(app).post(`/api/groups/${groupId}/invitations`).set("Authorization", owner.authHeader).send({ username: target.user.username });
    const response = await request(app).post(`/api/invitations/${created.body.data.id}/accept`).set("Authorization", outsider.authHeader);
    expect(response.status).toBe(403);
  });

  it("rotates an email link, verifies a new account, and accepts the current link", async () => {
    const owner = await createTestUser();
    const groupId = await createGroup(owner);
    const email = `${randomUUID()}@example.test`;
    const password = "InvitationTestPassword1";
    const path = `/api/groups/${groupId}/invitations`;
    const created = await request(app).post(path).set("Authorization", owner.authHeader).send({ email });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const original = await prisma.emailOutbox.findFirstOrThrow({ where: { recipient: email, type: "GROUP_INVITATION" } });

    const resent = await request(app).post(`${path}/${id}/resend`).set("Authorization", owner.authHeader);
    expect(resent.status).toBe(200);
    expect(resent.body.data).not.toHaveProperty("tokenHash");
    const replacement = await prisma.emailOutbox.findFirstOrThrow({
      where: { recipient: email, type: "GROUP_INVITATION", id: { not: original.id } },
    });
    const tokenFrom = (emailRow: { payload: unknown }) => (emailRow.payload as { token: string }).token;
    expect(tokenFrom(replacement)).not.toBe(tokenFrom(original));

    const invitee = request.agent(app);
    const registered = await invitee.post("/api/auth/register").send({ email, password, displayName: "New Invitee" });
    expect(registered.status).toBe(201);
    const duplicate = await request(app).post(path).set("Authorization", owner.authHeader).send({ email });
    expect(duplicate.status).toBe(409);
    const verification = await prisma.emailOutbox.findFirstOrThrow({ where: { recipient: email, type: "EMAIL_VERIFICATION" } });
    expect((await invitee.post("/api/auth/login").send({ email, password })).status).not.toBe(200);
    expect((await invitee.post("/api/auth/verify-email").send({ token: tokenFrom(verification) })).status).toBe(200);
    expect((await invitee.post("/api/auth/login").send({ email, password })).status).toBe(200);
    const inbox = await invitee.get("/api/invitations");
    expect(inbox.body.data.map((invitation: { id: string }) => invitation.id)).toContain(id);
    expect((await invitee.post(`/api/invitations/${id}/accept`).send({ token: tokenFrom(original) })).status).toBe(400);
    expect((await invitee.post(`/api/invitations/${id}/accept`).send({ token: tokenFrom(replacement) })).status).toBe(200);
  });

  it("reports an expired invitation and frees its slot for a fresh invitation", async () => {
    const owner = await createTestUser();
    const target = await createTestUser();
    const groupId = await createGroup(owner);
    const path = `/api/groups/${groupId}/invitations`;
    const input = { username: target.user.username };
    const created = await request(app).post(path).set("Authorization", owner.authHeader).send(input);
    await prisma.groupInvitation.update({
      where: { id: created.body.data.id }, data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const history = await request(app).get(path).set("Authorization", owner.authHeader);
    expect(history.body.data[0].status).toBe("EXPIRED");
    const accepted = await request(app).post(`/api/invitations/${created.body.data.id}/accept`).set("Authorization", target.authHeader);
    expect(accepted.body.code).toBe("INVITATION_EXPIRED");
    const fresh = await request(app).post(path).set("Authorization", owner.authHeader).send(input);
    expect(fresh.status).toBe(201);
    expect(fresh.body.data.id).not.toBe(created.body.data.id);
  });

  it("does not allow accept and revoke to win the same invitation", async () => {
    const owner = await createTestUser();
    const target = await createTestUser();
    const groupId = await createGroup(owner);
    const path = `/api/groups/${groupId}/invitations`;
    const created = await request(app).post(path).set("Authorization", owner.authHeader).send({ username: target.user.username });
    const id = created.body.data.id;
    expect((await request(app).post(`${path}/${id}/revoke`).set("Authorization", target.authHeader)).status).toBe(403);
    const [accept, revoke] = await Promise.all([
      request(app).post(`/api/invitations/${id}/accept`).set("Authorization", target.authHeader),
      request(app).post(`${path}/${id}/revoke`).set("Authorization", owner.authHeader),
    ]);
    expect([accept.status, revoke.status].sort()).toEqual([200, 409]);
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: target.user.id, leftAt: null },
    });
    expect(Boolean(membership)).toBe(accept.status === 200);
  });
});
