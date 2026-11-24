import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, expect, it } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { recordAuditEvent } from "../../src/modules/audit/audit.service.js";
import { createTestUser } from "../helpers.js";

afterAll(() => prisma.$disconnect());

async function createGroup(owner?: Awaited<ReturnType<typeof createTestUser>>) {
  const actor = owner ?? await createTestUser();
  const result = await request(app).post("/api/groups").set("Authorization", actor.authHeader)
    .send({ name: "Goa trip", currency: "USD" }).expect(201);
  const groupId: string = result.body.data.id;
  return { owner: actor, groupId, path: `/api/groups/${groupId}` };
}

function listActivity(path: string, authHeader: string) {
  return request(app).get(`${path}/activity`).set("Authorization", authHeader);
}

it("records group creation, resolves the actor, and keeps archived history readable to members", async () => {
  const { owner, path, groupId } = await createGroup();
  const created = await listActivity(path, owner.authHeader).expect(200);
  expect(created.body.data).toEqual([expect.objectContaining({
    action: "GROUP_CREATED",
    entityType: "Group",
    entityId: groupId,
    actor: { id: owner.user.id, displayName: owner.user.displayName, username: owner.user.username },
    metadata: { name: "Goa trip" },
  })]);
  await request(app).delete(path).set("Authorization", owner.authHeader).expect(200);
  const archived = await listActivity(path, owner.authHeader).expect(200);
  expect(archived.body.data[0]).toMatchObject({ action: "GROUP_ARCHIVED", entityId: groupId });
});

it("records expense creation, the winning edit, and deletion once each", async () => {
  const { owner, path, groupId } = await createGroup();
  const auth = owner.authHeader;
  const body = {
    description: "Goa hotel", expenseDate: new Date().toISOString().slice(0, 10),
    payers: [{ userId: owner.user.id, amount: "10.00" }],
    split: { type: "EQUAL", participants: [owner.user.id] },
  };
  const key = randomUUID();
  const submit = () => request(app).post(`${path}/expenses`).set("Authorization", auth)
    .set("Idempotency-Key", key).send(body);
  const created = await submit().expect(201);
  expect((await submit().expect(201)).body.data.id).toBe(created.body.data.id);
  const expenseId: string = created.body.data.id;
  const expensePath = `${path}/expenses/${expenseId}`;

  const edit = (description: string) => request(app).patch(expensePath).set("Authorization", auth)
    .send({ ...body, description, version: 1 });
  const edits = await Promise.all([edit("Beach hotel"), edit("City hotel")]);
  expect(edits.map(({ status }) => status).sort()).toEqual([200, 409]);
  const updated = edits.find(({ status }) => status === 200)!;

  await request(app).delete(expensePath).set("Authorization", auth).send({ version: 2 }).expect(200);
  await request(app).delete(expensePath).set("Authorization", auth).send({ version: 2 }).expect(404);

  const events = await prisma.auditEvent.findMany({ where: { groupId, entityId: expenseId } });
  expect(events).toHaveLength(3);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: "EXPENSE_CREATED", metadata: { description: body.description, version: 1 } }),
    expect.objectContaining({ action: "EXPENSE_UPDATED", metadata: {
      description: updated.body.data.description, fromVersion: 1, toVersion: 2,
    } }),
    expect.objectContaining({ action: "EXPENSE_DELETED", metadata: {
      description: updated.body.data.description, version: 3,
    } }),
  ]));
});

it("records settlement creation and only the successful reversal", async () => {
  const { owner, path, groupId } = await createGroup();
  const participant = await createTestUser();
  await request(app).post(`${path}/members`).set("Authorization", owner.authHeader)
    .send({ email: participant.user.email }).expect(201);
  const settlement = await request(app).post(`${path}/settlements`).set("Authorization", owner.authHeader)
    .send({
      fromUserId: owner.user.id, toUserId: participant.user.id, amount: "5.00",
      settledOn: new Date().toISOString().slice(0, 10),
    }).expect(201);
  const settlementId: string = settlement.body.data.id;
  const reverse = () => request(app).post(`${path}/settlements/${settlementId}/reverse`)
    .set("Authorization", owner.authHeader);
  const reversals = await Promise.all([reverse(), reverse()]);
  expect(reversals.map(({ status }) => status).sort()).toEqual([201, 409]);
  const reversed = reversals.find(({ status }) => status === 201)!;
  const events = await prisma.auditEvent.findMany({ where: { groupId, entityType: "Settlement" } });
  expect(events).toHaveLength(2);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: "SETTLEMENT_CREATED", entityId: settlementId }),
    expect.objectContaining({
      action: "SETTLEMENT_REVERSED",
      entityId: reversed.body.data.id,
      metadata: {
        fromUserId: participant.user.id, toUserId: owner.user.id, reversesId: settlementId,
      },
    }),
  ]));
});

it("records invitation acceptance without keeping email or tokens in audit metadata", async () => {
  const { owner, path, groupId } = await createGroup();
  const email = `${randomUUID()}@example.test`;
  const invite = await request(app).post(`${path}/invitations`).set("Authorization", owner.authHeader)
    .send({ email }).expect(201);
  const id: string = invite.body.data.id;
  const outbox = await prisma.emailOutbox.findFirstOrThrow({ where: { recipient: email, type: "GROUP_INVITATION" } });
  const { token } = outbox.payload as { token: string };
  expect(token).toEqual(expect.any(String));
  const recipient = await createTestUser({ email });
  await request(app).post(`/api/invitations/${id}/accept`).set("Authorization", recipient.authHeader)
    .send({ token }).expect(200);
  const events = await prisma.auditEvent.findMany({ where: { groupId, entityId: id } });
  expect(events).toHaveLength(2);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: "MEMBER_INVITED", actorId: owner.user.id, metadata: { invitedUserId: null } }),
    expect.objectContaining({ action: "INVITATION_ACCEPTED", actorId: recipient.user.id, metadata: null }),
  ]));
  const stored = JSON.stringify(events);
  expect(stored).not.toContain(email);
  expect(stored).not.toContain(token);
});

it("rolls back an audit insert when the transaction fails after the insert", async () => {
  const { owner, groupId } = await createGroup();
  await expect(prisma.$transaction(async (tx) => {
    await tx.group.update({ where: { id: groupId }, data: { name: "Uncommitted name" } });
    await recordAuditEvent(tx, {
      groupId, actorId: owner.user.id, action: "GROUP_RENAMED", entityId: groupId,
      metadata: { fromName: "Goa trip", toName: "Uncommitted name" },
    });
    throw new Error("Force transaction rollback");
  })).rejects.toThrow("Force transaction rollback");
  expect(await prisma.auditEvent.count({ where: { groupId, action: "GROUP_RENAMED" } })).toBe(0);
  expect(await prisma.group.findUnique({ where: { id: groupId } })).toMatchObject({ name: "Goa trip" });
});

it("scopes cursors and membership, excludes private actions, and orders timestamp ties across pages", async () => {
  const { owner, path, groupId } = await createGroup();
  const other = await createGroup(owner);
  const outsider = await createTestUser();
  const otherPage = await listActivity(other.path, owner.authHeader).expect(200);
  await request(app).get(`${path}/activity`).expect(401);
  await listActivity(path, outsider.authHeader).expect(403);
  await listActivity(path, owner.authHeader).query({ cursor: "invalid" }).expect(400);
  await listActivity(path, owner.authHeader).query({ cursor: otherPage.body.data[0].id }).expect(400);

  const ids = Array.from({ length: 21 }, () => randomUUID()).sort().reverse();
  const createdAt = new Date("2000-01-01T00:00:00.000Z");
  const privateId = randomUUID();
  await prisma.auditEvent.createMany({
    data: [
      ...ids.map((id) => ({ id, groupId, action: "GROUP_RENAMED", entityType: "Group", createdAt })),
      { id: privateId, groupId, action: "USER_LOGIN", entityType: "User", metadata: { secret: "private auth event" } },
    ],
  });
  await listActivity(path, owner.authHeader).query({ cursor: privateId }).expect(400);
  const first = (await listActivity(path, owner.authHeader).expect(200)).body;
  expect(first.data).toHaveLength(20);
  expect(first.data[0].action).toBe("GROUP_CREATED");
  const second = (await listActivity(path, owner.authHeader).query({ cursor: first.pagination.nextCursor }).expect(200)).body;
  expect(second.data).toHaveLength(2);
  expect(second.pagination.nextCursor).toBeNull();
  expect([...first.data.slice(1), ...second.data].map(({ id }) => id)).toEqual(ids);
});
