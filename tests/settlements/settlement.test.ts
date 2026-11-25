import crypto from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createTestUser, joinTestGroup } from "../helpers.js";

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function createGroupWithMember() {
  const owner = await createTestUser();
  const member = await createTestUser();
  const group = await request(app)
    .post("/api/groups")
    .set("Authorization", owner.authHeader)
    .send({ name: `Settlement test ${crypto.randomUUID()}`, currency: "USD" });
  const groupId = group.body.data.id as string;
  await joinTestGroup(app, groupId, owner, member);
  return { owner, member, groupId };
}

async function createExpense(
  groupId: string,
  authHeader: string,
  ownerId: string,
  memberId: string,
) {
  return request(app)
    .post(`/api/groups/${groupId}/expenses`)
    .set("Authorization", authHeader)
    .send({
      description: "Shared dinner",
      expenseDate: today(),
      payers: [{ userId: ownerId, amount: "10.00" }],
      split: { type: "EQUAL", participants: [ownerId, memberId] },
    });
}

async function createSettlement(
  groupId: string,
  authHeader: string,
  fromUserId: string,
  toUserId: string,
  amount = "5.00",
) {
  return request(app)
    .post(`/api/groups/${groupId}/settlements`)
    .set("Authorization", authHeader)
    .send({
      fromUserId,
      toUserId,
      amount,
      settledOn: today(),
      note: "Paid back",
    });
}

function balancesByUser(response: request.Response) {
  return new Map(
    response.body.data.members.map(
      (member: { userId: string; balanceMinor: number }) => [
        member.userId,
        member,
      ],
    ),
  );
}

describe("Settlement APIs", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("records a settlement and updates both balances atomically", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    await createExpense(groupId, owner.authHeader, owner.user.id, member.user.id);

    const settlement = await createSettlement(
      groupId,
      member.authHeader,
      member.user.id,
      owner.user.id,
    );
    expect(settlement.status).toBe(201);
    expect(settlement.body.data.amountMinor).toBe(500);

    const balances = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", owner.authHeader);
    const byUser = balancesByUser(balances);
    expect(byUser.get(owner.user.id)).toMatchObject({ balanceMinor: 0 });
    expect(byUser.get(member.user.id)).toMatchObject({ balanceMinor: 0 });
  });

  it("lists settlement history without mutating the original row", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const created = await createSettlement(
      groupId,
      owner.authHeader,
      owner.user.id,
      member.user.id,
      "3.25",
    );
    expect(created.status).toBe(201);

    const list = await request(app)
      .get(`/api/groups/${groupId}/settlements`)
      .set("Authorization", member.authHeader);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({
      id: created.body.data.id,
      amountMinor: 325,
      fromUserId: owner.user.id,
      toUserId: member.user.id,
    });
  });

  it("reverses a settlement by appending the opposite settlement", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    await createExpense(groupId, owner.authHeader, owner.user.id, member.user.id);
    const created = await createSettlement(
      groupId,
      member.authHeader,
      member.user.id,
      owner.user.id,
    );

    const reversal = await request(app)
      .post(
        `/api/groups/${groupId}/settlements/${created.body.data.id}/reverse`,
      )
      .set("Authorization", owner.authHeader);
    expect(reversal.status).toBe(201);
    expect(reversal.body.data.reversesId).toBe(created.body.data.id);
    expect(reversal.body.data.fromUserId).toBe(owner.user.id);
    expect(reversal.body.data.toUserId).toBe(member.user.id);

    const list = await request(app)
      .get(`/api/groups/${groupId}/settlements`)
      .set("Authorization", owner.authHeader);
    expect(list.body.data).toHaveLength(2);

    const balances = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", owner.authHeader);
    const byUser = balancesByUser(balances);
    expect(byUser.get(owner.user.id)).toMatchObject({ balanceMinor: 500 });
    expect(byUser.get(member.user.id)).toMatchObject({ balanceMinor: -500 });
  });

  it("allows overpayment and represents the resulting credit as positive", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    await createExpense(groupId, owner.authHeader, owner.user.id, member.user.id);
    const settlement = await createSettlement(
      groupId,
      member.authHeader,
      member.user.id,
      owner.user.id,
      "7.00",
    );
    expect(settlement.status).toBe(201);

    const balances = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", owner.authHeader);
    const byUser = balancesByUser(balances);
    expect(byUser.get(member.user.id)).toMatchObject({
      balanceMinor: 200,
      direction: "RECEIVES",
    });
  });

  it("allows participants and admins to manage settlements and bars uninvolved members", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const observer = await createTestUser();
    await joinTestGroup(app, groupId, owner, observer);
    const record = (authHeader: string) => createSettlement(groupId, authHeader, owner.user.id, member.user.id);

    expect((await record(observer.authHeader)).status).toBe(403);
    const created = await record(member.authHeader);
    expect(created.status).toBe(201);
    const reverse = (authHeader: string) => request(app)
      .post(`/api/groups/${groupId}/settlements/${created.body.data.id}/reverse`)
      .set("Authorization", authHeader);
    await reverse(observer.authHeader).expect(403);
    expect(await prisma.settlement.count({ where: { groupId } })).toBe(1);

    await prisma.groupMembership.updateMany({
      where: { groupId, userId: observer.user.id, leftAt: null }, data: { role: "ADMIN" },
    });
    expect((await record(observer.authHeader)).status).toBe(201);
    await reverse(observer.authHeader).expect(201);
  });

  it("rejects self-settlement, former participants, and future dates", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const self = await createSettlement(
      groupId,
      owner.authHeader,
      owner.user.id,
      owner.user.id,
    );
    expect(self.status).toBe(422);
    expect(self.body.code).toBe("SAME_USER");

    await request(app)
      .delete(`/api/groups/${groupId}/members/${member.user.id}`)
      .set("Authorization", member.authHeader);
    const former = await createSettlement(
      groupId,
      owner.authHeader,
      member.user.id,
      owner.user.id,
    );
    expect(former.status).toBe(422);
    expect(former.body.code).toBe("INVALID_MEMBER");

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const future = await request(app)
      .post(`/api/groups/${groupId}/settlements`)
      .set("Authorization", owner.authHeader)
      .send({
        fromUserId: owner.user.id,
        toUserId: member.user.id,
        amount: "1.00",
        settledOn: tomorrow,
      });
    expect(future.status).toBe(422);
    expect(future.body.code).toBe("FUTURE_DATE");
  });

  it("allows concurrent settlements without balance drift", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const [left, right] = await Promise.all([
      createSettlement(
        groupId,
        member.authHeader,
        member.user.id,
        owner.user.id,
        "1.00",
      ),
      createSettlement(
        groupId,
        member.authHeader,
        member.user.id,
        owner.user.id,
        "2.00",
      ),
    ]);
    expect(left.status).toBe(201);
    expect(right.status).toBe(201);

    const list = await request(app)
      .get(`/api/groups/${groupId}/settlements`)
      .set("Authorization", owner.authHeader);
    expect(list.body.data).toHaveLength(2);
    const balances = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", owner.authHeader);
    const byUser = balancesByUser(balances);
    expect(byUser.get(member.user.id)).toMatchObject({ balanceMinor: 300 });
    expect(byUser.get(owner.user.id)).toMatchObject({ balanceMinor: -300 });
  });

  it("creates one notification when identical settlement requests race", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const key = crypto.randomUUID();
    const payload = {
      fromUserId: owner.user.id, toUserId: member.user.id, amount: "5.00", settledOn: today(),
    };
    const submit = () => request(app).post(`/api/groups/${groupId}/settlements`)
      .set("Authorization", owner.authHeader).set("Idempotency-Key", key).send(payload);
    const results = await Promise.all([submit(), submit()]);
    expect(results.some((result) => result.status === 201)).toBe(true);
    expect(results.every((result) => [201, 409].includes(result.status))).toBe(true);
    const replay = await submit().expect(201);
    expect(await prisma.settlement.count({ where: { groupId } })).toBe(1);
    const inbox = await request(app).get("/api/notifications").set("Authorization", member.authHeader).expect(200);
    expect(inbox.body.data.items.filter((item: { type: string }) => item.type.startsWith("SETTLEMENT_"))).toEqual([expect.objectContaining({
      type: "SETTLEMENT_RECORDED", groupId, settlementId: replay.body.data.id,
    })]);
    expect(await prisma.notification.count({ where: { recipientId: owner.user.id } })).toBe(0);
  });

  it("allows only one reversal per settlement", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const created = await createSettlement(
      groupId,
      owner.authHeader,
      owner.user.id,
      member.user.id,
    );
    const path = `/api/groups/${groupId}/settlements/${created.body.data.id}/reverse`;
    const outsider = await createTestUser();
    await request(app).post(path).set("Authorization", outsider.authHeader).expect(403);
    expect(await prisma.settlement.count({ where: { reversesId: created.body.data.id } })).toBe(0);
    const reverse = () => request(app).post(path).set("Authorization", owner.authHeader);
    const results = await Promise.all([reverse(), reverse()]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(results.find(({ status }) => status === 409)?.body.code).toBe("ALREADY_REVERSED");
    const reversal = results.find(({ status }) => status === 201)?.body.data;
    const inbox = await request(app).get("/api/notifications").set("Authorization", member.authHeader).expect(200);
    expect(inbox.body.data.items.filter((item: { type: string }) => item.type.startsWith("SETTLEMENT_"))).toEqual([
      expect.objectContaining({ type: "SETTLEMENT_REVERSED", groupId, settlementId: reversal.id }),
      expect.objectContaining({ type: "SETTLEMENT_RECORDED", groupId, settlementId: created.body.data.id }),
    ]);
  });
});
