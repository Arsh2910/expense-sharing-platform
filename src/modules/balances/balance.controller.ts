import type { RequestHandler } from "express";
import { groupParamsSchema } from "../groups/group.schema.js";
import {
  BalanceServiceError,
  getGroupBalances,
} from "./balance.service.js";

const statusByCode: Record<BalanceServiceError["code"], number> = {
  GROUP_NOT_FOUND: 404,
  FORBIDDEN: 403,
};

export const getGroupBalancesController: RequestHandler<{
  groupId: string;
}> = async (req, res, next) => {
  try {
    const actorUserId = req.auth?.userId;
    if (!actorUserId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const params = groupParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: params.error.issues,
      });
      return;
    }

    const balances = await getGroupBalances(
      params.data.groupId,
      actorUserId,
    );
    res.status(200).json({
      message: "Group balances fetched successfully",
      data: balances,
    });
  } catch (error) {
    if (error instanceof BalanceServiceError) {
      res.status(statusByCode[error.code]).json({
        message: error.message,
        code: error.code,
      });
      return;
    }
    next(error);
  }
};
