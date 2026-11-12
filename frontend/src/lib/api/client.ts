import { ApiError, classifyStatus } from "@/lib/api/errors";
import type { ApiErrorPayload } from "@/types/api";

const RAW_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, "");

const AUTH_NO_REFRESH_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/verify-email",
]);

const MIDDLEWARE_AUTH_MESSAGES = new Set([
  "Authentication required",
  "Invalid or expired access token",
  "Invalid access token",
  "Account unavailable",
]);

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function subscribeUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(): void {
  for (const listener of unauthorizedListeners) {
    listener();
  }
}

let inflightRefresh: Promise<boolean> | null = null;

/**
 * Deduplicates concurrent refresh calls so refresh token reuse detection
 * on the backend is never triggered by parallel 401 responses.
 */
export async function refreshAuthSession(): Promise<boolean> {
  if (inflightRefresh) {
    return inflightRefresh;
  }

  inflightRefresh = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();

  return inflightRefresh;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Disable automatic token refresh on 401 (e.g., for auth probes or auth mutations) */
  skipRefresh?: boolean;
  /** Suppress broadcasting unauthorized state on terminal 401 */
  suppressUnauthorizedEvent?: boolean;
}

async function parseErrorPayload(response: Response): Promise<ApiErrorPayload> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return {};
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const url = `${API_BASE_URL}${path}`;

  const execute = async (): Promise<Response> => {
    try {
      const headers: Record<string, string> = {};
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      return await fetch(url, {
        method,
        credentials: "include",
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      throw new ApiError({
        message: "Unable to reach the server. Check your connection and try again.",
        status: 0,
        kind: "network",
      });
    }
  };

  let response = await execute();

  if (
    response.status === 401 &&
    !options.skipRefresh &&
    !AUTH_NO_REFRESH_PATHS.has(path)
  ) {
    const payload = await parseErrorPayload(response);
    const isMiddlewareAuthFailure =
      !payload.message || MIDDLEWARE_AUTH_MESSAGES.has(payload.message);

    if (isMiddlewareAuthFailure) {
      const refreshed = await refreshAuthSession();
      if (refreshed) {
        response = await execute();
      } else {
        if (!options.suppressUnauthorizedEvent) {
          notifyUnauthorized();
        }
        throw new ApiError({
          message: payload.message ?? "Your session has expired. Please sign in again.",
          status: 401,
          kind: "unauthorized",
          issues: payload.errors,
        });
      }
    } else {
      throw new ApiError({
        message: payload.message ?? "Unauthorized",
        status: 401,
        kind: "unauthorized",
        issues: payload.errors,
      });
    }
  }

  if (!response.ok) {
    const payload = await parseErrorPayload(response);
    const message =
      payload.message ??
      (response.status >= 500
        ? "An unexpected server error occurred."
        : `Request failed with status ${response.status}`);

    if (
      response.status === 401 &&
      !AUTH_NO_REFRESH_PATHS.has(path) &&
      !options.suppressUnauthorizedEvent &&
      MIDDLEWARE_AUTH_MESSAGES.has(message)
    ) {
      notifyUnauthorized();
    }

    throw new ApiError({
      message,
      status: response.status,
      kind: classifyStatus(response.status),
      issues: payload.errors,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

