import { Router } from "express";
import { requestLimits } from "../../middleware/rate-limit.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";
import {
  createExpenseController,
  deleteExpenseController,
  getExpenseController,
  listExpenseRevisionsController,
  listExpensesController,
  updateExpenseController,
} from "./expense.controller.js";

const router = Router({ mergeParams: true });

router.post("/", authenticate, requestLimits.createExpense, createExpenseController);
router.get("/", authenticate, listExpensesController);
router.get("/:expenseId", authenticate, getExpenseController);
router.get(
  "/:expenseId/revisions",
  authenticate,
  listExpenseRevisionsController,
);
router.patch("/:expenseId", authenticate, updateExpenseController);
router.delete("/:expenseId", authenticate, deleteExpenseController);

export default router;
