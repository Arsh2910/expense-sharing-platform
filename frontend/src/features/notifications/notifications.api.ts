import { apiRequest } from "@/lib/api/client";

export type NotificationItem = {
  id: string;
  groupName: string;
  createdAt: string;
  readAt: string | null;
} & (
  | { type: "INVITATION"; invitationId: string }
  | {
      type: "EXPENSE_CREATED" | "EXPENSE_UPDATED" | "EXPENSE_DELETED";
      expenseId: string;
      groupId: string;
      expenseDescription: string | null;
      expenseDeleted: boolean;
    }
  | { type: "SETTLEMENT_RECORDED" | "SETTLEMENT_REVERSED"; settlementId: string; groupId: string }
);

interface NotificationPage {
  items: NotificationItem[];
  nextCursor: string | null;
}

const path = "/api/notifications";

export const notificationKeys = (userId: string) => ({
  all: ["notifications", userId] as const,
  inbox: ["notifications", userId, "inbox"] as const,
  count: ["notifications", userId, "count"] as const,
});

export const notificationsApi = {
  async list(cursor?: string) {
    const result = await apiRequest<{ data: NotificationPage }>(
      cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path,
    );
    return result.data;
  },

  async count() {
    const result = await apiRequest<{ data: { count: number } }>(`${path}/unread-count`);
    return result.data.count;
  },

  async markRead(id: string) {
    await apiRequest(`${path}/${encodeURIComponent(id)}/read`, { method: "PATCH" });
  },

  async markAllRead() {
    await apiRequest(`${path}/read-all`, { method: "PATCH" });
  },
};
