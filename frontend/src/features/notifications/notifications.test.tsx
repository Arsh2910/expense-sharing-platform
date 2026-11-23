import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { AuthContext } from "@/features/auth/auth-context-value";
import { NotificationBell } from "./notification-bell";
import { notificationsApi } from "./notifications.api";
import { NotificationsPage } from "./notifications-page";

afterEach(() => vi.restoreAllMocks());

function InvitationLocation() {
  return <p>{useLocation().search}</p>;
}

it("updates the bell and opens the matching invitation after marking a notification read", async () => {
  const item = {
    id: "notification-1", invitationId: "invitation-1", groupName: "Weekend Trip",
    createdAt: "2026-11-23T12:00:00Z", readAt: null,
  };
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
            <Route path="/invitations" element={<InvitationLocation />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole("link", { name: "Notifications, 1 unread" }));
  expect(await screen.findByText("You were invited to Weekend Trip")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "View invitation" }));
  expect(await screen.findByText("?invitationId=invitation-1")).toBeDefined();
  expect(markRead).toHaveBeenCalledExactlyOnceWith(item.id, expect.anything());
  expect(await screen.findByRole("link", { name: /^Notifications$/ })).toBeDefined();
});
