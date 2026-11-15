import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastContext } from "@/components/ui/toast-context";
import { AuthContext } from "@/features/auth/auth-context-value";
import { balancesApi } from "@/features/balances/balances.api";
import type { GroupBalancesData } from "@/features/balances/balances.types";
import type { GroupMember, PublicUser } from "@/types/api";
import { RecordSettlementDialog } from "./components/record-settlement-dialog";
import { SettlementsView } from "./components/settlements-view";
import { settlementsApi } from "./settlements.api";
import type { Settlement } from "./settlements.types";

const mockUser: PublicUser = {
  id: "user-1",
  email: "user1@example.com",
  username: "alice",
  displayName: "Alice",
  status: "ACTIVE",
  emailVerifiedAt: "2026-11-01T00:00:00Z",
  createdAt: "2026-11-01T00:00:00Z",
};

const mockMembers: GroupMember[] = [
  {
    id: "m-1",
    role: "OWNER",
    joinedAt: "2026-11-01T00:00:00Z",
    user: { id: "user-1", username: "alice", displayName: "Alice" },
  },
  {
    id: "m-2",
    role: "MEMBER",
    joinedAt: "2026-11-02T00:00:00Z",
    user: { id: "user-2", username: "bob", displayName: "Bob" },
  },
  {
    id: "m-3",
    role: "MEMBER",
    joinedAt: "2026-11-03T00:00:00Z",
    user: { id: "user-3", username: "charlie", displayName: "Charlie" },
  },
];

const mockBalances: GroupBalancesData = {
  currency: "USD",
  members: [
    {
      userId: "user-1",
      username: "alice",
      displayName: "Alice",
      role: "OWNER",
      isActiveMember: true,
      balanceMinor: -2500,
      direction: "OWES",
      updatedAt: "2026-11-15T00:00:00Z",
    },
    {
      userId: "user-2",
      username: "bob",
      displayName: "Bob",
      role: "MEMBER",
      isActiveMember: true,
      balanceMinor: 2500,
      direction: "RECEIVES",
      updatedAt: "2026-11-15T00:00:00Z",
    },
  ],
};

function renderWithClient(
  ui: React.ReactElement,
  currentUser = mockUser,
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  }),
) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastContext.Provider value={{ toast: vi.fn() }}>
          <AuthContext.Provider
            value={{
              user: currentUser,
              isLoading: false,
              isError: false,
              error: null,
              isAuthenticated: true,
              refetchSession: vi.fn(),
            }}
          >
            {ui}
          </AuthContext.Provider>
        </ToastContext.Provider>
      </QueryClientProvider>,
    ),
  };
}

describe("Settlements Frontend Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("SettlementsView Component", () => {
    it("renders empty state when no settlements exist", async () => {
      vi.spyOn(settlementsApi, "listSettlements").mockResolvedValue({
        message: "Success",
        data: [],
      });

      renderWithClient(
        <SettlementsView
          groupId="group-1"
          currency="USD"
          members={mockMembers}
          onRecordSettlement={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("No settlements recorded yet")).toBeDefined();
        expect(
          screen.getByText(/record direct payments here/i),
        ).toBeDefined();
      });
    });

    it("renders settlement history with payer, recipient, amount, date and note", async () => {
      const mockSettlements: Settlement[] = [
        {
          id: "set-1",
          groupId: "group-1",
          fromUserId: "user-1",
          toUserId: "user-2",
          amountMinor: 2500,
          currency: "USD",
          settledOn: "2026-11-15",
          note: "Split dinner payback",
          createdById: "user-1",
          reversesId: null,
          createdAt: "2026-11-15T12:00:00Z",
        },
      ];

      vi.spyOn(settlementsApi, "listSettlements").mockResolvedValue({
        message: "Success",
        data: mockSettlements,
      });

      renderWithClient(
        <SettlementsView
          groupId="group-1"
          currency="USD"
          members={mockMembers}
          onRecordSettlement={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/"Split dinner payback"/i)).toBeDefined();
        expect(screen.getByText("$25.00")).toBeDefined();
        expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Bob").length).toBeGreaterThan(0);
        expect(screen.getByRole("button", { name: /reverse/i })).toBeDefined();
      });
    });

    it("identifies reversed settlements and prevents re-reversing", async () => {
      const mockSettlements: Settlement[] = [
        {
          id: "set-orig",
          groupId: "group-1",
          fromUserId: "user-1",
          toUserId: "user-2",
          amountMinor: 1000,
          currency: "USD",
          settledOn: "2026-11-14",
          note: "Wrong amount",
          createdById: "user-1",
          reversesId: null,
          createdAt: "2026-11-14T10:00:00Z",
        },
        {
          id: "set-rev",
          groupId: "group-1",
          fromUserId: "user-2",
          toUserId: "user-1",
          amountMinor: 1000,
          currency: "USD",
          settledOn: "2026-11-15",
          note: "Reversal of settlement set-orig",
          createdById: "user-1",
          reversesId: "set-orig",
          createdAt: "2026-11-15T11:00:00Z",
        },
      ];

      vi.spyOn(settlementsApi, "listSettlements").mockResolvedValue({
        message: "Success",
        data: mockSettlements,
      });

      renderWithClient(
        <SettlementsView
          groupId="group-1"
          currency="USD"
          members={mockMembers}
          onRecordSettlement={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Reversed")).toBeDefined();
        expect(screen.getByText("Reversal")).toBeDefined();
      });

      // No Reverse buttons should be shown for already reversed or reversal settlements
      expect(screen.queryByRole("button", { name: /^reverse$/i })).toBeNull();
    });

    it("confirms and executes settlement reversal", async () => {
      const mockSettlements: Settlement[] = [
        {
          id: "set-1",
          groupId: "group-1",
          fromUserId: "user-1",
          toUserId: "user-2",
          amountMinor: 3000,
          currency: "USD",
          settledOn: "2026-11-15",
          note: "Accidental payment",
          createdById: "user-1",
          reversesId: null,
          createdAt: "2026-11-15T12:00:00Z",
        },
      ];

      vi.spyOn(settlementsApi, "listSettlements").mockResolvedValue({
        message: "Success",
        data: mockSettlements,
      });

      const reverseSpy = vi
        .spyOn(settlementsApi, "reverseSettlement")
        .mockResolvedValue({
          message: "Reversal created",
          data: {
            ...mockSettlements[0],
            id: "set-rev",
            fromUserId: "user-2",
            toUserId: "user-1",
            reversesId: "set-1",
            note: "Reversal of settlement set-1",
          },
        });

      renderWithClient(
        <SettlementsView
          groupId="group-1"
          currency="USD"
          members={mockMembers}
          onRecordSettlement={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /reverse/i })).toBeDefined();
      });

      // Click reverse button to open confirmation dialog
      fireEvent.click(screen.getByRole("button", { name: /reverse/i }));

      // Check confirmation dialog contents
      await waitFor(() => {
        expect(screen.getByText(/reverse settlement\?/i)).toBeDefined();
        expect(
          screen.getByText(/append an opposite compensation settlement in the ledger/i),
        ).toBeDefined();
      });

      // Confirm reversal
      const confirmButton = screen.getByRole("button", {
        name: "Reverse Settlement",
      });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(reverseSpy).toHaveBeenCalledWith("group-1", "set-1");
      });
    });

    it("disables settlement actions when group is archived", async () => {
      const mockSettlements: Settlement[] = [
        {
          id: "set-1",
          groupId: "group-1",
          fromUserId: "user-1",
          toUserId: "user-2",
          amountMinor: 2500,
          currency: "USD",
          settledOn: "2026-11-15",
          note: "Old payment",
          createdById: "user-1",
          reversesId: null,
          createdAt: "2026-11-15T12:00:00Z",
        },
      ];

      vi.spyOn(settlementsApi, "listSettlements").mockResolvedValue({
        message: "Success",
        data: mockSettlements,
      });

      renderWithClient(
        <SettlementsView
          groupId="group-1"
          currency="USD"
          members={mockMembers}
          isArchived={true}
          onRecordSettlement={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText(/this group is archived\. settlements cannot be recorded or reversed\./i),
        ).toBeDefined();
      });

      // Record settlement button is not rendered
      expect(
        screen.queryByRole("button", { name: /record settlement/i }),
      ).toBeNull();

      // Reverse button is not rendered
      expect(screen.queryByRole("button", { name: /reverse/i })).toBeNull();
    });
  });

  describe("RecordSettlementDialog Component", () => {
    it("validates that payer and recipient cannot be the same user", async () => {
      vi.spyOn(balancesApi, "getGroupBalances").mockResolvedValue({
        message: "Success",
        data: mockBalances,
      });

      renderWithClient(
        <RecordSettlementDialog
          groupId="group-1"
          currency="USD"
          members={mockMembers}
          open={true}
          onOpenChange={vi.fn()}
          defaultPayerId="user-1"
          defaultRecipientId="user-2"
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/payer/i)).toBeDefined();
      });

      const payerSelect = screen.getByLabelText(/payer/i);
      fireEvent.change(payerSelect, { target: { value: "user-2" } });

      await waitFor(() => {
        expect(
          screen.getByText("Payer and recipient must be different group members."),
        ).toBeDefined();
      });

      const submitButton = screen.getByRole("button", {
        name: /record settlement/i,
      });
      expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    });

    it("validates positive amount and blocks submit when amount is 0 or negative", async () => {
      vi.spyOn(balancesApi, "getGroupBalances").mockResolvedValue({
        message: "Success",
        data: mockBalances,
      });

      renderWithClient(
        <RecordSettlementDialog
          groupId="group-1"
          currency="USD"
          members={mockMembers}
          open={true}
          onOpenChange={vi.fn()}
          defaultPayerId="user-1"
          defaultRecipientId="user-2"
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/amount \(usd\)/i)).toBeDefined();
      });

      const amountInput = screen.getByLabelText(
        /amount \(usd\)/i,
      ) as HTMLInputElement;

      fireEvent.change(amountInput, { target: { value: "0" } });

      const submitButton = screen.getByRole("button", {
        name: /record settlement/i,
      });
      expect((submitButton as HTMLButtonElement).disabled).toBe(true);
      expect(
        screen.getByText("Settlement amount must be a valid positive amount."),
      ).toBeDefined();
    });

    it("displays overpayment notice when settlement amount exceeds balance", async () => {
      vi.spyOn(balancesApi, "getGroupBalances").mockResolvedValue({
        message: "Success",
        data: mockBalances,
      });

      renderWithClient(
        <RecordSettlementDialog
          groupId="group-1"
          currency="USD"
          members={mockMembers}
          open={true}
          onOpenChange={vi.fn()}
          defaultPayerId="user-1"
          defaultRecipientId="user-2"
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/amount \(usd\)/i)).toBeDefined();
      });

      // Payer debt is $25.00; enter $50.00 to trigger overpayment notice
      const amountInput = screen.getByLabelText(
        /amount \(usd\)/i,
      ) as HTMLInputElement;
      fireEvent.change(amountInput, { target: { value: "50.00" } });

      await waitFor(() => {
        expect(
          screen.getByText(/notice: settlement amount exceeds outstanding debt/i),
        ).toBeDefined();
      });
    });

    it("submits settlement and disables button while pending", async () => {
      vi.spyOn(balancesApi, "getGroupBalances").mockResolvedValue({
        message: "Success",
        data: mockBalances,
      });

      let resolveCreate: (value: unknown) => void;
      const createPromise = new Promise((resolve) => {
        resolveCreate = resolve;
      });

      const createSpy = vi
        .spyOn(settlementsApi, "createSettlement")
        .mockReturnValue(createPromise as any);

      const onOpenChange = vi.fn();

      renderWithClient(
        <RecordSettlementDialog
          groupId="group-1"
          currency="USD"
          members={mockMembers}
          open={true}
          onOpenChange={onOpenChange}
          defaultPayerId="user-1"
          defaultRecipientId="user-2"
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/amount \(usd\)/i)).toBeDefined();
      });

      const amountInput = screen.getByLabelText(
        /amount \(usd\)/i,
      ) as HTMLInputElement;
      fireEvent.change(amountInput, { target: { value: "25.00" } });

      const noteInput = screen.getByLabelText(/note/i) as HTMLInputElement;
      fireEvent.change(noteInput, { target: { value: "Cash paid" } });

      const submitButton = screen.getByRole("button", {
        name: /record settlement/i,
      });
      expect((submitButton as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(submitButton);

      // While pending, submit button should be disabled
      await waitFor(() => {
        expect((submitButton as HTMLButtonElement).disabled).toBe(true);
      });

      expect(createSpy).toHaveBeenCalledWith("group-1", {
        fromUserId: "user-1",
        toUserId: "user-2",
        amount: "25.00",
        settledOn: expect.any(String),
        note: "Cash paid",
      });

      // Resolve mutation
      resolveCreate!({
        message: "Settlement created",
        data: {
          id: "set-new",
          groupId: "group-1",
          fromUserId: "user-1",
          toUserId: "user-2",
          amountMinor: 2500,
          currency: "USD",
          settledOn: "2026-11-15",
          note: "Cash paid",
          createdById: "user-1",
          reversesId: null,
          createdAt: "2026-11-15T12:00:00Z",
        },
      });

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
