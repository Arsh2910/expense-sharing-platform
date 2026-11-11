import type { RequestHandler } from "express";
import {
  addGroupMemberSchema,
  createGroupSchema,
  groupParamsSchema,
} from "./group.schema.js";
import {
  addGroupMember,
  createGroup,
  GroupMembershipError,
  GroupServiceError,
  listGroupMembers,
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

function handleGroupMembershipError(
  error: GroupMembershipError,
  res: Parameters<RequestHandler>[1],
) {
  const statusByCode: Record<GroupMembershipError["code"], number> = {
    GROUP_NOT_FOUND: 404,
    GROUP_ARCHIVED: 409,
    FORBIDDEN: 403,
    USER_NOT_FOUND: 404,
    USER_INACTIVE: 403,
    ALREADY_MEMBER: 409,
  };

  res.status(statusByCode[error.code]).json({
    message: error.message,
  });
}

export const addGroupMemberController: RequestHandler<{
  groupId: string;
}> = async (
  req,
  res,
  next,
) => {
  try {
    const actorUserId = req.auth?.userId;

    if (!actorUserId) {
      res.status(401).json({
        message: "Authentication required",
      });
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

    const result = addGroupMemberSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues,
      });
      return;
    }

    const member = await addGroupMember(
      params.data.groupId,
      actorUserId,
      result.data,
    );

    res.status(201).json({
      message: "Member added successfully",
      data: member,
    });
  } catch (error) {
    if (error instanceof GroupMembershipError) {
      handleGroupMembershipError(error, res);
      return;
    }

    next(error);
  }
};

export const listGroupMembersController: RequestHandler<{
  groupId: string;
}> = async (
  req,
  res,
  next,
) => {
  try {
    const actorUserId = req.auth?.userId;

    if (!actorUserId) {
      res.status(401).json({
        message: "Authentication required",
      });
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

    const members = await listGroupMembers(params.data.groupId, actorUserId);

    res.status(200).json({
      message: "Group members fetched successfully",
      data: members,
    });
  } catch (error) {
    if (error instanceof GroupMembershipError) {
      handleGroupMembershipError(error, res);
      return;
    }

    next(error);
  }
};
