import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { AuthContext } from "@/features/auth/auth-context-value";
import type { GroupMember, PublicUser } from "@/types/api";
import { AddExpenseDialog } from "./components/add-expense-dialog";
import { ExactSplitEditor } from "./components/exact-split-editor";
import { PayerEditor } from "./components/payer-editor";
import { PercentageSplitEditor } from "./components/percentage-split-editor";
import { expensesApi } from "./expenses.api";
import type { CreateExpensePayload } from "./expenses.types";
import { parseMajorToMinor } from "./money";

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
  {
    id: "m-3",
    role: "MEMBER",
    joinedAt: "2026-11-03T00:00:00Z",
    user: { id: "user-3", username: "userthree", displayName: "User Three" },
  },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
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
  );
}

describe("Expense Creation Frontend Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Payer Editor & Total Calculation", () => {
    it("supports adding and removing payer rows", () => {
      let payers = [{ userId: "user-1", amount: "50.00" }];
      const onChange = vi.fn((newPayers) => {
        payers = newPayers;
      });

      const { rerender } = render(
        <PayerEditor
          payers={payers}
          onChange={onChange}
          members={mockMembers}
          currency="USD"
          payerTotalMinor={5000n}
        />,
      );

      // Add payer row
      const addBtn = screen.getByRole("button", { name: /add another payer/i });
      fireEvent.click(addBtn);
      expect(onChange).toHaveBeenCalledWith([
        { userId: "user-1", amount: "50.00" },
        { userId: "user-2", amount: "" },
      ]);

      // Rerender with 2 payers
      rerender(
        <PayerEditor
          payers={[
            { userId: "user-1", amount: "50.00" },
            { userId: "user-2", amount: "25.00" },
          ]}
          onChange={onChange}
          members={mockMembers}
          currency="USD"
          payerTotalMinor={7500n}
        />,
      );

      // Remove second payer
      const removeBtns = screen.getAllByRole("button", {
        name: /remove payer/i,
      });
      expect(removeBtns.length).toBe(2);
      fireEvent.click(removeBtns[1]);
      expect(onChange).toHaveBeenCalledWith([
        { userId: "user-1", amount: "50.00" },
      ]);
    });

    it("prevents selecting duplicate payers", () => {
      render(
        <PayerEditor
          payers={[
            { userId: "user-1", amount: "50.00" },
            { userId: "user-2", amount: "50.00" },
          ]}
          onChange={vi.fn()}
          members={mockMembers}
          currency="USD"
          payerTotalMinor={10000n}
        />,
      );

      const selects = screen.getAllByRole("combobox");
      expect(selects.length).toBe(2);

      // In the second select, user-1 should be disabled
      const options = selects[1].querySelectorAll("option");
      const user1Option = Array.from(options).find(
        (o) => o.value === "user-1",
      );
      expect(user1Option?.disabled).toBe(true);
    });

    it("calculates running payer total in integer minor units without float errors", () => {
      const payer1Minor = parseMajorToMinor("0.10", "USD");
      const payer2Minor = parseMajorToMinor("0.20", "USD");
      const runningSum = payer1Minor! + payer2Minor!;

      // 0.10 + 0.20 in JavaScript float is 0.30000000000000004
      // In minor units it is exactly 30n!
      expect(runningSum).toBe(30n);
    });
  });

  describe("Split Mismatch & Reconciliation", () => {
    it("detects exact split mismatch and remaining difference", () => {
      const participants = [
        { userId: "user-1", amount: "40.00" },
        { userId: "user-2", amount: "50.00" },
      ];

      render(
        <ExactSplitEditor
          participants={participants}
          onChange={vi.fn()}
          members={mockMembers}
          totalMinor={10000n} // $100.00 target
          currency="USD"
        />,
      );

      // $40 + $50 = $90, which is $10 short of $100
      expect(
        screen.getByText(/\$10\.00 remaining to allocate/i),
      ).toBeDefined();
    });

    it("detects percentage split mismatch when total is not 100%", () => {
      const participants = [
        { userId: "user-1", percentage: "40" },
        { userId: "user-2", percentage: "50" },
      ];

      render(
        <PercentageSplitEditor
          participants={participants}
          onChange={vi.fn()}
          members={mockMembers}
          totalMinor={10000n}
          currency="USD"
        />,
      );

      // 40% + 50% = 90%, 10% remaining
      expect(screen.getByText(/10% remaining to assign/i)).toBeDefined();
    });
  });

  describe("Add Expense Dialog Flow & Validation", () => {
    it("rejects future dates and informs the user", () => {
      renderWithProviders(
        <AddExpenseDialog
          groupId="group-123"
          currency="USD"
          members={mockMembers}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      const dateInput = screen.getByLabelText(/expense date/i);
      const tomorrow = new Date(Date.now() + 86400000)
        .toISOString()
        .slice(0, 10);
      fireEvent.change(dateInput, { target: { value: tomorrow } });

      const errorElements = screen.getAllByText(
        /expense date cannot be in the future/i,
      );
      expect(errorElements.length).toBeGreaterThan(0);

      const submitBtn = screen.getByRole("button", {
        name: /submit expense/i,
      });
      expect(submitBtn.hasAttribute("disabled")).toBe(true);
    });

    it("constructs payload and submits when form reconciles", async () => {
      const createSpy = vi.spyOn(expensesApi, "createExpense").mockResolvedValue({
        data: {
          id: "exp-1",
          groupId: "group-123",
          currency: "USD",
          description: "Team Lunch",
          totalMinor: 5000,
          splitType: "EQUAL",
          expenseDate: "2026-11-14",
          version: 1,
          createdById: "user-1",
          createdAt: "2026-11-14T12:00:00Z",
          updatedAt: "2026-11-14T12:00:00Z",
          payers: [{ userId: "user-1", amountMinor: 5000 }],
          splits: [
            { userId: "user-1", amountMinor: 2500 },
            { userId: "user-2", amountMinor: 2500 },
          ],
        },
      });

      renderWithProviders(
        <AddExpenseDialog
          groupId="group-123"
          currency="USD"
          members={mockMembers.slice(0, 2)}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      // Fill description
      const descInput = screen.getByLabelText(/description/i);
      fireEvent.change(descInput, { target: { value: "Team Lunch" } });

      // Fill payer amount
      const amountInputs = screen.getAllByPlaceholderText("0.00");
      fireEvent.change(amountInputs[0], { target: { value: "50.00" } });

      const form = document.querySelector("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith("group-123", {
          description: "Team Lunch",
          category: undefined,
          expenseDate: expect.any(String),
          total: undefined,
          payers: [{ userId: "user-1", amount: "50.00" }],
          split: {
            type: "EQUAL",
            participants: ["user-1", "user-2"],
          },
        } satisfies CreateExpensePayload);
      });
    });

    it("prevents duplicate submissions while request is pending", async () => {
      let resolveApi: (value: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolveApi = resolve;
      });
      vi.spyOn(expensesApi, "createExpense").mockReturnValue(
        delayedPromise as any,
      );

      renderWithProviders(
        <AddExpenseDialog
          groupId="group-123"
          currency="USD"
          members={mockMembers.slice(0, 2)}
          open={true}
          onOpenChange={vi.fn()}
        />,
      );

      const descInput = screen.getByLabelText(/description/i);
      fireEvent.change(descInput, { target: { value: "Dinner" } });

      const amountInputs = screen.getAllByPlaceholderText("0.00");
      fireEvent.change(amountInputs[0], { target: { value: "100.00" } });

      const form = document.querySelector("form")!;
      fireEvent.submit(form);

      // During pending request, the submit button should be disabled
      const submitBtn = screen.getByRole("button", {
        name: /submit expense/i,
      });
      await waitFor(() => {
        expect(submitBtn.hasAttribute("disabled")).toBe(true);
      });

      // Resolve API
      await act(async () => {
        resolveApi!({
          data: {
            id: "exp-2",
            groupId: "group-123",
            currency: "USD",
            description: "Dinner",
            totalMinor: 10000,
            splitType: "EQUAL",
            expenseDate: "2026-11-14",
            version: 1,
            createdById: "user-1",
            createdAt: "2026-11-14T12:00:00Z",
            updatedAt: "2026-11-14T12:00:00Z",
            payers: [{ userId: "user-1", amountMinor: 10000 }],
            splits: [{ userId: "user-1", amountMinor: 10000 }],
          },
        });
      });
    });
  });
});
