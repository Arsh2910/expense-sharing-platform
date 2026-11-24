import type { RequestHandler } from "express";
import { z } from "zod";
import { groupParamsSchema } from "../groups/group.schema.js";
import { listGroupActivity } from "./activity.service.js";

const activityQuerySchema = z.object({ cursor: z.uuid().optional() });

const activityErrors = {
  GROUP_NOT_FOUND: { status: 404, message: "Group not found" },
  FORBIDDEN: { status: 403, message: "Only active group members can view group activity" },
  INVALID_CURSOR: { status: 400, message: "Invalid activity cursor" },
};

export const listGroupActivityController: RequestHandler = async (req, res) => {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const params = groupParamsSchema.safeParse(req.params);
  const query = activityQuerySchema.safeParse(req.query);
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

  const result = await listGroupActivity(params.data.groupId, userId, query.data.cursor);
  if (result.status !== "OK") {
    const error = activityErrors[result.status];
    res.status(error.status).json({ message: error.message, code: result.status });
    return;
  }

  res.json({ data: result.data, pagination: result.pagination });
};
