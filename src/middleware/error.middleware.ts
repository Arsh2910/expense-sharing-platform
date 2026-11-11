import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error(error);

  res.status(500).json({
    message: "Internal server error",
  });
};
