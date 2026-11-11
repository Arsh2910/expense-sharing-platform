import type { RequestHandler } from "express";
import { registerSchema, loginSchema } from "./auth.schema.js";
import { registerUser, loginUser, AuthServiceError } from "./auth.service.js";

export const register: RequestHandler = async (req, res, next) => {
  try {
    console.log("register:", typeof register);
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues,
      });
      return;
    }

    const data = await registerUser(result.data);

    res.status(201).json({
      message: "Account created successfully",
      data,
    });
  } catch (error) {
    if (
      error instanceof AuthServiceError &&
      error.code === "EMAIL_ALREADY_EXISTS"
    ) {
      res.status(409).json({
        message: error.message,
      });
      return;
    }

    next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    console.log("login:", typeof login);
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues,
      });
      return;
    }

    const data = await loginUser(result.data);

    res.status(200).json({
      message: "Login successful",
      data,
    });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      const status = error.code === "ACCOUNT_UNAVAILABLE" ? 403 : 401;

      res.status(status).json({
        message: error.message,
      });
      return;
    }

    next(error);
  }
};
