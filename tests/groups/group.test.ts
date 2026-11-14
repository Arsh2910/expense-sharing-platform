import request from "supertest";
import { describe, it, expect, afterAll } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createTestUser } from "../helpers.js";

describe("Group Management APIs", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("POST /api/groups - Create Group", () => {
    it("should allow an authenticated user to create a group and become OWNER atomically", async () => {
      const user = await createTestUser();

      const res = await request(app)
        .post("/api/groups")
        .set("Authorization", user.authHeader)
        .send({
          name: "Trip to Goa",
          currency: "INR",
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe("Group created successfully");
      expect(res.body.data).toBeDefined();
      expect(res.body.data.name).toBe("Trip to Goa");
      expect(res.body.data.currency).toBe("INR");
      expect(res.body.data.memberships).toHaveLength(1);
      expect(res.body.data.memberships[0].role).toBe("OWNER");
      expect(res.body.data.memberships[0].user.id).toBe(user.user.id);

      // Verify in database
      const dbGroup = await prisma.group.findUnique({
        where: { id: res.body.data.id },
        include: { memberships: true },
      });
      expect(dbGroup).not.toBeNull();
      expect(dbGroup?.memberships).toHaveLength(1);
      expect(dbGroup?.memberships[0].role).toBe("OWNER");
      expect(dbGroup?.memberships[0].userId).toBe(user.user.id);
    });

    it("should reject creation with 400 when currency is invalid (lowercase, numbers, length)", async () => {
      const user = await createTestUser();

      const res1 = await request(app)
        .post("/api/groups")
        .set("Authorization", user.authHeader)
        .send({ name: "Invalid Currency Group", currency: "inr" });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post("/api/groups")
        .set("Authorization", user.authHeader)
        .send({ name: "Invalid Currency Group", currency: "US1" });
      expect(res2.status).toBe(400);

      const res3 = await request(app)
        .post("/api/groups")
        .set("Authorization", user.authHeader)
        .send({ name: "Invalid Currency Group", currency: "USDT" });
      expect(res3.status).toBe(400);

      const res4 = await request(app)
        .post("/api/groups")
        .set("Authorization", user.authHeader)
        .send({ name: "Unsupported Currency Group", currency: "XYZ" });
      expect(res4.status).toBe(400);
    });

    it("should reject creation with 400 when name is empty, whitespace, or exceeds 100 chars", async () => {
      const user = await createTestUser();

      const resEmpty = await request(app)
        .post("/api/groups")
        .set("Authorization", user.authHeader)
        .send({ name: "   ", currency: "USD" });
      expect(resEmpty.status).toBe(400);

      const resLong = await request(app)
        .post("/api/groups")
        .set("Authorization", user.authHeader)
        .send({ name: "A".repeat(101), currency: "USD" });
      expect(resLong.status).toBe(400);
    });

    it("should reject creation with 401 when unauthenticated", async () => {
      const res = await request(app)
        .post("/api/groups")
        .send({ name: "Unauth Group", currency: "EUR" });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/groups - List My Groups", () => {
    it("should return groups where the user is an active member, excluding archived and left groups", async () => {
      const user = await createTestUser();
      const otherUser = await createTestUser();

      // Create active group 1
      const g1 = await request(app)
        .post("/api/groups")
        .set("Authorization", user.authHeader)
        .send({ name: "Active Group 1", currency: "USD" });

      // Create active group 2
      const g2 = await request(app)
        .post("/api/groups")
        .set("Authorization", user.authHeader)
        .send({ name: "Active Group 2", currency: "EUR" });

      // Create group 3 which user leaves
      const g3 = await request(app)
        .post("/api/groups")
        .set("Authorization", otherUser.authHeader)
        .send({ name: "Other User Group", currency: "GBP" });

      // Add user to g3
      await request(app)
        .post(`/api/groups/${g3.body.data.id}/members`)
        .set("Authorization", otherUser.authHeader)
        .send({ email: user.user.email });

      // User leaves g3
      await request(app)
        .delete(`/api/groups/${g3.body.data.id}/members/${user.user.id}`)
        .set("Authorization", user.authHeader);

      // Archive group 2
      await request(app)
        .delete(`/api/groups/${g2.body.data.id}`)
        .set("Authorization", user.authHeader);

      const res = await request(app)
        .get("/api/groups")
        .set("Authorization", user.authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const groupIds = res.body.data.map((g: any) => g.id);
      expect(groupIds).toContain(g1.body.data.id);
      expect(groupIds).not.toContain(g2.body.data.id); // Archived excluded
      expect(groupIds).not.toContain(g3.body.data.id); // Left group excluded
    });
  });

  describe("GET /api/groups/:groupId - Group Details", () => {
    it("should return group details with memberCount and myRole for active members", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Details Test Group", currency: "USD" });
      const groupId = groupRes.body.data.id;

      // Add member
      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      // Query as owner
      const ownerRes = await request(app)
        .get(`/api/groups/${groupId}`)
        .set("Authorization", owner.authHeader);

      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body.data.id).toBe(groupId);
      expect(ownerRes.body.data.name).toBe("Details Test Group");
      expect(ownerRes.body.data.currency).toBe("USD");
      expect(ownerRes.body.data.memberCount).toBe(2);
      expect(ownerRes.body.data.myRole).toBe("OWNER");

      // Query as member
      const memberRes = await request(app)
        .get(`/api/groups/${groupId}`)
        .set("Authorization", member.authHeader);

      expect(memberRes.status).toBe(200);
      expect(memberRes.body.data.memberCount).toBe(2);
      expect(memberRes.body.data.myRole).toBe("MEMBER");
    });

    it("should reject non-members with 403 Forbidden", async () => {
      const owner = await createTestUser();
      const nonMember = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Private Group", currency: "USD" });

      const res = await request(app)
        .get(`/api/groups/${groupRes.body.data.id}`)
        .set("Authorization", nonMember.authHeader);

      expect(res.status).toBe(403);
    });

    it("should reject former member who left with 403 Forbidden", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Left Member Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      await request(app)
        .delete(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", member.authHeader);

      const res = await request(app)
        .get(`/api/groups/${groupId}`)
        .set("Authorization", member.authHeader);

      expect(res.status).toBe(403);
    });

    it("should return 404 for non-existent group ID", async () => {
      const user = await createTestUser();
      const fakeId = "00000000-0000-4000-8000-000000000000";

      const res = await request(app)
        .get(`/api/groups/${fakeId}`)
        .set("Authorization", user.authHeader);

      expect(res.status).toBe(404);
    });

    it("should return 400 for invalid UUID in groupId parameter", async () => {
      const user = await createTestUser();

      const res = await request(app)
        .get("/api/groups/not-a-valid-uuid")
        .set("Authorization", user.authHeader);

      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/groups/:groupId - Update Group Settings", () => {
    it("should allow OWNER and ADMIN to update group name", async () => {
      const owner = await createTestUser();
      const admin = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Original Name", currency: "USD" });
      const groupId = groupRes.body.data.id;

      // Add admin user and promote to ADMIN
      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: admin.user.email });

      await request(app)
        .patch(`/api/groups/${groupId}/members/${admin.user.id}`)
        .set("Authorization", owner.authHeader)
        .send({ role: "ADMIN" });

      // Owner renames
      const update1 = await request(app)
        .patch(`/api/groups/${groupId}`)
        .set("Authorization", owner.authHeader)
        .send({ name: "Owner Renamed" });

      expect(update1.status).toBe(200);
      expect(update1.body.data.name).toBe("Owner Renamed");

      // Admin renames
      const update2 = await request(app)
        .patch(`/api/groups/${groupId}`)
        .set("Authorization", admin.authHeader)
        .send({ name: "Admin Renamed" });

      expect(update2.status).toBe(200);
      expect(update2.body.data.name).toBe("Admin Renamed");
    });

    it("should preserve currency immutability even if currency is passed in PATCH body", async () => {
      const owner = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Currency Immutability", currency: "USD" });
      const groupId = groupRes.body.data.id;

      const res = await request(app)
        .patch(`/api/groups/${groupId}`)
        .set("Authorization", owner.authHeader)
        .send({ name: "New Name", currency: "EUR" });

      expect(res.status).toBe(200);
      expect(res.body.data.currency).toBe("USD"); // Preserved!
    });

    it("should reject regular MEMBER from updating group with 403 Forbidden", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Member Update Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      const res = await request(app)
        .patch(`/api/groups/${groupId}`)
        .set("Authorization", member.authHeader)
        .send({ name: "Member Trying to Rename" });

      expect(res.status).toBe(403);
    });

    it("should reject updating an archived group with 409 Conflict", async () => {
      const owner = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "To Archive", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .delete(`/api/groups/${groupId}`)
        .set("Authorization", owner.authHeader);

      const res = await request(app)
        .patch(`/api/groups/${groupId}`)
        .set("Authorization", owner.authHeader)
        .send({ name: "Renaming Archived" });

      expect(res.status).toBe(409);
    });
  });

  describe("DELETE /api/groups/:groupId - Archive Group", () => {
    it("should allow OWNER to archive a group", async () => {
      const owner = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Group to Archive", currency: "USD" });
      const groupId = groupRes.body.data.id;

      const res = await request(app)
        .delete(`/api/groups/${groupId}`)
        .set("Authorization", owner.authHeader);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Group archived successfully");
      expect(res.body.data.archivedAt).not.toBeNull();

      // Subsequent archive attempt should fail with 409
      const retryRes = await request(app)
        .delete(`/api/groups/${groupId}`)
        .set("Authorization", owner.authHeader);

      expect(retryRes.status).toBe(409);
    });

    it("should reject ADMIN or MEMBER from archiving group with 403", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Cannot Archive by Member", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      const res = await request(app)
        .delete(`/api/groups/${groupId}`)
        .set("Authorization", member.authHeader);

      expect(res.status).toBe(403);
    });
  });

  describe("POST & GET /api/groups/:groupId/members - Member Management", () => {
    it("should allow OWNER and ADMIN to add active members", async () => {
      const owner = await createTestUser();
      const admin = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Member Add Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      // Owner adds admin
      const addAdminRes = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: admin.user.email });

      expect(addAdminRes.status).toBe(201);
      expect(addAdminRes.body.data.role).toBe("MEMBER");

      // Promote to ADMIN
      await request(app)
        .patch(`/api/groups/${groupId}/members/${admin.user.id}`)
        .set("Authorization", owner.authHeader)
        .send({ role: "ADMIN" });

      // Admin adds member
      const addMemberRes = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", admin.authHeader)
        .send({ email: member.user.email });

      expect(addMemberRes.status).toBe(201);

      // List members
      const listRes = await request(app)
        .get(`/api/groups/${groupId}/members`)
        .set("Authorization", member.authHeader);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(3);
    });

    it("should reject adding member to an archived group with 409 Conflict", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Archived Group Add", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .delete(`/api/groups/${groupId}`)
        .set("Authorization", owner.authHeader);

      const res = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      expect(res.status).toBe(409);
    });

    it("should reject adding inactive user with 403 USER_INACTIVE", async () => {
      const owner = await createTestUser();
      const inactiveUser = await createTestUser({ status: "DEACTIVATED" });

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Inactive Member Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      const res = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: inactiveUser.user.email });

      expect(res.status).toBe(403);
    });

    it("should reject adding non-existent user with 404 USER_NOT_FOUND", async () => {
      const owner = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Non-existent User Add", currency: "USD" });
      const groupId = groupRes.body.data.id;

      const res = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: "doesnotexist@example.com" });

      expect(res.status).toBe(404);
    });

    it("should reject duplicate active member addition with 409", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Duplicate Member Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      const duplicateRes = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      expect(duplicateRes.status).toBe(409);
    });

    it("should allow re-adding a member who previously left without violating one_active_membership", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Re-add Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      // Add member
      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      // Member leaves
      await request(app)
        .delete(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", member.authHeader);

      // Re-add member
      const reAddRes = await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      expect(reAddRes.status).toBe(201);
      expect(reAddRes.body.data.role).toBe("MEMBER");

      // Verify there are 2 membership records for this user (1 historical with leftAt, 1 active with leftAt null)
      const userMemberships = await prisma.groupMembership.findMany({
        where: { groupId, userId: member.user.id },
      });
      expect(userMemberships).toHaveLength(2);
      expect(userMemberships.filter((m) => m.leftAt === null)).toHaveLength(1);
    });
  });

  describe("DELETE /api/groups/:groupId/members/:targetUserId - Member Removal & Self-Leave", () => {
    it("should allow a regular member to voluntarily leave the group (self-leave)", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Self Leave Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      const leaveRes = await request(app)
        .delete(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", member.authHeader);

      expect(leaveRes.status).toBe(200);
      expect(leaveRes.body.data.removedUserId).toBe(member.user.id);
      expect(leaveRes.body.data.leftAt).toBeDefined();

      // Member should now be excluded from group members
      const membersRes = await request(app)
        .get(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader);

      expect(membersRes.body.data).toHaveLength(1);
    });

    it("should allow ADMIN to remove MEMBER, but not another ADMIN or OWNER", async () => {
      const owner = await createTestUser();
      const admin1 = await createTestUser();
      const admin2 = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Hierarchy Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      // Add all
      for (const u of [admin1, admin2, member]) {
        await request(app)
          .post(`/api/groups/${groupId}/members`)
          .set("Authorization", owner.authHeader)
          .send({ email: u.user.email });
      }

      // Promote admin1 and admin2
      await request(app)
        .patch(`/api/groups/${groupId}/members/${admin1.user.id}`)
        .set("Authorization", owner.authHeader)
        .send({ role: "ADMIN" });

      await request(app)
        .patch(`/api/groups/${groupId}/members/${admin2.user.id}`)
        .set("Authorization", owner.authHeader)
        .send({ role: "ADMIN" });

      // Admin1 cannot remove Owner (403)
      const tryRemoveOwner = await request(app)
        .delete(`/api/groups/${groupId}/members/${owner.user.id}`)
        .set("Authorization", admin1.authHeader);
      expect(tryRemoveOwner.status).toBe(403);

      // Admin1 cannot remove Admin2 (403)
      const tryRemoveAdmin = await request(app)
        .delete(`/api/groups/${groupId}/members/${admin2.user.id}`)
        .set("Authorization", admin1.authHeader);
      expect(tryRemoveAdmin.status).toBe(403);

      // Admin1 CAN remove Member (200)
      const removeMemberRes = await request(app)
        .delete(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", admin1.authHeader);
      expect(removeMemberRes.status).toBe(200);
    });

    it("should prevent removing the sole owner with 409 Conflict", async () => {
      const owner = await createTestUser();
      const admin = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Sole Owner Removal Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: admin.user.email });

      // Promote to OWNER so 2 owners exist
      await request(app)
        .patch(`/api/groups/${groupId}/members/${admin.user.id}`)
        .set("Authorization", owner.authHeader)
        .send({ role: "OWNER" });

      // Now 2 owners exist: owner removes admin (200)
      const removeSecondOwner = await request(app)
        .delete(`/api/groups/${groupId}/members/${admin.user.id}`)
        .set("Authorization", owner.authHeader);
      expect(removeSecondOwner.status).toBe(200);
    });

    it("should promote successor when sole owner leaves and other active members exist", async () => {
      const owner = await createTestUser();
      const member1 = await createTestUser();
      const member2 = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Successor Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      // Add member1 first
      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member1.user.email });

      // Add member2 second
      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member2.user.email });

      // Owner leaves
      const leaveRes = await request(app)
        .delete(`/api/groups/${groupId}/members/${owner.user.id}`)
        .set("Authorization", owner.authHeader);

      expect(leaveRes.status).toBe(200);
      expect(leaveRes.body.data.groupArchived).toBe(false);
      expect(leaveRes.body.data.successorUserId).toBe(member1.user.id);

      // Verify member1 is now OWNER
      const details = await request(app)
        .get(`/api/groups/${groupId}`)
        .set("Authorization", member1.authHeader);

      expect(details.body.data.myRole).toBe("OWNER");
    });

    it("should archive group when sole owner leaves and no other active members exist", async () => {
      const owner = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Empty Group Archival Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      // Sole owner leaves
      const leaveRes = await request(app)
        .delete(`/api/groups/${groupId}/members/${owner.user.id}`)
        .set("Authorization", owner.authHeader);

      expect(leaveRes.status).toBe(200);
      expect(leaveRes.body.data.groupArchived).toBe(true);

      // Verify in DB that group is archived
      const dbGroup = await prisma.group.findUnique({ where: { id: groupId } });
      expect(dbGroup?.archivedAt).not.toBeNull();
    });

    it("should reject removing a member who already left with 409 Conflict", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Already Left Removal Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      // First removal succeeds
      await request(app)
        .delete(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", owner.authHeader);

      // Second removal returns 409
      const retryRes = await request(app)
        .delete(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", owner.authHeader);

      expect(retryRes.status).toBe(409);
    });

    it("should reject removing a user not in the group with 404", async () => {
      const owner = await createTestUser();
      const outsider = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Outsider Removal Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      const res = await request(app)
        .delete(`/api/groups/${groupId}/members/${outsider.user.id}`)
        .set("Authorization", owner.authHeader);

      expect(res.status).toBe(404);
    });

    it("should reject removing members from an archived group with 409 Conflict", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Archived Group Removal Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      await request(app)
        .delete(`/api/groups/${groupId}`)
        .set("Authorization", owner.authHeader);

      const res = await request(app)
        .delete(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", owner.authHeader);

      expect(res.status).toBe(409);
    });
  });

  describe("PATCH /api/groups/:groupId/members/:targetUserId - Role Updates", () => {
    it("should allow OWNER to promote MEMBER to ADMIN, and then to OWNER (multiple owners permitted)", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Multi Owner Role Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      // Promote to ADMIN
      const promoteAdmin = await request(app)
        .patch(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", owner.authHeader)
        .send({ role: "ADMIN" });

      expect(promoteAdmin.status).toBe(200);
      expect(promoteAdmin.body.data.role).toBe("ADMIN");

      // Promote to OWNER (this tests that dropping the partial unique index allows multiple active owners)
      const promoteOwner = await request(app)
        .patch(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", owner.authHeader)
        .send({ role: "OWNER" });

      expect(promoteOwner.status).toBe(200);
      expect(promoteOwner.body.data.role).toBe("OWNER");

      // Verify 2 active owners exist in DB
      const owners = await prisma.groupMembership.findMany({
        where: { groupId, role: "OWNER", leftAt: null },
      });
      expect(owners).toHaveLength(2);

      // Now demote one owner back to ADMIN (allowed because another owner exists)
      const demoteRes = await request(app)
        .patch(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", owner.authHeader)
        .send({ role: "ADMIN" });

      expect(demoteRes.status).toBe(200);
      expect(demoteRes.body.data.role).toBe("ADMIN");
    });

    it("should reject demoting the sole owner with 409 Conflict", async () => {
      const owner = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Sole Demotion Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      const demoteRes = await request(app)
        .patch(`/api/groups/${groupId}/members/${owner.user.id}`)
        .set("Authorization", owner.authHeader)
        .send({ role: "ADMIN" });

      expect(demoteRes.status).toBe(409);
    });

    it("should reject role update with 403 when called by non-OWNER", async () => {
      const owner = await createTestUser();
      const admin = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Non Owner Role Change Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: admin.user.email });

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      await request(app)
        .patch(`/api/groups/${groupId}/members/${admin.user.id}`)
        .set("Authorization", owner.authHeader)
        .send({ role: "ADMIN" });

      // Admin tries to promote member
      const adminTry = await request(app)
        .patch(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", admin.authHeader)
        .send({ role: "ADMIN" });

      expect(adminTry.status).toBe(403);
    });

    it("should reject role update in an archived group with 409 Conflict", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Archived Role Update Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      await request(app)
        .delete(`/api/groups/${groupId}`)
        .set("Authorization", owner.authHeader);

      const res = await request(app)
        .patch(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", owner.authHeader)
        .send({ role: "ADMIN" });

      expect(res.status).toBe(409);
    });

    it("should reject invalid role string with 400 Bad Request", async () => {
      const owner = await createTestUser();
      const member = await createTestUser();

      const groupRes = await request(app)
        .post("/api/groups")
        .set("Authorization", owner.authHeader)
        .send({ name: "Invalid Role Test", currency: "USD" });
      const groupId = groupRes.body.data.id;

      await request(app)
        .post(`/api/groups/${groupId}/members`)
        .set("Authorization", owner.authHeader)
        .send({ email: member.user.email });

      const res = await request(app)
        .patch(`/api/groups/${groupId}/members/${member.user.id}`)
        .set("Authorization", owner.authHeader)
        .send({ role: "SUPERUSER" });

      expect(res.status).toBe(400);
    });
  });
});
