import { Router } from "express";
import { authenticate } from "../auth/auth.middleware.js";
import {
  addGroupMemberController,
  createGroupController,
  listGroupMembersController,
  listMyGroupsController,
} from "./group.controller.js";

const router = Router();

router.post("/", authenticate, createGroupController);
router.get("/", authenticate, listMyGroupsController);
router.post("/:groupId/members", authenticate, addGroupMemberController);
router.get("/:groupId/members", authenticate, listGroupMembersController);
export default router;
