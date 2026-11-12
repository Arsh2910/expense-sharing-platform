import { Router } from "express";
import { authenticate } from "../auth/auth.middleware.js";
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

const router = Router();

router.post("/", authenticate, createGroupController);
router.get("/", authenticate, listMyGroupsController);
router.get("/:groupId", authenticate, getGroupDetailsController);
router.patch("/:groupId", authenticate, updateGroupController);
router.delete("/:groupId", authenticate, archiveGroupController);
router.post("/:groupId/members", authenticate, addGroupMemberController);
router.get("/:groupId/members", authenticate, listGroupMembersController);
router.delete("/:groupId/members/:targetUserId", authenticate, removeGroupMemberController);
router.patch("/:groupId/members/:targetUserId", authenticate, updateMemberRoleController);

export default router;
