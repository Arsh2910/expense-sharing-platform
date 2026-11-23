import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../auth/auth.middleware.js";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification.service.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  const cursor = z.uuid().optional().safeParse(req.query.cursor);
  if (!cursor.success) {
    res.status(400).json({ message: "Invalid notification cursor" });
    return;
  }

  const data = await listNotifications(req.auth!.userId, cursor.data);
  if (!data) {
    res.status(400).json({ message: "Invalid notification cursor" });
    return;
  }
  res.json({ data });
});

router.get("/unread-count", async (req, res) => {
  const count = await countUnreadNotifications(req.auth!.userId);
  res.json({ data: { count } });
});

router.patch("/read-all", async (req, res) => {
  const data = await markAllNotificationsRead(req.auth!.userId);
  res.json({ data });
});

router.patch("/:notificationId/read", async (req, res) => {
  const id = z.uuid().safeParse(req.params.notificationId);
  if (!id.success) {
    res.status(400).json({ message: "Invalid notification ID" });
    return;
  }

  const data = await markNotificationRead(req.auth!.userId, id.data);
  if (!data) {
    res.status(404).json({ message: "Notification not found" });
    return;
  }
  res.json({ data });
});

export default router;
