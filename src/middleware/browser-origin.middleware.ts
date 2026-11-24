import type { RequestHandler } from "express";

const methods = new Set(["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]);
const headers = new Set(["authorization", "content-type", "idempotency-key"]);

export function browserOriginMiddleware(allowedOrigins: ReadonlySet<string>): RequestHandler {
  return (req, res, next) => {
    res.vary("Origin");
    const origin = req.get("Origin");
    if (!origin) {
      if (req.get("Sec-Fetch-Site") === "cross-site" && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        res.status(403).json({ message: "Origin not allowed" });
        return;
      }
      next();
      return;
    }
    if (!allowedOrigins.has(origin)) {
      res.status(403).json({ message: "Origin not allowed" });
      return;
    }
    if (req.method === "OPTIONS") {
      res.vary("Access-Control-Request-Method");
      res.vary("Access-Control-Request-Headers");
      const method = req.get("Access-Control-Request-Method");
      const requestedHeaders = (req.get("Access-Control-Request-Headers") ?? "").split(",")
        .map((header) => header.trim().toLowerCase()).filter(Boolean);
      if (method && (!methods.has(method) || requestedHeaders.some((header) => !headers.has(header)))) {
        res.status(403).json({ message: "Preflight not allowed" });
        return;
      }
      if (method) {
        res.set({
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods": [...methods].join(", "),
          "Access-Control-Allow-Headers": [...headers].join(", "),
        });
        res.sendStatus(204);
        return;
      }
    }
    res.set({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Expose-Headers": "Retry-After",
    });
    next();
  };
}
