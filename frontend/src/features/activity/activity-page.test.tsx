import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { groupsApi } from "@/features/groups/groups.api";
import { ActivityPage } from "./activity-page";
import * as activityApi from "./activity.api";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));

afterEach(() => vi.restoreAllMocks());

function GroupDestination() {
  const { pathname, search } = useLocation();
  return <p>{pathname}{search}</p>;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/activity"]}>
        <Routes>
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/groups/:groupId" element={<GroupDestination />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("lists the user's groups and opens the selected group's Activity tab", async () => {
  vi.spyOn(activityApi, "listGroupActivity").mockResolvedValue({
    data: [],
    pagination: { nextCursor: null },
  });
  const createdAt = "2026-11-24T10:00:00.000Z";
  vi.spyOn(groupsApi, "listMyGroups").mockResolvedValue([
    { id: "trip", name: "Goa trip", currency: "INR", createdAt, memberships: [] },
    { id: "house", name: "Household", currency: "INR", createdAt, memberships: [] },
  ]);
  renderPage();

  expect(await screen.findByRole("link", { name: "View activity for Goa trip" })).toBeDefined();
  fireEvent.click(screen.getByRole("link", { name: "View activity for Household" }));
  expect(await screen.findByText("/groups/house?tab=activity")).toBeDefined();
});

it("offers a link to My Groups when there are no groups", async () => {
  vi.spyOn(groupsApi, "listMyGroups").mockResolvedValue([]);
  renderPage();

  expect(await screen.findByText("No groups yet")).toBeDefined();
  expect(screen.getByRole("link", { name: "Go to My Groups" }).getAttribute("href")).toBe("/groups");
});
