import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { AuthContext } from "@/features/auth/auth-context-value";
import { NotificationBell } from "./notification-bell";
import { notificationsApi, type NotificationItem } from "./notifications.api";
import { NotificationsPage } from "./notifications-page";

afterEach(() => vi.restoreAllMocks());

function DestinationLocation() {
  return <p>{useLocation().search}</p>;
}

const base = {
  id: "notification-1", groupName: "Weekend Trip", createdAt: "2026-11-23T12:00:00Z", readAt: null,
};

const expense = { ...base, expenseId: "expense-1", groupId: "group-1", expenseDescription: "Dinner" };

it.each<{
  item: NotificationItem;
  message: string;
  button: string;
  search: string;
}>([
  {
    item: { ...base, type: "INVITATION", invitationId: "invitation-1" },
    message: "You were invited to Weekend Trip",
    button: "View invitation",
    search: "?invitationId=invitation-1",
  },
  {
    item: { ...expense, type: "EXPENSE_CREATED", expenseDeleted: false },
    message: "An expense was added in Weekend Trip",
    button: "View expense",
    search: "?tab=expenses&expenseId=expense-1",
  },
  {
    item: { ...expense, type: "EXPENSE_UPDATED", expenseDeleted: false },
    message: "An expense was updated in Weekend Trip",
    button: "View expense",
    search: "?tab=expenses&expenseId=expense-1",
  },
  {
    item: { ...expense, type: "EXPENSE_DELETED", expenseDeleted: true },
    message: "An expense was deleted in Weekend Trip",
    button: "View expenses",
    search: "?tab=expenses",
  },
])("marks the notification read and opens its destination for $item.type", async ({ item, message, button, search }) => {
  let read = false;
  vi.spyOn(notificationsApi, "count").mockImplementation(async () => read ? 0 : 1);
  vi.spyOn(notificationsApi, "list").mockResolvedValue({ items: [item], nextCursor: null });
  const markRead = vi.spyOn(notificationsApi, "markRead").mockImplementation(async () => { read = true; });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{
        user: {
          id: "user-1", email: "invitee@example.test", displayName: "Invitee", username: null,
          status: "ACTIVE", emailVerifiedAt: "2026-11-23T12:00:00Z", createdAt: "2026-11-23T12:00:00Z",
        },
        isAuthenticated: true, isLoading: false, isError: false, error: null, refetchSession: vi.fn(),
      }}>
        <MemoryRouter>
          <NotificationBell />
          <Routes>
            <Route path="/" element={<p>Dashboard</p>} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/invitations" element={<DestinationLocation />} />
            <Route path="/groups/:groupId" element={<DestinationLocation />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole("link", { name: "Notifications, 1 unread" }));
  expect(await screen.findByText(message)).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: button }));
  expect(await screen.findByText(search)).toBeDefined();
  expect(markRead).toHaveBeenCalledExactlyOnceWith(item.id, expect.anything());
  expect(await screen.findByRole("link", { name: /^Notifications$/ })).toBeDefined();
});
