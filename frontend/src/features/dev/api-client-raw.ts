import type { HttpMethod, RawApiResponse } from "@/features/dev/api-test-types";

const RAW_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, "");

export interface RawRequestOptions {
  method: HttpMethod;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function executeRawApiRequest(
  options: RawRequestOptions,
): Promise<RawApiResponse> {
  const url = `${API_BASE_URL}${options.path}`;
  const startTime = performance.now();

  const reqHeaders: Record<string, string> = {
    ...options.headers,
  };

  if (options.body !== undefined && options.body !== null) {
    reqHeaders["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(url, {
      method: options.method,
      credentials: "include", // Essential for HttpOnly cookies
      headers: reqHeaders,
      body:
        options.body !== undefined && options.body !== null
          ? typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body)
          : undefined,
      signal: options.signal,
    });

    const durationMs = Math.round(performance.now() - startTime);

    const headersRecord: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      headersRecord[key] = val;
    });

    const rawText = await response.text();
    let parsedBody: unknown = null;

    if (rawText.trim().length > 0) {
      try {
        parsedBody = JSON.parse(rawText);
      } catch {
        parsedBody = rawText;
      }
    }

    return {
      status: response.status,
      statusText: response.statusText,
      durationMs,
      headers: headersRecord,
      body: parsedBody,
      rawText,
      ok: response.ok,
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const message = error instanceof Error ? error.message : "Network/Connection Failure";
    return {
      status: 0,
      statusText: "Network Error",
      durationMs,
      headers: {},
      body: { error: message },
      rawText: message,
      ok: false,
    };
  }
}

