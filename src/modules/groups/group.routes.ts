import { Router } from "express";
import { authenticate } from "../auth/auth.middleware.js";
import { getGroupBalancesController } from "../balances/balance.controller.js";
import expenseRoutes from "../expenses/expense.routes.js";
import settlementRoutes from "../settlements/settlement.routes.js";
import {
  addGroupMemberController,
  archiveGroupController,
  createGroupController,
  getGroupDetailsController,
  listGroupMembersController,
  listMyGroupsController,
  removeGroupMemberController,
  updateGroupController,
  updateMemberRoleController,
} from "./group.controller.js";
import { createInvitationController, listGroupInvitationsController, resendInvitationController, revokeInvitationController } from "../invitations/invitation.controller.js";

const router = Router();

router.post("/", authenticate, createGroupController);
router.get("/", authenticate, listMyGroupsController);
router.use("/:groupId/expenses", expenseRoutes);
router.get("/:groupId/balances", authenticate, getGroupBalancesController);
router.use("/:groupId/settlements", settlementRoutes);
router.get("/:groupId", authenticate, getGroupDetailsController);
router.patch("/:groupId", authenticate, updateGroupController);
router.delete("/:groupId", authenticate, archiveGroupController);
router.post("/:groupId/members", authenticate, addGroupMemberController);
router.post("/:groupId/invitations", authenticate, createInvitationController);
router.get("/:groupId/invitations", authenticate, listGroupInvitationsController);
router.post("/:groupId/invitations/:invitationId/resend", authenticate, resendInvitationController);
router.post("/:groupId/invitations/:invitationId/revoke", authenticate, revokeInvitationController);
router.get("/:groupId/members", authenticate, listGroupMembersController);
router.delete("/:groupId/members/:targetUserId", authenticate, removeGroupMemberController);
router.patch("/:groupId/members/:targetUserId", authenticate, updateMemberRoleController);

export default router;
