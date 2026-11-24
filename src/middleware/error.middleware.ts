import type { ErrorRequestHandler } from "express";

const bodyErrors = new Map([
  ["entity.parse.failed", { status: 400, message: "Invalid JSON request body" }],
  ["entity.too.large", { status: 413, message: "Request body too large" }],
  ["encoding.unsupported", { status: 415, message: "Unsupported request encoding" }],
  ["charset.unsupported", { status: 415, message: "Unsupported request charset" }],
]);

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(new Error("Request failed"));
    return;
  }

  const expected = bodyErrors.get(error?.type);
  if (expected) {
    res.status(expected.status).json({ message: expected.message });
    return;
  }

  // Error objects can include request bodies, credentials, SQL parameters, or provider payloads.
  console.error("Unhandled HTTP request error", { method: req.method });
  res.status(500).json({ message: "Internal server error" });
};
