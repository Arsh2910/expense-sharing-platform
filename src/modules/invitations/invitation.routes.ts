import { Router } from "express";
import { authenticate } from "../auth/auth.middleware.js";
import { acceptInvitationController, declineInvitationController, listMyInvitationsController } from "./invitation.controller.js";
const router = Router();
router.get("/", authenticate, listMyInvitationsController);
router.post("/:invitationId/accept", authenticate, acceptInvitationController);
router.post("/:invitationId/decline", authenticate, declineInvitationController);
export default router;
