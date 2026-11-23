import crypto from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createTestUser } from "../helpers.js";

async function createGroupWithMember(currency = "USD") {
  const owner = await createTestUser();
  const member = await createTestUser();
  const groupResponse = await request(app)
    .post("/api/groups")
    .set("Authorization", owner.authHeader)
    .send({ name: `Expense test ${crypto.randomUUID()}`, currency });
  const groupId = groupResponse.body.data.id as string;

  await request(app)
    .post(`/api/groups/${groupId}/members`)
    .set("Authorization", owner.authHeader)
    .send({ email: member.user.email });

  return { owner, member, groupId };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function createSimpleExpense(
  groupId: string,
  authHeader: string,
  payerUserId: string,
  description = "Test expense",
) {
  return request(app)
    .post(`/api/groups/${groupId}/expenses`)
    .set("Authorization", authHeader)
    .send({
      description,
      expenseDate: today(),
      payers: [{ userId: payerUserId, amount: "10.00" }],
      split: { type: "EQUAL", participants: [payerUserId] },
    });
}

describe("Expense APIs", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("notifies affected participants once per committed expense revision", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const newMember = await createTestUser();
    await request(app).post(`/api/groups/${groupId}/members`).set("Authorization", owner.authHeader)
      .send({ email: newMember.user.email }).expect(201);

    const path = `/api/groups/${groupId}/expenses`;
    const key = crypto.randomUUID();
    const auth = owner.authHeader;
    const body = {
      description: "Dinner",
      expenseDate: today(),
      payers: [{ userId: owner.user.id, amount: "10.00" }],
      split: { type: "EQUAL", participants: [owner.user.id, member.user.id] },
    };
    const create = () => request(app).post(path).set("Authorization", auth).set("Idempotency-Key", key).send(body);
    const creates = await Promise.all([create(), create()]);
    expect(creates.some((response) => response.status === 201)).toBe(true);
    expect(creates.every((response) => [201, 409].includes(response.status))).toBe(true);
    const expenseId = (await create().expect(201)).body.data.id;
    expect(await prisma.expense.count({ where: { groupId } })).toBe(1);
    const expensePath = `${path}/${expenseId}`;

    const edit = () => request(app).patch(expensePath).set("Authorization", auth).send({
      ...body, version: 1, description: "Updated dinner",
      split: { type: "EQUAL", participants: [owner.user.id, newMember.user.id] },
    });
    const edits = await Promise.all([edit(), edit()]);
    expect(edits.map(({ status }) => status).sort()).toEqual([200, 409]);

    const remove = () => request(app).delete(expensePath).set("Authorization", auth).send({ version: 2 });
    const deletes = await Promise.all([remove(), remove()]);
    expect(deletes.map(({ status }) => status).sort()).toEqual([200, 404]);

    const inbox = async (authHeader: string) => {
      const result = await request(app).get("/api/notifications").set("Authorization", authHeader).expect(200);
      return result.body.data.items;
    };

    expect(await inbox(member.authHeader)).toEqual([
      expect.objectContaining({ type: "EXPENSE_UPDATED", expenseId, groupId, expenseDescription: "Updated dinner" }),
      expect.objectContaining({ type: "EXPENSE_CREATED", expenseId, expenseDescription: "Dinner", expenseDeleted: true }),
    ]);
    expect(await inbox(newMember.authHeader)).toEqual([
      expect.objectContaining({ type: "EXPENSE_DELETED", expenseId, expenseDeleted: true }),
      expect.objectContaining({ type: "EXPENSE_UPDATED", expenseId }),
    ]);
    expect(await inbox(auth)).toEqual([]);
    const balances = await prisma.groupBalance.findMany({ where: { groupId } });
    expect(balances.every((balance) => balance.amount === 0n)).toBe(true);
  });

  it("creates an equal expense with balanced rows and an initial revision", async () => {
    const { owner, member, groupId } = await createGroupWithMember();

    const response = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", owner.authHeader)
      .send({
        description: "Dinner",
        category: "FOOD",
        expenseDate: today(),
        total: "10.00",
        payers: [{ userId: owner.user.id, amount: "10.00" }],
        split: {
          type: "EQUAL",
          participants: [member.user.id, owner.user.id],
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.data.totalMinor).toBe(1000);
    expect(response.body.data.currency).toBe("USD");
    expect(response.body.data.splitType).toBe("EQUAL");
    expect(response.body.data.payers).toEqual([
      { userId: owner.user.id, amountMinor: 1000 },
    ]);
    expect(
      response.body.data.splits.map(
        (split: { userId: string; amountMinor: number }) => [
          split.userId,
          split.amountMinor,
        ],
      ),
    ).toEqual(
      [owner.user.id, member.user.id]
        .sort()
        .map((userId) => [userId, 500]),
    );

    const stored = await prisma.expense.findUnique({
      where: { id: response.body.data.id },
      include: {
        payers: true,
        splits: true,
        revisions: true,
      },
    });
    expect(stored?.amount).toBe(1000n);
    expect(stored?.payers).toHaveLength(1);
    expect(stored?.splits).toHaveLength(2);
    expect(stored?.revisions).toHaveLength(1);
    expect(stored?.revisions[0]?.revision).toBe(1);
  });

  it("creates a multi-payer exact expense", async () => {
    const { owner, member, groupId } = await createGroupWithMember();

    const response = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", member.authHeader)
      .send({
        description: "Tickets",
        expenseDate: today(),
        payers: [
          { userId: owner.user.id, amount: "7.25" },
          { userId: member.user.id, amount: "2.75" },
        ],
        split: {
          type: "EXACT",
          participants: [
            { userId: owner.user.id, amount: "4.00" },
            { userId: member.user.id, amount: "6.00" },
          ],
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.data.totalMinor).toBe(1000);
    expect(response.body.data.payers).toHaveLength(2);
    expect(response.body.data.splits).toHaveLength(2);
  });

  it("uses fixed-scale percentages and deterministic largest-remainder rounding", async () => {
    const { owner, member, groupId } = await createGroupWithMember();

    const response = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", owner.authHeader)
      .send({
        description: "Rounding",
        expenseDate: today(),
        payers: [{ userId: owner.user.id, amount: "10.01" }],
        split: {
          type: "PERCENTAGE",
          participants: [
            { userId: owner.user.id, percentage: "33.333333" },
            { userId: member.user.id, percentage: "66.666667" },
          ],
        },
      });

    expect(response.status).toBe(201);
    const splits = new Map(
      response.body.data.splits.map(
        (split: { userId: string; amountMinor: number; percentUnits: number }) => [
          split.userId,
          split,
        ],
      ),
    );
    expect(splits.get(owner.user.id)).toMatchObject({
      amountMinor: 334,
      percentUnits: 33_333_333,
    });
    expect(splits.get(member.user.id)).toMatchObject({
      amountMinor: 667,
      percentUnits: 66_666_667,
    });
  });

  it("rejects an exact split that does not reconcile with payer-derived total", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const before = await prisma.expense.count({ where: { groupId } });

    const response = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", owner.authHeader)
      .send({
        description: "Broken split",
        expenseDate: today(),
        payers: [{ userId: owner.user.id, amount: "10.00" }],
        split: {
          type: "EXACT",
          participants: [
            { userId: owner.user.id, amount: "4.00" },
            { userId: member.user.id, amount: "5.00" },
          ],
        },
      });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("INVALID_SPLIT");
    expect(await prisma.expense.count({ where: { groupId } })).toBe(before);
  });

  it("rejects a client total that differs from payer allocations", async () => {
    const { owner, groupId } = await createGroupWithMember();

    const response = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", owner.authHeader)
      .send({
        description: "Wrong total",
        expenseDate: today(),
        total: "11.00",
        payers: [{ userId: owner.user.id, amount: "10.00" }],
        split: {
          type: "EQUAL",
          participants: [owner.user.id],
        },
      });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("TOTAL_MISMATCH");
  });

  it("rejects payers or participants who are not active group members", async () => {
    const { owner, groupId } = await createGroupWithMember();
    const outsider = await createTestUser();

    const response = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", owner.authHeader)
      .send({
        description: "Outsider",
        expenseDate: today(),
        payers: [{ userId: owner.user.id, amount: "10.00" }],
        split: {
          type: "EQUAL",
          participants: [outsider.user.id],
        },
      });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("INVALID_MEMBER");
  });

  it("rejects creation by a non-member", async () => {
    const { owner, groupId } = await createGroupWithMember();
    const outsider = await createTestUser();

    const response = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", outsider.authHeader)
      .send({
        description: "Forbidden",
        expenseDate: today(),
        payers: [{ userId: owner.user.id, amount: "1.00" }],
        split: { type: "EQUAL", participants: [owner.user.id] },
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("rejects future dates and duplicate allocations before writing", async () => {
    const { owner, groupId } = await createGroupWithMember();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const future = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", owner.authHeader)
      .send({
        description: "Future",
        expenseDate: tomorrow,
        payers: [{ userId: owner.user.id, amount: "1.00" }],
        split: { type: "EQUAL", participants: [owner.user.id] },
      });
    expect(future.status).toBe(422);
    expect(future.body.code).toBe("FUTURE_DATE");

    const duplicate = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", owner.authHeader)
      .send({
        description: "Duplicate payer",
        expenseDate: today(),
        payers: [
          { userId: owner.user.id, amount: "0.50" },
          { userId: owner.user.id, amount: "0.50" },
        ],
        split: { type: "EQUAL", participants: [owner.user.id] },
      });
    expect(duplicate.status).toBe(400);
  });

  it("rejects expenses for archived groups", async () => {
    const { owner, groupId } = await createGroupWithMember();
    await request(app)
      .delete(`/api/groups/${groupId}`)
      .set("Authorization", owner.authHeader);

    const response = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", owner.authHeader)
      .send({
        description: "Archived",
        expenseDate: today(),
        payers: [{ userId: owner.user.id, amount: "1.00" }],
        split: { type: "EQUAL", participants: [owner.user.id] },
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("GROUP_ARCHIVED");
  });

  it("lists expenses with cursor pagination and fetches one expense", async () => {
    const { owner, groupId } = await createGroupWithMember();
    const first = await createSimpleExpense(
      groupId,
      owner.authHeader,
      owner.user.id,
      "First",
    );
    const second = await createSimpleExpense(
      groupId,
      owner.authHeader,
      owner.user.id,
      "Second",
    );

    const pageOne = await request(app)
      .get(`/api/groups/${groupId}/expenses?limit=1`)
      .set("Authorization", owner.authHeader);
    expect(pageOne.status).toBe(200);
    expect(pageOne.body.data).toHaveLength(1);
    expect(pageOne.body.pagination.nextCursor).toBeTypeOf("string");

    const pageTwo = await request(app)
      .get(
        `/api/groups/${groupId}/expenses?limit=1&cursor=${pageOne.body.pagination.nextCursor}`,
      )
      .set("Authorization", owner.authHeader);
    expect(pageTwo.status).toBe(200);
    expect(pageTwo.body.data).toHaveLength(1);
    expect(pageTwo.body.data[0].id).not.toBe(pageOne.body.data[0].id);
    expect(new Set([first.body.data.id, second.body.data.id])).toEqual(
      new Set([pageOne.body.data[0].id, pageTwo.body.data[0].id]),
    );

    const details = await request(app)
      .get(`/api/groups/${groupId}/expenses/${first.body.data.id}`)
      .set("Authorization", owner.authHeader);
    expect(details.status).toBe(200);
    expect(details.body.data.description).toBe("First");
    expect(details.body.data.totalMinor).toBe(1000);
  });

  it("updates an expense atomically and appends a new revision", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const created = await createSimpleExpense(
      groupId,
      owner.authHeader,
      owner.user.id,
    );
    const expenseId = created.body.data.id as string;

    const updated = await request(app)
      .patch(`/api/groups/${groupId}/expenses/${expenseId}`)
      .set("Authorization", member.authHeader)
      .send({
        version: 1,
        description: "Updated expense",
        category: "TRAVEL",
        expenseDate: today(),
        total: "12.00",
        payers: [
          { userId: owner.user.id, amount: "8.00" },
          { userId: member.user.id, amount: "4.00" },
        ],
        split: {
          type: "EXACT",
          participants: [
            { userId: owner.user.id, amount: "5.00" },
            { userId: member.user.id, amount: "7.00" },
          ],
        },
      });

    expect(updated.status).toBe(200);
    expect(updated.body.data.version).toBe(2);
    expect(updated.body.data.totalMinor).toBe(1200);
    expect(updated.body.data.payers).toHaveLength(2);
    expect(updated.body.data.splits).toHaveLength(2);

    const stored = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { payers: true, splits: true, revisions: true },
    });
    expect(stored?.version).toBe(2);
    expect(stored?.payers).toHaveLength(2);
    expect(stored?.splits).toHaveLength(2);
    expect(stored?.revisions.map((revision) => revision.revision).sort()).toEqual([
      1, 2,
    ]);

    const revisions = await request(app)
      .get(`/api/groups/${groupId}/expenses/${expenseId}/revisions`)
      .set("Authorization", owner.authHeader);
    expect(revisions.status).toBe(200);
    expect(revisions.body.data.map((revision: { revision: number }) => revision.revision)).toEqual([
      2, 1,
    ]);
  });

  it("rejects stale edits and returns the current version", async () => {
    const { owner, groupId } = await createGroupWithMember();
    const created = await createSimpleExpense(
      groupId,
      owner.authHeader,
      owner.user.id,
    );
    const expenseId = created.body.data.id as string;
    const updateBody = {
      version: 1,
      description: "First update",
      expenseDate: today(),
      payers: [{ userId: owner.user.id, amount: "10.00" }],
      split: { type: "EQUAL", participants: [owner.user.id] },
    };

    const first = await request(app)
      .patch(`/api/groups/${groupId}/expenses/${expenseId}`)
      .set("Authorization", owner.authHeader)
      .send(updateBody);
    expect(first.status).toBe(200);

    const stale = await request(app)
      .patch(`/api/groups/${groupId}/expenses/${expenseId}`)
      .set("Authorization", owner.authHeader)
      .send({ ...updateBody, description: "Stale update" });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("VERSION_CONFLICT");
    expect(stale.body.details.currentVersion).toBe(2);
  });

  it("allows exactly one of two concurrent edits with the same version", async () => {
    const { owner, groupId } = await createGroupWithMember();
    const created = await createSimpleExpense(
      groupId,
      owner.authHeader,
      owner.user.id,
    );
    const expenseId = created.body.data.id as string;
    const updateBody = (description: string) => ({
      version: 1,
      description,
      expenseDate: today(),
      payers: [{ userId: owner.user.id, amount: "10.00" }],
      split: { type: "EQUAL", participants: [owner.user.id] },
    });

    const [left, right] = await Promise.all([
      request(app)
        .patch(`/api/groups/${groupId}/expenses/${expenseId}`)
        .set("Authorization", owner.authHeader)
        .send(updateBody("Concurrent left")),
      request(app)
        .patch(`/api/groups/${groupId}/expenses/${expenseId}`)
        .set("Authorization", owner.authHeader)
        .send(updateBody("Concurrent right")),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 409]);
    const stored = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { revisions: true },
    });
    expect(stored?.version).toBe(2);
    expect(stored?.revisions).toHaveLength(2);
  });

  it("allows a former participant to remain during an edit", async () => {
    const { owner, member, groupId } = await createGroupWithMember();
    const created = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set("Authorization", owner.authHeader)
      .send({
        description: "Before leaving",
        expenseDate: today(),
        payers: [{ userId: owner.user.id, amount: "10.00" }],
        split: {
          type: "EQUAL",
          participants: [owner.user.id, member.user.id],
        },
      });

    await request(app)
      .delete(`/api/groups/${groupId}/members/${member.user.id}`)
      .set("Authorization", member.authHeader);

    const updated = await request(app)
      .patch(`/api/groups/${groupId}/expenses/${created.body.data.id}`)
      .set("Authorization", owner.authHeader)
      .send({
        version: 1,
        description: "After leaving",
        expenseDate: today(),
        payers: [{ userId: owner.user.id, amount: "10.00" }],
        split: {
          type: "EQUAL",
          participants: [owner.user.id, member.user.id],
        },
      });

    expect(updated.status).toBe(200);
    expect(updated.body.data.splits).toHaveLength(2);
  });

  it("tombstones an expense and keeps its revision history", async () => {
    const { owner, groupId } = await createGroupWithMember();
    const created = await createSimpleExpense(
      groupId,
      owner.authHeader,
      owner.user.id,
    );
    const expenseId = created.body.data.id as string;

    const deleted = await request(app)
      .delete(`/api/groups/${groupId}/expenses/${expenseId}`)
      .set("Authorization", owner.authHeader)
      .send({ version: 1 });
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.version).toBe(2);

    const details = await request(app)
      .get(`/api/groups/${groupId}/expenses/${expenseId}`)
      .set("Authorization", owner.authHeader);
    expect(details.status).toBe(404);

    const list = await request(app)
      .get(`/api/groups/${groupId}/expenses`)
      .set("Authorization", owner.authHeader);
    expect(
      list.body.data.some((expense: { id: string }) => expense.id === expenseId),
    ).toBe(false);

    const revisions = await request(app)
      .get(`/api/groups/${groupId}/expenses/${expenseId}/revisions`)
      .set("Authorization", owner.authHeader);
    expect(revisions.status).toBe(200);
    expect(revisions.body.data.map((revision: { revision: number }) => revision.revision)).toEqual([
      2, 1,
    ]);

    const stored = await prisma.expense.findUnique({ where: { id: expenseId } });
    expect(stored?.deletedAt).not.toBeNull();
    expect(stored?.deletedById).toBe(owner.user.id);
  });

  it("keeps archived groups readable but rejects expense edits", async () => {
    const { owner, groupId } = await createGroupWithMember();
    const created = await createSimpleExpense(
      groupId,
      owner.authHeader,
      owner.user.id,
    );
    await request(app)
      .delete(`/api/groups/${groupId}`)
      .set("Authorization", owner.authHeader);

    const list = await request(app)
      .get(`/api/groups/${groupId}/expenses`)
      .set("Authorization", owner.authHeader);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const update = await request(app)
      .patch(`/api/groups/${groupId}/expenses/${created.body.data.id}`)
      .set("Authorization", owner.authHeader)
      .send({
        version: 1,
        description: "Cannot update",
        expenseDate: today(),
        payers: [{ userId: owner.user.id, amount: "10.00" }],
        split: { type: "EQUAL", participants: [owner.user.id] },
      });
    expect(update.status).toBe(409);
    expect(update.body.code).toBe("GROUP_ARCHIVED");
  });
});
