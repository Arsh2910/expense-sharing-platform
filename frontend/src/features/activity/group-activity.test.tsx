import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthContext } from "@/features/auth/auth-context-value";
import * as activityApi from "./activity.api";
import { GroupActivity } from "./group-activity";

const actor = { id: "owner", displayName: "Arsh", username: "arsh" };
const event: activityApi.GroupActivityEvent = {
  id: "event-2", action: "EXPENSE_UPDATED", entityType: "Expense", entityId: "expense",
  actor, targetUser: null, metadata: { description: "Goa hotel", fromVersion: 1, toVersion: 2 },
  createdAt: "2026-11-24T10:00:00.000Z",
};

afterEach(() => vi.restoreAllMocks());

function renderActivity() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{
        user: {
          ...actor, email: "arsh@example.test", status: "ACTIVE",
          emailVerifiedAt: event.createdAt, createdAt: event.createdAt,
        },
        isAuthenticated: true, isLoading: false, isError: false, error: null, refetchSession: vi.fn(),
      }}>
        <GroupActivity groupId="group-1" />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

it("renders the actor, action, target, version change, and timestamp", async () => {
  vi.spyOn(activityApi, "listGroupActivity").mockResolvedValue({ data: [event], pagination: { nextCursor: null } });
  renderActivity();
  const result = await screen.findByRole("listitem");
  expect(result.textContent).toContain("Arsh edited Goa hotel");
  expect(within(result).getByText("Version 1 → 2")).toBeDefined();
  expect(result.querySelector("time")?.dateTime).toBe(event.createdAt);
});

it("shows an empty state for a group with no activity", async () => {
  vi.spyOn(activityApi, "listGroupActivity").mockResolvedValue({ data: [], pagination: { nextCursor: null } });
  renderActivity();
  expect(await screen.findByText("No group activity yet")).toBeDefined();
});

it("shows settlement amounts and participants, preserving the original payment direction for reversals", async () => {
  const payer = { id: "payer", displayName: "Priya", username: "priya" };
  const recipient = { id: "recipient", displayName: "Dev", username: "dev" };
  const settlement = {
    amountMinor: 1250, currency: "USD", settledOn: "2026-11-23",
    note: "Bank transfer", fromUser: payer, toUser: recipient,
  };
  vi.spyOn(activityApi, "listGroupActivity").mockResolvedValue({
    data: [
      { ...event, entityId: "4f32a128-id", entityType: "Settlement", action: "SETTLEMENT_CREATED", settlement },
      {
        ...event, id: "event-reversal", entityId: "ed19c129-id", entityType: "Settlement", action: "SETTLEMENT_REVERSED",
        settlement: { ...settlement, fromUser: recipient, toUser: payer, note: null },
      },
    ],
    pagination: { nextCursor: null },
  });
  renderActivity();

  expect(await screen.findByText("recorded a $12.50 settlement from Priya to Dev")).toBeDefined();
  expect(screen.getByText("reversed a $12.50 settlement from Priya to Dev")).toBeDefined();
  expect(screen.getByText("Paid on Nov 23, 2026 · Bank transfer")).toBeDefined();
  expect(screen.queryByText(/4f32a128|ed19c129/)).toBeNull();
});

it("loads the next page using the API cursor and keeps the first page visible", async () => {
  const load = vi.spyOn(activityApi, "listGroupActivity")
    .mockResolvedValueOnce({ data: [event], pagination: { nextCursor: event.id } })
    .mockResolvedValueOnce({
      data: [{ ...event, id: "event-1", action: "EXPENSE_CREATED" }],
      pagination: { nextCursor: null },
    });
  renderActivity();
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
  const rows = screen.getAllByRole("listitem");
  expect(load.mock.calls).toEqual([["group-1", undefined], ["group-1", event.id]]);
  expect(rows[0].textContent).toContain("edited Goa hotel");
  expect(rows[1].textContent).toContain("added Goa hotel");
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});

it("shows an error and offers a retry when loading fails", async () => {
  vi.spyOn(activityApi, "listGroupActivity").mockRejectedValue(new Error("Activity is unavailable"));
  renderActivity();
  expect((await screen.findByRole("alert")).textContent).toContain("Activity is unavailable");
  expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
});
