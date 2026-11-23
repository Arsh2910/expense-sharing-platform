import request from "supertest";
import { afterAll, expect, it } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createTestUser } from "../helpers.js";

afterAll(() => prisma.$disconnect());

it("creates one notification for the invitee and keeps reads private and idempotent", async () => {
  const owner = await createTestUser();
  const recipient = await createTestUser();
  const group = await request(app).post("/api/groups").set("Authorization", owner.authHeader)
    .send({ name: "Notification Trip", currency: "USD" }).expect(201);
  const invitePath = `/api/groups/${group.body.data.id}/invitations`;
  const invite = await request(app).post(invitePath).set("Authorization", owner.authHeader)
    .send({ username: recipient.user.username }).expect(201);
  await request(app).post(invitePath).set("Authorization", owner.authHeader)
    .send({ username: recipient.user.username }).expect(409);

  await request(app).get("/api/notifications").expect(401);
  const inbox = await request(app).get("/api/notifications").set("Authorization", recipient.authHeader).expect(200);
  expect(inbox.body.data.items).toEqual([expect.objectContaining({
    invitationId: invite.body.data.id, groupName: "Notification Trip", readAt: null,
  })]);
  const id = inbox.body.data.items[0].id as string;
  const readPath = `/api/notifications/${id}/read`;

  const ownerInbox = await request(app).get("/api/notifications").set("Authorization", owner.authHeader).expect(200);
  expect(ownerInbox.body.data.items).toEqual([]);
  await request(app).get("/api/notifications").query({ cursor: id }).set("Authorization", owner.authHeader).expect(400);
  await request(app).patch(readPath).set("Authorization", owner.authHeader).expect(404);
  await request(app).get("/api/notifications/unread-count").set("Authorization", recipient.authHeader)
    .expect(200, { data: { count: 1 } });

  const first = await request(app).patch(readPath).set("Authorization", recipient.authHeader).expect(200);
  const second = await request(app).patch(readPath).set("Authorization", recipient.authHeader).expect(200);
  expect(first.body.data.readAt).toEqual(expect.any(String));
  expect(second.body.data).toEqual(first.body.data);
  await request(app).get("/api/notifications/unread-count").set("Authorization", recipient.authHeader)
    .expect(200, { data: { count: 0 } });
});

it("pages newest first with tied timestamps and marks all recipient notifications read", async () => {
  const owner = await createTestUser();
  const recipient = await createTestUser();
  const otherRecipient = await createTestUser();
  const groups = await prisma.group.createManyAndReturn({
    data: Array.from({ length: 21 }, (_, index) => ({ name: `Group ${index}`, currency: "USD" })),
  });
  const expiresAt = new Date(Date.now() + 60_000);
  const invitations = await prisma.groupInvitation.createManyAndReturn({
    data: [
      ...groups.map(({ id }) => ({
        groupId: id, invitedById: owner.user.id, invitedUserId: recipient.user.id, expiresAt,
      })),
      { groupId: groups[0].id, invitedById: owner.user.id, invitedUserId: otherRecipient.user.id, expiresAt },
    ],
  });
  const createdAt = new Date();
  await prisma.notification.createMany({
    data: invitations.map((invitation) => ({
      recipientId: invitation.invitedUserId!, invitationId: invitation.id, createdAt,
    })),
  });

  const list = () => request(app).get("/api/notifications").set("Authorization", recipient.authHeader);
  const first = (await list().expect(200)).body.data;
  const second = (await list().query({ cursor: first.nextCursor }).expect(200)).body.data;
  expect(first.items).toHaveLength(20);
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  const ids = [...first.items, ...second.items].map((item) => item.id);
  expect(ids).toEqual([...new Set(ids)].sort().reverse());

  await request(app).patch("/api/notifications/read-all").set("Authorization", recipient.authHeader)
    .expect(200, { data: { count: 21 } });
  await request(app).patch("/api/notifications/read-all").set("Authorization", recipient.authHeader)
    .expect(200, { data: { count: 0 } });
  await request(app).get("/api/notifications/unread-count").set("Authorization", otherRecipient.authHeader)
    .expect(200, { data: { count: 1 } });
});
