import type { RequestHandler } from "express";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  updateProfileSchema,
  changePasswordSchema,
  changeEmailSchema,
  deleteAccountSchema,
  verifyEmailSchema,
} from "./auth.schema.js";
import {
  registerUser,
  loginUser,
  refreshSession,
  revokeSession,
  getProfile,
  updateProfile,
  changePassword,
  changeEmail,
  deleteAccount,
  registrationVerification,
  AuthServiceError,
} from "./auth.service.js";
import { accessCookieName, refreshCookieName } from "./token.service.js";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
function setAuthCookies(
  res: Parameters<RequestHandler>[1],
  accessToken: string,
  refreshToken: string,
) {
  const serialize = (name: string, value: string, maxAge: number) =>
    `${name}=${value}; Max-Age=${Math.floor(maxAge / 1000)}; Path=/; HttpOnly; SameSite=Lax${cookieOptions.secure ? "; Secure" : ""}`;
  res.append(
    "Set-Cookie",
    serialize(accessCookieName, accessToken, 15 * 60 * 1000),
  );
  res.append(
    "Set-Cookie",
    serialize(refreshCookieName, refreshToken, 30 * 86400000),
  );
}
function clearAuthCookies(res: Parameters<RequestHandler>[1]) {
  const secure = cookieOptions.secure ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${accessCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`,
  );
  res.append(
    "Set-Cookie",
    `${refreshCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`,
  );
}
function body(req: Parameters<RequestHandler>[0], name: string) {
  const value: unknown = req.body?.[name];
  return typeof value === "string" ? value : undefined;
}
function tokenFrom(req: Parameters<RequestHandler>[0]) {
  return (
    body(req, "refreshToken") ??
    req.headers.cookie
      ?.split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${refreshCookieName}=`))
      ?.slice(refreshCookieName.length + 1)
  );
}
function meta(req: Parameters<RequestHandler>[0]) {
  return { userAgent: req.get("user-agent") ?? undefined, ipAddress: req.ip };
}

export const register: RequestHandler = async (req, res, next) => {
  try {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      res
        .status(400)
        .json({ message: "Validation failed", errors: result.error.issues });
      return;
    }
    const data = await registerUser(result.data, meta(req));
    res.status(201).json({ message: "Account created successfully", data: data.user });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      if (error.code === "EMAIL_ALREADY_EXISTS") {
        res.status(409).json({ message: error.message });
        return;
      }
      if (error.code === "EMAIL_DELIVERY_UNAVAILABLE") {
        res.status(503).json({ message: error.message });
        return;
      }
    }
    next(error);
  }
};
export const login: RequestHandler = async (req, res, next) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      res
        .status(400)
        .json({ message: "Validation failed", errors: result.error.issues });
      return;
    }
    const data = await loginUser(result.data, meta(req));
    setAuthCookies(res, data.accessToken, data.refreshToken);
    res.json({ message: "Login successful", data: data.user });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      res
        .status(error.code === "ACCOUNT_UNAVAILABLE" ? 403 : 401)
        .json({ message: error.message });
      return;
    }
    next(error);
  }
};
export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body ?? {});
    const token = parsed.success
      ? (parsed.data.refreshToken ?? tokenFrom(req))
      : tokenFrom(req);
    if (!token) {
      res.status(401).json({ message: "Refresh token required" });
      return;
    }
    const data = await refreshSession(token, meta(req));
    setAuthCookies(res, data.accessToken, data.refreshToken);
    res.json({ message: "Token refreshed", data: data.user });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      clearAuthCookies(res);
      res.status(401).json({ message: error.message });
      return;
    }
    next(error);
  }
};
export const logout: RequestHandler = async (req, res, next) => {
  try {
    const token = tokenFrom(req);
    if (token) await revokeSession(token);
    clearAuthCookies(res);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
export const profile: RequestHandler = async (req, res, next) => {
  try {
    const user = await getProfile(req.auth!.userId);
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
};
export const editProfile: RequestHandler = async (req, res, next) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ message: "Validation failed", errors: parsed.error.issues });
      return;
    }
    res.json({ data: await updateProfile(req.auth!.userId, parsed.data) });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      res.status(409).json({ message: error.message });
      return;
    }
    next(error);
  }
};
export const password: RequestHandler = async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ message: "Validation failed", errors: parsed.error.issues });
      return;
    }
    await changePassword(
      req.auth!.userId,
      req.auth!.sessionId,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    res.status(204).send();
  } catch (error) {
    if (error instanceof AuthServiceError) {
      res.status(400).json({ message: error.message });
      return;
    }
    next(error);
  }
};
export const email: RequestHandler = async (req, res, next) => {
  try {
    const parsed = changeEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ message: "Validation failed", errors: parsed.error.issues });
      return;
    }
    res.json({
      data: await changeEmail(
        req.auth!.userId,
        parsed.data.email,
        parsed.data.password,
      ),
    });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      res
        .status(error.code === "EMAIL_ALREADY_EXISTS" ? 409 : 400)
        .json({ message: error.message });
      return;
    }
    next(error);
  }
};
export const verifyEmail: RequestHandler = async (req, res, next) => {
  try {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Validation failed" });
      return;
    }
    await registrationVerification.consume(parsed.data.token);
    res.json({ message: "Email verified" });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      res.status(400).json({ message: error.message });
      return;
    }
    next(error);
  }
};
export const removeAccount: RequestHandler = async (req, res, next) => {
  try {
    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: parsed.error.issues,
      });
      return;
    }
    await deleteAccount(req.auth!.userId, parsed.data.currentPassword);
    clearAuthCookies(res);
    res.status(204).send();
  } catch (error) {
    if (error instanceof AuthServiceError) {
      res.status(
        error.code === "PASSWORD_INVALID" ? 401 : 409,
      ).json({ message: error.message });
      return;
    }
    next(error);
  }
};
