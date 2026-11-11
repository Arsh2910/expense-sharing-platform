import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import groupRoutes from "./modules/groups/group.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/groups", groupRoutes);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
  });
});

app.use(errorHandler);

export default app;
