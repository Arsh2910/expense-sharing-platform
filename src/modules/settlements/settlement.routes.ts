import { Router } from "express";
import { authenticate } from "../auth/auth.middleware.js";
import {
  createSettlementController,
  listSettlementsController,
  reverseSettlementController,
} from "./settlement.controller.js";

const router = Router({ mergeParams: true });

router.post("/", authenticate, createSettlementController);
router.get("/", authenticate, listSettlementsController);
router.post(
  "/:settlementId/reverse",
  authenticate,
  reverseSettlementController,
);

export default router;
