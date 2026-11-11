import { Router } from "express";
import { authenticate } from "../auth/auth.middleware.js";
import {
  createGroupController,
  listMyGroupsController,
} from "./group.controller.js";

const router = Router();

router.post("/", authenticate, createGroupController);
router.get("/", authenticate, listMyGroupsController);
export default router;
