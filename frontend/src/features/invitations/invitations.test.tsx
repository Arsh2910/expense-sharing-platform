import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { AuthContext } from "@/features/auth/auth-context-value";
import { invitationsApi, type Invitation } from "./invitations.api";
import { InvitationsPage } from "./invitations-page";

const invitation: Invitation = {
  id: "invitation-1",
  groupId: "group-1",
  group: { name: "Weekend Trip", currency: "USD" },
  invitedUser: null,
  invitedEmail: "invitee@example.test",
  expiresAt: "2026-11-30T12:00:00Z",
  status: "PENDING",
};

afterEach(() => vi.restoreAllMocks());

function renderInbox(path: string) {
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
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/invitations/accept" element={<InvitationsPage fromEmail />} />
            <Route path="/groups/:groupId" element={<p>Group opened</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

it("opens only the linked invitation and submits its token before navigating to the group", async () => {
  vi.spyOn(invitationsApi, "listMine").mockResolvedValue([
    invitation,
    { ...invitation, id: "another-invite", group: { ...invitation.group, name: "Other group" } },
  ]);
  const respond = vi.spyOn(invitationsApi, "respond").mockResolvedValue({
    message: "Request successful", data: { id: invitation.id },
  });

  renderInbox("/invitations/accept?invitationId=invitation-1&token=linked-token");
  expect(await screen.findByText("Weekend Trip")).toBeDefined();
  expect(screen.queryByText("Other group")).toBeNull();
  expect(respond).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() => expect(respond).toHaveBeenCalledWith(invitation.id, "accept", "linked-token"));
  expect(await screen.findByText("Group opened")).toBeDefined();
});

it("offers the inbox when the link has no matching invitation for the active account", async () => {
  vi.spyOn(invitationsApi, "listMine").mockResolvedValue([invitation]);

  renderInbox("/invitations/accept?invitationId=another-invite&token=linked-token");
  expect(await screen.findByText(/This invitation is unavailable/)).toBeDefined();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  expect(screen.getByRole("link", { name: "All invitations" }).getAttribute("href")).toBe("/invitations");
});
