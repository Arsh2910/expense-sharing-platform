import express from "express";
import helmet from "helmet";
import { browserOrigins, trustedProxies } from "./config/environment.js";
import { browserOriginMiddleware } from "./middleware/browser-origin.middleware.js";
import authRoutes from "./modules/auth/auth.routes.js";
import groupRoutes from "./modules/groups/group.routes.js";
import invitationRoutes from "./modules/invitations/invitation.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { jsonBigIntReplacer } from "./http/json-bigint-replacer.js";

const app = express();

app.set("json replacer", jsonBigIntReplacer);
app.set("trust proxy", trustedProxies());
app.use(helmet({
  strictTransportSecurity: process.env.NODE_ENV === "production" ? undefined : false,
}));
app.use("/api", browserOriginMiddleware(browserOrigins()));
app.use(express.json({ limit: "100kb" }));
app.use("/api/auth", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
  });
});

app.use(errorHandler);

export default app;
