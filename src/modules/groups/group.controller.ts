import type { RequestHandler } from "express";
import { createGroupSchema } from "./group.schema.js";
import {
  createGroup,
  GroupServiceError,
  listMyGroups,
} from "./group.service.js";

export const createGroupController: RequestHandler = async (req, res, next) => {
  try {
    const userId = req.auth?.userId;

    // Defensive check. The route also uses authenticate.
    if (!userId) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    const result = createGroupSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues,
      });
      return;
    }

    const group = await createGroup(result.data, userId);

    res.status(201).json({
      message: "Group created successfully",
      data: group,
    });
  } catch (error) {
    if (error instanceof GroupServiceError) {
      const status = error.code === "USER_INACTIVE" ? 403 : 401;

      res.status(status).json({
        message: error.message,
      });
      return;
    }

    next(error);
  }
};

export const listMyGroupsController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const userId = req.auth?.userId;

    if (!userId) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    const groups = await listMyGroups(userId);

    res.status(200).json({
      message: "Groups fetched successfully",
      data: groups,
    });
  } catch (error) {
    next(error);
  }
};
