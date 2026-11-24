import { Router } from "express";
import { requestLimits } from "../../middleware/rate-limit.middleware.js";
import { register, login, refresh, logout, profile, editProfile, password, email, verifyEmail, removeAccount, forgotPassword, resetPasswordController } from "./auth.controller.js";
import { authenticate } from "./auth.middleware.js";

const router = Router();

router.post("/register", requestLimits.register, register);
router.post("/login", requestLimits.login, login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/verify-email", requestLimits.verifyEmail, verifyEmail);
router.post("/forgot-password", requestLimits.forgotPassword, forgotPassword);
router.post("/reset-password", requestLimits.resetPassword, resetPasswordController);
router.get("/me", authenticate, profile);
router.patch("/me", authenticate, editProfile);
router.patch("/me/password", authenticate, password);
router.patch("/me/email", authenticate, email);
router.delete("/me", authenticate, removeAccount);

export default router;
