import type { BackendValidationIssue } from "@/types/api";

export type ApiErrorKind =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unavailable"
  | "network"
  | "server"
  | "unknown";

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly issues: BackendValidationIssue[];

  constructor(options: {
    message: string;
    status: number;
    kind: ApiErrorKind;
    issues?: BackendValidationIssue[];
  }) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.kind = options.kind;
    this.issues = options.issues ?? [];
  }
}

export function classifyStatus(status: number): ApiErrorKind {
  if (status === 400) return "validation";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 503) return "unavailable";
  if (status >= 500) return "server";
  return "unknown";
}

export function getErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getValidationErrors(error: unknown): Record<string, string> {
  if (error instanceof ApiError && error.issues.length > 0) {
    const map: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = String(issue.path?.[0] ?? "form");
      if (!map[key]) {
        map[key] = issue.message;
      }
    }
    return map;
  }
  return {};
}

