import crypto from "node:crypto";
import fc from "fast-check";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { diffGroupBalances, rebuildGroupBalances } from "../../src/modules/balances/balance.service.js";
import { createExpense as writeExpense, deleteExpense, updateExpense } from "../../src/modules/expenses/expense.service.js";
import { createSettlement, reverseSettlement } from "../../src/modules/settlements/settlement.service.js";
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
    .send({ name: `Balance test ${crypto.randomUUID()}`, currency: "USD" });
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
      description: "Shared expense",
      expenseDate: today(),
      payers: [{ userId: ownerId, amount: "10.00" }],
      split: {
        type: "EQUAL",
        participants: [ownerId, memberId],
      },
    });
}

function balanceMap(response: request.Response) {
  return new Map(
    response.body.data.members.map(
      (member: { userId: string; balanceMinor: number }) => [
        member.userId,
        member,
      ],
    ),
  );
}

describe("Group balance APIs", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates zero balance rows when members join", async () => {
    const { owner, member, groupId } = await createGroupWithMember();

    const response = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", owner.authHeader);

    expect(response.status).toBe(200);
    const balances = balanceMap(response);
    expect(balances.get(owner.user.id)).toMatchObject({
      balanceMinor: 0,
      direction: "SQUARE",
      isActiveMember: true,
    });
    expect(balances.get(member.user.id)).toMatchObject({
      balanceMinor: 0,
      direction: "SQUARE",
      isActiveMember: true,
    });
  });

  it("recomputes balances from payer and split records", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const expense = await createExpense(
      groupId,
      owner.authHeader,
      owner.user.id,
      member.user.id,
    );
    expect(expense.status).toBe(201);

    const response = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", owner.authHeader);
    const balances = balanceMap(response);

    expect(balances.get(owner.user.id)).toMatchObject({
      balanceMinor: 500,
      direction: "RECEIVES",
    });
    expect(balances.get(member.user.id)).toMatchObject({
      balanceMinor: -500,
      direction: "OWES",
    });
  });

  it("recomputes both old and new participants after an edit", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const expense = await createExpense(
      groupId,
      owner.authHeader,
      owner.user.id,
      member.user.id,
    );

    const updated = await request(app)
      .patch(`/api/groups/${groupId}/expenses/${expense.body.data.id}`)
      .set("Authorization", member.authHeader)
      .send({
        version: 1,
        description: "Edited shared expense",
        expenseDate: today(),
        payers: [{ userId: owner.user.id, amount: "12.00" }],
        split: {
          type: "EXACT",
          participants: [
            { userId: owner.user.id, amount: "4.00" },
            { userId: member.user.id, amount: "8.00" },
          ],
        },
      });
    expect(updated.status).toBe(200);

    const response = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", owner.authHeader);
    const balances = balanceMap(response);
    expect(balances.get(owner.user.id)).toMatchObject({ balanceMinor: 800 });
    expect(balances.get(member.user.id)).toMatchObject({ balanceMinor: -800 });
  });

  it("removes an expense from balances without deleting its records", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const expense = await createExpense(
      groupId,
      owner.authHeader,
      owner.user.id,
      member.user.id,
    );

    const deleted = await request(app)
      .delete(`/api/groups/${groupId}/expenses/${expense.body.data.id}`)
      .set("Authorization", owner.authHeader)
      .send({ version: 1 });
    expect(deleted.status).toBe(200);

    const response = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", owner.authHeader);
    const balances = balanceMap(response);
    expect(balances.get(owner.user.id)).toMatchObject({ balanceMinor: 0 });
    expect(balances.get(member.user.id)).toMatchObject({ balanceMinor: 0 });
    expect(
      await prisma.expense.findUnique({ where: { id: expense.body.data.id } }),
    ).toMatchObject({ deletedById: owner.user.id });
  });

  it("keeps a departed member's balance row and flags it as historical", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    await createExpense(
      groupId,
      owner.authHeader,
      owner.user.id,
      member.user.id,
    );
    await request(app)
      .delete(`/api/groups/${groupId}/members/${member.user.id}`)
      .set("Authorization", member.authHeader);

    const response = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", owner.authHeader);
    expect(response.status).toBe(200);
    expect(balanceMap(response).get(member.user.id)).toMatchObject({
      balanceMinor: -500,
      isActiveMember: false,
    });
  });

  it("can rebuild a projection after a deliberate balance-row corruption", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    await createExpense(
      groupId,
      owner.authHeader,
      owner.user.id,
      member.user.id,
    );
    await prisma.groupBalance.update({
      where: { groupId_userId: { groupId, userId: owner.user.id } },
      data: { amount: 999999n },
    });

    expect(await diffGroupBalances(groupId)).toEqual({
      groupId, differences: [{ userId: owner.user.id, live: 999999n, rebuilt: 500n }],
    });
    await rebuildGroupBalances(groupId);
    expect((await diffGroupBalances(groupId)).differences).toEqual([]);
    const response = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set("Authorization", owner.authHeader);
    expect(balanceMap(response).get(owner.user.id)).toMatchObject({
      balanceMinor: 500,
    });
  });

  it("keeps live balances zero-sum and equal to a rebuild across generated mutations", async () => {
    const amount = fc.integer({ min: 1, max: 20_000 });
    const change = fc.record({
      original: amount, revised: amount, repayment: amount,
      edit: fc.boolean(), delete: fc.boolean(), reverse: fc.boolean(),
    });
    const major = (minor: number) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;

    await fc.assert(fc.asyncProperty(fc.array(change, { minLength: 1, maxLength: 4 }), async (history) => {
      const { owner, member, groupId } = await createGroupWithMember();
      const ownerId = owner.user.id;
      const memberId = member.user.id;
      const expenseInput = (minor: number, payerId: string) => ({
        description: "Generated expense",
        expenseDate: today(),
        payers: [{ userId: payerId, amount: major(minor) }],
        split: { type: "EQUAL" as const, participants: [ownerId, memberId] },
      });
      const assertProjection = async () => {
        const live = await prisma.groupBalance.findMany({ where: { groupId } });
        expect(live).toHaveLength(2);
        expect(live.reduce((sum, row) => sum + row.amount, 0n)).toBe(0n);
        expect((await diffGroupBalances(groupId)).differences).toEqual([]);
      };

      for (const entry of history) {
        let expense = await writeExpense(groupId, ownerId, expenseInput(entry.original, ownerId));
        await assertProjection();
        if (entry.edit) {
          expense = await updateExpense(groupId, expense.id, memberId, {
            ...expenseInput(entry.revised, memberId), version: expense.version,
          });
          await assertProjection();
        }
        const settlement = await createSettlement(groupId, memberId, {
          fromUserId: memberId, toUserId: ownerId, amount: major(entry.repayment), settledOn: today(),
        });
        await assertProjection();
        if (entry.reverse) {
          await reverseSettlement(groupId, settlement.id, ownerId);
          await assertProjection();
        }
        if (entry.delete) {
          await deleteExpense(groupId, expense.id, ownerId, expense.version);
          await assertProjection();
        }
      }
    }), { numRuns: 12 });
  }, 60_000);
});
