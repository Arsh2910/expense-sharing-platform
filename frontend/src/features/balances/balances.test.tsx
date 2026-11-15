import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "@/features/auth/auth-context-value";
import type { GroupMember, PublicUser } from "@/types/api";
import { balancesApi } from "./balances.api";
import type { GroupBalancesData } from "./balances.types";
import { BalancesView } from "./components/balances-view";

const mockUser: PublicUser = {
  id: "user-1",
  email: "user1@example.com",
  username: "userone",
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
    user: { id: "user-1", username: "userone", displayName: "Alice" },
  },
  {
    id: "m-2",
    role: "MEMBER",
    joinedAt: "2026-11-02T00:00:00Z",
    user: { id: "user-2", username: "usertwo", displayName: "Bob" },
  },
];

function renderWithAuth(ui: React.ReactElement, currentUser = mockUser) {
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
    </QueryClientProvider>,
  );
}

describe("Group Balances Frontend Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("displays 'You are owed' when current user has positive balance (RECEIVES)", async () => {
    const mockData: GroupBalancesData = {
      currency: "USD",
      members: [
        {
          userId: "user-1",
          username: "userone",
          displayName: "Alice",
          role: "OWNER",
          isActiveMember: true,
          balanceMinor: 2500,
          direction: "RECEIVES",
          updatedAt: "2026-11-15T00:00:00Z",
        },
        {
          userId: "user-2",
          username: "usertwo",
          displayName: "Bob",
          role: "MEMBER",
          isActiveMember: true,
          balanceMinor: -2500,
          direction: "OWES",
          updatedAt: "2026-11-15T00:00:00Z",
        },
      ],
    };

    vi.spyOn(balancesApi, "getGroupBalances").mockResolvedValue({
      message: "Success",
      data: mockData,
    });

    renderWithAuth(<BalancesView groupId="group-1" members={mockMembers} />);

    await waitFor(() => {
      expect(screen.getByText("Your Net Position")).toBeDefined();
      expect(screen.getByText("You are owed")).toBeDefined();
      expect(screen.getAllByText("+$25.00").length).toBeGreaterThan(0);
    });

    // Check member rows
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Bob")).toBeDefined();
    expect(screen.getAllByText("+$25.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-$25.00").length).toBeGreaterThan(0);
  });

  it("displays 'You owe' when current user has negative balance (OWES)", async () => {
    const bobUser: PublicUser = {
      ...mockUser,
      id: "user-2",
      displayName: "Bob",
      username: "usertwo",
    };

    const mockData: GroupBalancesData = {
      currency: "USD",
      members: [
        {
          userId: "user-1",
          username: "userone",
          displayName: "Alice",
          role: "OWNER",
          isActiveMember: true,
          balanceMinor: 1500,
          direction: "RECEIVES",
          updatedAt: "2026-11-15T00:00:00Z",
        },
        {
          userId: "user-2",
          username: "usertwo",
          displayName: "Bob",
          role: "MEMBER",
          isActiveMember: true,
          balanceMinor: -1500,
          direction: "OWES",
          updatedAt: "2026-11-15T00:00:00Z",
        },
      ],
    };

    vi.spyOn(balancesApi, "getGroupBalances").mockResolvedValue({
      message: "Success",
      data: mockData,
    });

    renderWithAuth(
      <BalancesView groupId="group-1" members={mockMembers} />,
      bobUser,
    );

    await waitFor(() => {
      expect(screen.getByText("Your Net Position")).toBeDefined();
      expect(screen.getByText("You owe")).toBeDefined();
      expect(screen.getAllByText("-$15.00").length).toBeGreaterThan(0);
    });
  });

  it("displays 'Settled up' when current user has zero balance (SQUARE)", async () => {
    const mockData: GroupBalancesData = {
      currency: "USD",
      members: [
        {
          userId: "user-1",
          username: "userone",
          displayName: "Alice",
          role: "OWNER",
          isActiveMember: true,
          balanceMinor: 0,
          direction: "SQUARE",
          updatedAt: "2026-11-15T00:00:00Z",
        },
      ],
    };

    vi.spyOn(balancesApi, "getGroupBalances").mockResolvedValue({
      message: "Success",
      data: mockData,
    });

    renderWithAuth(<BalancesView groupId="group-1" members={mockMembers} />);

    await waitFor(() => {
      expect(screen.getByText("Settled up")).toBeDefined();
      expect(screen.getAllByText("$0.00").length).toBeGreaterThan(0);
    });
  });

  it("displays former members in a separate historical section with inactive badge", async () => {
    const mockData: GroupBalancesData = {
      currency: "USD",
      members: [
        {
          userId: "user-1",
          username: "userone",
          displayName: "Alice",
          role: "OWNER",
          isActiveMember: true,
          balanceMinor: 1000,
          direction: "RECEIVES",
          updatedAt: "2026-11-15T00:00:00Z",
        },
        {
          userId: "user-old",
          username: "departed",
          displayName: "Charlie",
          role: null,
          isActiveMember: false,
          balanceMinor: -1000,
          direction: "OWES",
          updatedAt: "2026-11-10T00:00:00Z",
        },
      ],
    };

    vi.spyOn(balancesApi, "getGroupBalances").mockResolvedValue({
      message: "Success",
      data: mockData,
    });

    renderWithAuth(<BalancesView groupId="group-1" members={mockMembers} />);

    await waitFor(() => {
      expect(
        screen.getByText(/former members \(historical balances\)/i),
      ).toBeDefined();
      expect(screen.getByText("Charlie")).toBeDefined();
      expect(screen.getByText("Former Member")).toBeDefined();
      expect(screen.getByText("-$10.00")).toBeDefined();
    });
  });

  it("displays sign convention explanation", async () => {
    vi.spyOn(balancesApi, "getGroupBalances").mockResolvedValue({
      message: "Success",
      data: {
        currency: "USD",
        members: [],
      },
    });

    renderWithAuth(<BalancesView groupId="group-1" members={mockMembers} />);

    await waitFor(() => {
      expect(screen.getByText(/sign convention:/i)).toBeDefined();
      expect(
        screen.getByText(/positive balances \(\+\) represent money the group owes/i),
      ).toBeDefined();
    });
  });

  it("calls onRecordSettlement when clicking Record settlement or Settle button", async () => {
    const mockData: GroupBalancesData = {
      currency: "USD",
      members: [
        {
          userId: "user-1",
          username: "userone",
          displayName: "Alice",
          role: "OWNER",
          isActiveMember: true,
          balanceMinor: 2500,
          direction: "RECEIVES",
          updatedAt: "2026-11-15T00:00:00Z",
        },
        {
          userId: "user-2",
          username: "usertwo",
          displayName: "Bob",
          role: "MEMBER",
          isActiveMember: true,
          balanceMinor: -2500,
          direction: "OWES",
          updatedAt: "2026-11-15T00:00:00Z",
        },
      ],
    };

    vi.spyOn(balancesApi, "getGroupBalances").mockResolvedValue({
      message: "Success",
      data: mockData,
    });

    const onRecordSettlement = vi.fn();

    renderWithAuth(
      <BalancesView
        groupId="group-1"
        members={mockMembers}
        onRecordSettlement={onRecordSettlement}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /record settlement/i })).toBeDefined();
    });

    screen.getByRole("button", { name: /record settlement/i }).click();
    expect(onRecordSettlement).toHaveBeenCalledWith();

    const settleBtn = screen.getByRole("button", { name: "Settle" });
    expect(settleBtn).toBeDefined();
    settleBtn.click();
    expect(onRecordSettlement).toHaveBeenCalledWith("user-2");
  });

  it("hides record settlement buttons when group is archived", async () => {
    const mockData: GroupBalancesData = {
      currency: "USD",
      members: [
        {
          userId: "user-1",
          username: "userone",
          displayName: "Alice",
          role: "OWNER",
          isActiveMember: true,
          balanceMinor: 2500,
          direction: "RECEIVES",
          updatedAt: "2026-11-15T00:00:00Z",
        },
        {
          userId: "user-2",
          username: "usertwo",
          displayName: "Bob",
          role: "MEMBER",
          isActiveMember: true,
          balanceMinor: -2500,
          direction: "OWES",
          updatedAt: "2026-11-15T00:00:00Z",
        },
      ],
    };

    vi.spyOn(balancesApi, "getGroupBalances").mockResolvedValue({
      message: "Success",
      data: mockData,
    });

    const onRecordSettlement = vi.fn();

    renderWithAuth(
      <BalancesView
        groupId="group-1"
        members={mockMembers}
        isArchived={true}
        onRecordSettlement={onRecordSettlement}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeDefined();
    });

    expect(screen.queryByRole("button", { name: /record settlement/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /settle/i })).toBeNull();
  });
});
