import type { RequestHandler, Response } from "express";
import { groupParamsSchema } from "../groups/group.schema.js";
import { createInvitationSchema, invitationIdParamsSchema } from "./invitation.schema.js";
import { acceptInvitation, createInvitation, declineInvitation, InvitationServiceError, listMyInvitations } from "./invitation.service.js";

const statusByCode: Record<InvitationServiceError["code"], number> = {
  GROUP_NOT_FOUND: 404, GROUP_ARCHIVED: 409, FORBIDDEN: 403, USER_NOT_FOUND: 404, USER_INACTIVE: 403,
  ALREADY_MEMBER: 409, INVITATION_NOT_FOUND: 404, INVITATION_EXPIRED: 409, INVITATION_NOT_FOR_USER: 403, INVITATION_ALREADY_HANDLED: 409,
};
function handle(error: InvitationServiceError, res: Response) { res.status(statusByCode[error.code]).json({ message: error.message, code: error.code }); }
function actor(req: Parameters<RequestHandler>[0], res: Response) { const userId = req.auth?.userId; if (!userId) { res.status(401).json({ message: "Authentication required" }); return null; } return userId; }

export const createInvitationController: RequestHandler<{ groupId: string }> = async (req, res, next) => {
  try {
    const userId = actor(req, res); if (!userId) return;
    const params = groupParamsSchema.safeParse(req.params); const body = createInvitationSchema.safeParse(req.body);
    if (!params.success || !body.success) { res.status(400).json({ message: "Validation failed", errors: [...(params.success ? [] : params.error.issues), ...(body.success ? [] : body.error.issues)] }); return; }
    res.status(201).json({ message: "Invitation created successfully", data: await createInvitation(params.data.groupId, userId, body.data) });
  } catch (error) { if (error instanceof InvitationServiceError) return handle(error, res); next(error); }
};
export const listMyInvitationsController: RequestHandler = async (req, res, next) => { try { const userId = actor(req, res); if (!userId) return; res.status(200).json({ message: "Invitations fetched successfully", data: await listMyInvitations(userId) }); } catch (error) { next(error); } };
export const acceptInvitationController: RequestHandler<{ invitationId: string }> = async (req, res, next) => { try { const userId = actor(req, res); if (!userId) return; const params = invitationIdParamsSchema.safeParse(req.params); if (!params.success) { res.status(400).json({ message: "Validation failed", errors: params.error.issues }); return; } res.status(200).json({ message: "Invitation accepted successfully", data: await acceptInvitation(params.data.invitationId, userId) }); } catch (error) { if (error instanceof InvitationServiceError) return handle(error, res); next(error); } };
export const declineInvitationController: RequestHandler<{ invitationId: string }> = async (req, res, next) => { try { const userId = actor(req, res); if (!userId) return; const params = invitationIdParamsSchema.safeParse(req.params); if (!params.success) { res.status(400).json({ message: "Validation failed", errors: params.error.issues }); return; } res.status(200).json({ message: "Invitation declined successfully", data: await declineInvitation(params.data.invitationId, userId) }); } catch (error) { if (error instanceof InvitationServiceError) return handle(error, res); next(error); } };
