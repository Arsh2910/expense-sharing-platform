import { Router } from "express";
import { register, login, refresh, logout, profile, editProfile, password, email, verifyEmail, removeAccount } from "./auth.controller.js";
import { authenticate } from "./auth.middleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/verify-email", verifyEmail);
router.get("/me", authenticate, profile);
router.patch("/me", authenticate, editProfile);
router.patch("/me/password", authenticate, password);
router.patch("/me/email", authenticate, email);
router.delete("/me", authenticate, removeAccount);

export default router;
