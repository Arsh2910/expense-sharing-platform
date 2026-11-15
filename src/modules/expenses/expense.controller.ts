import type { RequestHandler, Response } from "express";
import {
  createExpenseSchema,
  deleteExpenseSchema,
  expenseGroupParamsSchema,
  expenseParamsSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from "./expense.schema.js";
import {
  createExpense,
  deleteExpense,
  ExpenseServiceError,
  getExpense,
  listExpenseRevisions,
  listExpenses,
  updateExpense,
} from "./expense.service.js";

const statusByCode: Record<ExpenseServiceError["code"], number> = {
  GROUP_NOT_FOUND: 404,
  GROUP_ARCHIVED: 409,
  EXPENSE_NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_MEMBER: 422,
  INVALID_AMOUNT: 422,
  TOTAL_MISMATCH: 422,
  INVALID_SPLIT: 422,
  FUTURE_DATE: 422,
  VERSION_CONFLICT: 409,
  INVALID_CURSOR: 400,
};

function handleExpenseError(error: ExpenseServiceError, res: Response) {
  res.status(statusByCode[error.code]).json({
    message: error.message,
    code: error.code,
    ...(error.details ? { details: error.details } : {}),
  });
}

function requireActorUserId(
  userId: string | undefined,
  res: Response,
): userId is string {
  if (userId) return true;
  res.status(401).json({ message: "Authentication required" });
  return false;
}

export const createExpenseController: RequestHandler<{
  groupId: string;
}> = async (req, res, next) => {
  try {
    const actorUserId = req.auth?.userId;
    if (!requireActorUserId(actorUserId, res)) return;

    const params = expenseGroupParamsSchema.safeParse(req.params);
    const body = createExpenseSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: [
          ...(params.success ? [] : params.error.issues),
          ...(body.success ? [] : body.error.issues),
        ],
      });
      return;
    }

    const expense = await createExpense(
      params.data.groupId,
      actorUserId,
      body.data,
    );
    res.status(201).json({
      message: "Expense created successfully",
      data: expense,
    });
  } catch (error) {
    if (error instanceof ExpenseServiceError) {
      handleExpenseError(error, res);
      return;
    }
    next(error);
  }
};

export const listExpensesController: RequestHandler<{
  groupId: string;
}> = async (req, res, next) => {
  try {
    const actorUserId = req.auth?.userId;
    if (!requireActorUserId(actorUserId, res)) return;

    const params = expenseGroupParamsSchema.safeParse(req.params);
    const query = listExpensesQuerySchema.safeParse(req.query);
    if (!params.success || !query.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: [
          ...(params.success ? [] : params.error.issues),
          ...(query.success ? [] : query.error.issues),
        ],
      });
      return;
    }

    const result = await listExpenses(
      params.data.groupId,
      actorUserId,
      query.data,
    );
    res.status(200).json({
      message: "Expenses fetched successfully",
      data: result.items,
      pagination: { nextCursor: result.nextCursor },
    });
  } catch (error) {
    if (error instanceof ExpenseServiceError) {
      handleExpenseError(error, res);
      return;
    }
    next(error);
  }
};

export const getExpenseController: RequestHandler<{
  groupId: string;
  expenseId: string;
}> = async (req, res, next) => {
  try {
    const actorUserId = req.auth?.userId;
    if (!requireActorUserId(actorUserId, res)) return;

    const params = expenseParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: params.error.issues,
      });
      return;
    }

    const expense = await getExpense(
      params.data.groupId,
      params.data.expenseId,
      actorUserId,
    );
    res.status(200).json({
      message: "Expense fetched successfully",
      data: expense,
    });
  } catch (error) {
    if (error instanceof ExpenseServiceError) {
      handleExpenseError(error, res);
      return;
    }
    next(error);
  }
};

export const listExpenseRevisionsController: RequestHandler<{
  groupId: string;
  expenseId: string;
}> = async (req, res, next) => {
  try {
    const actorUserId = req.auth?.userId;
    if (!requireActorUserId(actorUserId, res)) return;

    const params = expenseParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: params.error.issues,
      });
      return;
    }

    const revisions = await listExpenseRevisions(
      params.data.groupId,
      params.data.expenseId,
      actorUserId,
    );
    res.status(200).json({
      message: "Expense revisions fetched successfully",
      data: revisions,
    });
  } catch (error) {
    if (error instanceof ExpenseServiceError) {
      handleExpenseError(error, res);
      return;
    }
    next(error);
  }
};

export const updateExpenseController: RequestHandler<{
  groupId: string;
  expenseId: string;
}> = async (req, res, next) => {
  try {
    const actorUserId = req.auth?.userId;
    if (!requireActorUserId(actorUserId, res)) return;

    const params = expenseParamsSchema.safeParse(req.params);
    const body = updateExpenseSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: [
          ...(params.success ? [] : params.error.issues),
          ...(body.success ? [] : body.error.issues),
        ],
      });
      return;
    }

    const expense = await updateExpense(
      params.data.groupId,
      params.data.expenseId,
      actorUserId,
      body.data,
    );
    res.status(200).json({
      message: "Expense updated successfully",
      data: expense,
    });
  } catch (error) {
    if (error instanceof ExpenseServiceError) {
      handleExpenseError(error, res);
      return;
    }
    next(error);
  }
};

export const deleteExpenseController: RequestHandler<{
  groupId: string;
  expenseId: string;
}> = async (req, res, next) => {
  try {
    const actorUserId = req.auth?.userId;
    if (!requireActorUserId(actorUserId, res)) return;

    const params = expenseParamsSchema.safeParse(req.params);
    const body = deleteExpenseSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: [
          ...(params.success ? [] : params.error.issues),
          ...(body.success ? [] : body.error.issues),
        ],
      });
      return;
    }

    const result = await deleteExpense(
      params.data.groupId,
      params.data.expenseId,
      actorUserId,
      body.data.version,
    );
    res.status(200).json({
      message: "Expense deleted successfully",
      data: result,
    });
  } catch (error) {
    if (error instanceof ExpenseServiceError) {
      handleExpenseError(error, res);
      return;
    }
    next(error);
  }
};
