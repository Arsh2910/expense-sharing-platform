import type { RequestHandler } from "express";
import { ZodError } from "zod";
import { groupParamsSchema } from "../groups/group.schema.js";
import { createInvitationSchema, invitationIdParamsSchema, invitationResponseSchema } from "./invitation.schema.js";
import {
  acceptInvitation, createInvitation, declineInvitation, InvitationServiceError,
  listGroupInvitations, listMyInvitations, resendInvitation, revokeInvitation,
} from "./invitation.service.js";

const statusByCode: Record<InvitationServiceError["code"], number> = {
  GROUP_NOT_FOUND: 404, GROUP_ARCHIVED: 409, FORBIDDEN: 403, USER_NOT_FOUND: 404, USER_INACTIVE: 403,
  ALREADY_MEMBER: 409, INVITATION_NOT_FOUND: 404, INVITATION_EXPIRED: 409, INVITATION_NOT_FOR_USER: 403,
  INVITATION_ALREADY_HANDLED: 409, INVITATION_TOKEN_INVALID: 400, INVITATION_NOT_EMAIL: 409,
};

function invitationHandler(
  action: (userId: string, params: unknown, body: unknown) => Promise<unknown>,
  status = 200,
): RequestHandler {
  return async (req, res, next) => {
    if (!req.auth?.userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }
    try {
      const data = await action(req.auth.userId, req.params, req.body);
      res.status(status).json({ message: status === 201 ? "Invitation created" : "Request successful", data });
    } catch (error) {
      if (error instanceof InvitationServiceError) {
        res.status(statusByCode[error.code]).json({ message: error.message, code: error.code });
      } else if (error instanceof ZodError) {
        res.status(400).json({ message: "Validation failed", errors: error.issues });
      } else {
        next(error);
      }
    }
  };
}

export const createInvitationController = invitationHandler((userId, params, body) =>
  createInvitation(groupParamsSchema.parse(params).groupId, userId, createInvitationSchema.parse(body)), 201);

export const listMyInvitationsController = invitationHandler(listMyInvitations);

export const listGroupInvitationsController = invitationHandler((userId, params) =>
  listGroupInvitations(groupParamsSchema.parse(params).groupId, userId));

export const acceptInvitationController = invitationHandler((userId, params, body) =>
  acceptInvitation(invitationIdParamsSchema.parse(params).invitationId, userId, invitationResponseSchema.parse(body ?? {}).token));

export const declineInvitationController = invitationHandler((userId, params, body) =>
  declineInvitation(invitationIdParamsSchema.parse(params).invitationId, userId, invitationResponseSchema.parse(body ?? {}).token));

export const revokeInvitationController = invitationHandler((userId, params) =>
  revokeInvitation(groupParamsSchema.parse(params).groupId, invitationIdParamsSchema.parse(params).invitationId, userId));

export const resendInvitationController = invitationHandler((userId, params) =>
  resendInvitation(groupParamsSchema.parse(params).groupId, invitationIdParamsSchema.parse(params).invitationId, userId));
