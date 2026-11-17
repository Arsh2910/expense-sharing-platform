import type { RequestHandler, Response } from "express";
import {
  createSettlementSchema,
  settlementGroupParamsSchema,
  settlementParamsSchema,
} from "./settlement.schema.js";
import {
  createSettlement,
  listSettlements,
  reverseSettlement,
  SettlementServiceError,
} from "./settlement.service.js";

const statusByCode: Record<SettlementServiceError["code"], number> = {
  GROUP_NOT_FOUND: 404,
  GROUP_ARCHIVED: 409,
  FORBIDDEN: 403,
  INVALID_MEMBER: 422,
  INVALID_AMOUNT: 422,
  SAME_USER: 422,
  FUTURE_DATE: 422,
  SETTLEMENT_NOT_FOUND: 404,
  ALREADY_REVERSED: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
};

function handleSettlementError(error: SettlementServiceError, res: Response) {
  res.status(statusByCode[error.code]).json({
    message: error.message,
    code: error.code,
  });
}

export const createSettlementController: RequestHandler<{
  groupId: string;
}> = async (req, res, next) => {
  try {
    const actorUserId = req.auth?.userId;
    if (!actorUserId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }
    const params = settlementGroupParamsSchema.safeParse(req.params);
    const body = createSettlementSchema.safeParse(req.body);
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
    const idempotencyKey = req.header("Idempotency-Key")?.trim();
    if (idempotencyKey && idempotencyKey.length > 255) {
      res.status(400).json({ message: "Idempotency-Key is too long" });
      return;
    }

    const settlement = await createSettlement(
      params.data.groupId,
      actorUserId,
      body.data,
      idempotencyKey,
    );
    res.status(201).json({
      message: "Settlement recorded successfully",
      data: settlement,
    });
  } catch (error) {
    if (error instanceof SettlementServiceError) {
      handleSettlementError(error, res);
      return;
    }
    next(error);
  }
};

export const listSettlementsController: RequestHandler<{
  groupId: string;
}> = async (req, res, next) => {
  try {
    const actorUserId = req.auth?.userId;
    if (!actorUserId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }
    const params = settlementGroupParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: params.error.issues,
      });
      return;
    }
    const settlements = await listSettlements(
      params.data.groupId,
      actorUserId,
    );
    res.status(200).json({
      message: "Settlements fetched successfully",
      data: settlements,
    });
  } catch (error) {
    if (error instanceof SettlementServiceError) {
      handleSettlementError(error, res);
      return;
    }
    next(error);
  }
};

export const reverseSettlementController: RequestHandler<{
  groupId: string;
  settlementId: string;
}> = async (req, res, next) => {
  try {
    const actorUserId = req.auth?.userId;
    if (!actorUserId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }
    const params = settlementParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: params.error.issues,
      });
      return;
    }

    const reversal = await reverseSettlement(
      params.data.groupId,
      params.data.settlementId,
      actorUserId,
    );
    res.status(201).json({
      message: "Settlement reversed successfully",
      data: reversal,
    });
  } catch (error) {
    if (error instanceof SettlementServiceError) {
      handleSettlementError(error, res);
      return;
    }
    next(error);
  }
};
