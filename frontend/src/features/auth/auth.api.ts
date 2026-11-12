import { apiRequest } from "@/lib/api/client";
import type {
  ApiMessageResponse,
  ApiSuccessResponse,
  PublicUser,
} from "@/types/api";

export interface RegisterPayload {
  email: string;
  displayName: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface VerifyEmailPayload {
  token: string;
}

export interface UpdateProfilePayload {
  displayName?: string;
  username?: string | null;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface ChangeEmailPayload {
  email: string;
  password: string;
}

export interface DeleteAccountPayload {
  currentPassword: string;
}

export function isPublicUser(value: unknown): value is PublicUser {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "email" in value &&
    typeof value.email === "string" &&
    "displayName" in value &&
    typeof value.displayName === "string"
  );
}

export const authApi = {
  async getMe(): Promise<PublicUser | null> {
    const res = await apiRequest<ApiSuccessResponse<PublicUser | null>>(
      "/api/auth/me",
      {
        method: "GET",
        suppressUnauthorizedEvent: true,
      },
    );
    return isPublicUser(res?.data) ? res.data : null;
  },

  async register(payload: RegisterPayload): Promise<ApiSuccessResponse<PublicUser>> {
    return apiRequest<ApiSuccessResponse<PublicUser>>("/api/auth/register", {
      method: "POST",
      body: payload,
      skipRefresh: true,
    });
  },

  async login(payload: LoginPayload): Promise<ApiSuccessResponse<PublicUser>> {
    return apiRequest<ApiSuccessResponse<PublicUser>>("/api/auth/login", {
      method: "POST",
      body: payload,
      skipRefresh: true,
    });
  },

  async refresh(): Promise<ApiSuccessResponse<PublicUser>> {
    return apiRequest<ApiSuccessResponse<PublicUser>>("/api/auth/refresh", {
      method: "POST",
      body: {},
      skipRefresh: true,
    });
  },

  async logout(): Promise<void> {
    await apiRequest<void>("/api/auth/logout", {
      method: "POST",
      skipRefresh: true,
    });
  },

  async verifyEmail(payload: VerifyEmailPayload): Promise<ApiMessageResponse> {
    return apiRequest<ApiMessageResponse>("/api/auth/verify-email", {
      method: "POST",
      body: payload,
      skipRefresh: true,
    });
  },

  async updateProfile(
    payload: UpdateProfilePayload,
  ): Promise<ApiSuccessResponse<PublicUser>> {
    return apiRequest<ApiSuccessResponse<PublicUser>>("/api/auth/me", {
      method: "PATCH",
      body: payload,
    });
  },

  async changePassword(payload: ChangePasswordPayload): Promise<void> {
    await apiRequest<void>("/api/auth/me/password", {
      method: "PATCH",
      body: payload,
    });
  },

  async changeEmail(
    payload: ChangeEmailPayload,
  ): Promise<ApiSuccessResponse<PublicUser>> {
    return apiRequest<ApiSuccessResponse<PublicUser>>("/api/auth/me/email", {
      method: "PATCH",
      body: payload,
    });
  },

  async deleteAccount(payload: DeleteAccountPayload): Promise<void> {
    await apiRequest<void>("/api/auth/me", {
      method: "DELETE",
      body: payload,
    });
  },
};

