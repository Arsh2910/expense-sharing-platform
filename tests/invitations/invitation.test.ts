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
});
