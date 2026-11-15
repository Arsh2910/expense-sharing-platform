import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { AuthContext } from "@/features/auth/auth-context-value";
import { ApiError } from "@/lib/api/errors";
import type { GroupMember, PublicUser } from "@/types/api";
import { AddExpenseDialog } from "./components/add-expense-dialog";
import { ExpenseDetailsDialog } from "./components/expense-details-dialog";
import { ExpenseList } from "./components/expense-list";
import { ExpenseRevisionsDialog } from "./components/expense-revisions-dialog";
import { expensesApi } from "./expenses.api";
import { expensesKeys } from "./expenses.queries";
import type { ExpenseItem, ExpenseRevision } from "./expenses.types";

const mockUser: PublicUser = {
  id: "user-1",
  email: "user1@example.com",
  username: "userone",
  displayName: "User One",
  status: "ACTIVE",
  emailVerifiedAt: "2026-11-01T00:00:00Z",
  createdAt: "2026-11-01T00:00:00Z",
};

const mockMembers: GroupMember[] = [
  {
    id: "m-1",
    role: "OWNER",
    joinedAt: "2026-11-01T00:00:00Z",
    user: { id: "user-1", username: "userone", displayName: "User One" },
  },
  {
    id: "m-2",
    role: "MEMBER",
    joinedAt: "2026-11-02T00:00:00Z",
    user: { id: "user-2", username: "usertwo", displayName: "User Two" },
  },
];

const mockExpense: ExpenseItem = {
  id: "exp-1",
  groupId: "group-100",
  currency: "USD",
  description: "Team Dinner",
  category: "FOOD",
  totalMinor: 6000,
  splitType: "EQUAL",
  expenseDate: "2026-11-14",
  version: 1,
  createdById: "user-1",
  createdAt: "2026-11-14T12:00:00Z",
  updatedAt: "2026-11-14T12:00:00Z",
  payers: [{ userId: "user-1", amountMinor: 6000 }],
  splits: [
    { userId: "user-1", amountMinor: 3000 },
    { userId: "user-2", amountMinor: 3000 },
  ],
};

const mockRevisions: ExpenseRevision[] = [
  {
    revision: 2,
    changes: { type: "UPDATED", fromVersion: 1, toVersion: 2 },
    createdById: "user-1",
    createdAt: "2026-11-15T10:00:00Z",
    snapshot: {
      id: "exp-1",
      groupId: "group-100",
      description: "Team Dinner - With Dessert",
      category: "FOOD",
      amount: "80.00",
      splitType: "EQUAL",
      expenseDate: "2026-11-14",
      version: 2,
      createdById: "user-1",
      deletedAt: null,
      deletedById: null,
      payers: [{ userId: "user-1", amount: "80.00" }],
      splits: [
        { userId: "user-1", amount: "40.00", percentUnits: null },
        { userId: "user-2", amount: "40.00", percentUnits: null },
      ],
    },
  },
  {
    revision: 1,
    changes: { type: "CREATED" },
    createdById: "user-1",
    createdAt: "2026-11-14T12:00:00Z",
    snapshot: {
      id: "exp-1",
      groupId: "group-100",
      description: "Team Dinner",
      category: "FOOD",
      amount: "60.00",
      splitType: "EQUAL",
      expenseDate: "2026-11-14",
      version: 1,
      createdById: "user-1",
      deletedAt: null,
      deletedById: null,
      payers: [{ userId: "user-1", amount: "60.00" }],
      splits: [
        { userId: "user-1", amount: "30.00", percentUnits: null },
        { userId: "user-2", amount: "30.00", percentUnits: null },
      ],
    },
  },
];

function renderWithProviders(
  ui: React.ReactElement,
  customQueryClient?: QueryClient,
) {
  const queryClient =
    customQueryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={{
            user: mockUser,
            isLoading: false,
            isError: false,
            error: null,
            isAuthenticated: true,
            refetchSession: vi.fn(),
          }}
        >
          <ToastProvider>{ui}</ToastProvider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    ),
  };
}

describe("Expense Ledger & Management Frontend Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Expense List & Cursor Pagination", () => {
    it("renders empty state when no expenses exist", async () => {
      vi.spyOn(expensesApi, "listExpenses").mockResolvedValue({
        message: "Success",
        data: [],
        pagination: { nextCursor: null },
      });

      const onAdd = vi.fn();
      renderWithProviders(
        <ExpenseList
          groupId="group-100"
          currency="USD"
          members={mockMembers}
          onAddExpense={onAdd}
          onSelectExpense={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/no expenses recorded yet/i)).toBeDefined();
      });

      const addBtn = screen.getByRole("button", { name: /add your first expense/i });
      fireEvent.click(addBtn);
      expect(onAdd).toHaveBeenCalled();
    });

    it("renders expense cards with payer summary and handles cursor pagination", async () => {
      const listSpy = vi.spyOn(expensesApi, "listExpenses");

      // Page 1
      listSpy.mockResolvedValueOnce({
        message: "Success",
        data: [mockExpense],
        pagination: { nextCursor: "cursor-exp-1" },
      });

      // Page 2
      const secondExpense: ExpenseItem = {
        ...mockExpense,
        id: "exp-2",
        description: "Taxi Ride",
        category: "TRANSPORTATION",
        totalMinor: 2500,
        version: 1,
      };
      listSpy.mockResolvedValueOnce({
        message: "Success",
        data: [secondExpense],
        pagination: { nextCursor: null },
      });

      const onSelect = vi.fn();
      renderWithProviders(
        <ExpenseList
          groupId="group-100"
          currency="USD"
          members={mockMembers}
          onAddExpense={vi.fn()}
          onSelectExpense={onSelect}
        />,
      );

      // Verify page 1 item
      await waitFor(() => {
        expect(screen.getByText("Team Dinner")).toBeDefined();
        expect(screen.getByText("FOOD")).toBeDefined();
        expect(screen.getByText("Paid by User One")).toBeDefined();
        expect(screen.getByText("$60.00")).toBeDefined();
      });

      // Click on load more button
      const loadMoreBtn = screen.getByRole("button", { name: /load more expenses/i });
      fireEvent.click(loadMoreBtn);

      // Verify cursor was sent in second call
      await waitFor(() => {
        expect(listSpy).toHaveBeenLastCalledWith("group-100", {
          limit: 20,
          cursor: "cursor-exp-1",
        });
        expect(screen.getByText("Taxi Ride")).toBeDefined();
        expect(screen.getByText("$25.00")).toBeDefined();
      });

      // Clicking an item calls onSelectExpense
      fireEvent.click(screen.getByText("Team Dinner"));
      expect(onSelect).toHaveBeenCalledWith(mockExpense);
    });
  });

  describe("2. Expense Details & Deletion", () => {
    it("renders expense details with payers, shares, and timestamps", async () => {
      vi.spyOn(expensesApi, "getExpense").mockResolvedValue({
        message: "Success",
        data: mockExpense,
      });

      renderWithProviders(
        <ExpenseDetailsDialog
          groupId="group-100"
          currency="USD"
          expenseId="exp-1"
          members={mockMembers}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Team Dinner")).toBeDefined();
        expect(screen.getAllByText("$60.00").length).toBeGreaterThan(0);
        expect(screen.getByText(/who paid/i)).toBeDefined();
        expect(screen.getByText(/participant shares/i)).toBeDefined();
      });
    });

    it("requires delete confirmation and sends current version", async () => {
      vi.spyOn(expensesApi, "getExpense").mockResolvedValue({
        message: "Success",
        data: mockExpense,
      });
      const deleteSpy = vi.spyOn(expensesApi, "deleteExpense").mockResolvedValue({
        message: "Success",
        data: { id: "exp-1", version: 2, deletedAt: "2026-11-15T12:00:00Z" },
      });

      const onOpenChange = vi.fn();
      renderWithProviders(
        <ExpenseDetailsDialog
          groupId="group-100"
          currency="USD"
          expenseId="exp-1"
          members={mockMembers}
          open={true}
          onOpenChange={onOpenChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^delete$/i })).toBeDefined();
      });

      // Click delete button in details dialog
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

      // Confirmation dialog appears explaining balance removal
      await waitFor(() => {
        expect(screen.getByText(/delete expense\?/i)).toBeDefined();
        expect(
          screen.getByText(/removes this expense from active balances/i),
        ).toBeDefined();
      });

      // Confirm deletion using confirm button
      const confirmBtn = screen.getByRole("button", { name: "Delete Expense" });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledWith("group-100", "exp-1", {
          version: 1,
        });
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("disables edit and delete actions when group is archived", async () => {
      vi.spyOn(expensesApi, "getExpense").mockResolvedValue({
        message: "Success",
        data: mockExpense,
      });

      renderWithProviders(
        <ExpenseDetailsDialog
          groupId="group-100"
          currency="USD"
          expenseId="exp-1"
          members={mockMembers}
          open={true}
          onOpenChange={vi.fn()}
          isArchived={true}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Team Dinner")).toBeDefined();
      });

      // Delete and edit buttons should not be present
      expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /edit expense/i })).toBeNull();
      expect(
        screen.getByText(/editing and deleting expenses are disabled/i),
      ).toBeDefined();
    });
  });

  describe("3. Expense Editing & Version Conflict", () => {
    it("prefills existing values and submits update with current version", async () => {
      const updateSpy = vi.spyOn(expensesApi, "updateExpense").mockResolvedValue({
        message: "Success",
        data: { ...mockExpense, version: 2, description: "Updated Team Dinner" },
      });

      renderWithProviders(
        <AddExpenseDialog
          groupId="group-100"
          currency="USD"
          members={mockMembers}
          open={true}
          onOpenChange={vi.fn()}
          initialExpense={mockExpense}
        />,
      );

      // Verify prefilled description
      const descInput = screen.getByLabelText(/description/i) as HTMLInputElement;
      expect(descInput.value).toBe("Team Dinner");

      // Verify submit button is "Save Changes"
      const submitBtn = screen.getByRole("button", { name: /save changes/i });
      expect(submitBtn).toBeDefined();

      // Change description
      fireEvent.change(descInput, { target: { value: "Updated Team Dinner" } });

      const form = document.querySelector("form")!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(
          "group-100",
          "exp-1",
          expect.objectContaining({
            version: 1,
            description: "Updated Team Dinner",
          }),
        );
      });
    });

    it("displays version conflict warning when server reports 409 VERSION_CONFLICT", async () => {
      vi.spyOn(expensesApi, "updateExpense").mockRejectedValue(
        new ApiError({
          message: "Expense was changed by another request; reload it before retrying",
          status: 409,
          kind: "conflict",
          code: "VERSION_CONFLICT",
          details: { currentVersion: 2 },
        }),
      );

      const onReload = vi.fn();
      renderWithProviders(
        <AddExpenseDialog
          groupId="group-100"
          currency="USD"
          members={mockMembers}
          open={true}
          onOpenChange={vi.fn()}
          initialExpense={mockExpense}
          onReloadExpense={onReload}
        />,
      );

      const form = document.querySelector("form")!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(
          screen.getByText(/version conflict detected/i),
        ).toBeDefined();
        expect(
          screen.getByText(/latest server version: v2 \(editing v1\)/i),
        ).toBeDefined();
      });

      // Reload button triggers callback
      const reloadBtn = screen.getByRole("button", { name: /reload latest version/i });
      fireEvent.click(reloadBtn);
      expect(onReload).toHaveBeenCalled();
    });
  });

  describe("4. Revision History", () => {
    it("renders formatted chronological revisions without raw JSON", async () => {
      vi.spyOn(expensesApi, "listExpenseRevisions").mockResolvedValue({
        message: "Success",
        data: mockRevisions,
      });

      renderWithProviders(
        <ExpenseRevisionsDialog
          groupId="group-100"
          currency="USD"
          expense={mockExpense}
          members={mockMembers}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/audit history: team dinner/i)).toBeDefined();
        expect(screen.getByText("v2")).toBeDefined();
        expect(screen.getByText("Updated")).toBeDefined();
        expect(screen.getByText("$80.00")).toBeDefined();
        expect(screen.getByText("v1")).toBeDefined();
        expect(screen.getByText("Created")).toBeDefined();
        expect(screen.getByText("$60.00")).toBeDefined();
      });

      // Ensure no raw JSON artifacts are visible as main content
      expect(screen.queryByText(/\{"revision":/i)).toBeNull();
    });
  });

  describe("5. Query Invalidation", () => {
    it("invalidates list and details queries after successful update", async () => {
      vi.spyOn(expensesApi, "updateExpense").mockResolvedValue({
        message: "Success",
        data: { ...mockExpense, version: 2 },
      });

      const { queryClient } = renderWithProviders(
        <AddExpenseDialog
          groupId="group-100"
          currency="USD"
          members={mockMembers}
          open={true}
          onOpenChange={vi.fn()}
          initialExpense={mockExpense}
        />,
      );

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const form = document.querySelector("form")!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: expensesKeys.list("group-100"),
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: expensesKeys.detail("group-100", "exp-1"),
        });
      });
    });
  });
});
