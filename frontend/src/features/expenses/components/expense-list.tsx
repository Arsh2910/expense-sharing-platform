import * as React from "react";
import {
  Car,
  ChevronRight,
  Film,
  Home,
  Loader2,
  Plus,
  Receipt,
  ShoppingBag,
  Utensils,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { GroupMember } from "@/types/api";
import { formatDate } from "@/lib/utils/format";
import { useExpensesInfiniteQuery } from "../expenses.queries";
import type { ExpenseItem } from "../expenses.types";
import { formatMoneyDisplay } from "../money";

export interface ExpenseListProps {
  groupId: string;
  currency: string;
  members: GroupMember[];
  isArchived?: boolean;
  onAddExpense: () => void;
  onSelectExpense: (expense: ExpenseItem) => void;
}

function getCategoryIcon(category?: string | null) {
  switch (category?.toUpperCase()) {
    case "FOOD":
      return Utensils;
    case "TRANSPORTATION":
      return Car;
    case "ACCOMMODATION":
    case "HOUSING":
      return Home;
    case "ENTERTAINMENT":
      return Film;
    case "SHOPPING":
      return ShoppingBag;
    case "UTILITIES":
      return Zap;
    default:
      return Receipt;
  }
}

export function ExpenseList({
  groupId,
  currency,
  members,
  isArchived = false,
  onAddExpense,
  onSelectExpense,
}: ExpenseListProps) {
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useExpensesInfiniteQuery(groupId, 20);

  const memberNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => {
      map.set(
        m.user.id,
        m.user.displayName || (m.user.username ? `@${m.user.username}` : "Member"),
      );
    });
    return map;
  }, [members]);

  const getMemberName = (userId: string) =>
    memberNameMap.get(userId) ?? `User ${userId.slice(0, 8)}`;

  // Flatten paginated items
  const expenses: ExpenseItem[] = React.useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.data);
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50/50 p-6 text-center">
        <CardContent className="space-y-3 pt-0">
          <p className="text-sm text-red-700">
            {error instanceof Error
              ? error.message
              : "Failed to load expenses for this group."}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (expenses.length === 0) {
    return (
      <Card className="border-dashed border-[#D6D3CD] bg-[#FAF8F5]/40 text-center py-12 px-4">
        <CardContent className="space-y-4 max-w-md mx-auto pt-0">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-[#0F766E]">
            <Receipt className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-[#18181B]">
              No expenses recorded yet
            </h3>
            <p className="text-xs text-[#71717A] leading-relaxed">
              {isArchived
                ? "This group is archived and has no historical expenses."
                : `Record shared expenses in ${currency} and distribute costs fairly among group members.`}
            </p>
          </div>
          {!isArchived && (
            <Button onClick={onAddExpense}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add your first expense
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-1">
        <p className="text-xs font-medium text-[#71717A]">
          Showing {expenses.length} expense{expenses.length === 1 ? "" : "s"}
        </p>
        {!isArchived && (
          <Button size="sm" onClick={onAddExpense} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add expense
          </Button>
        )}
      </div>

      {/* Expense List */}
      <div className="space-y-2.5">
        {expenses.map((expense) => {
          const Icon = getCategoryIcon(expense.category);

          // Payer summary text
          let payerSummary = "";
          if (expense.payers.length === 1) {
            const single = expense.payers[0];
            payerSummary = `Paid by ${getMemberName(single.userId)}`;
          } else {
            payerSummary = `Paid by ${expense.payers.length} members`;
          }

          const creatorName = getMemberName(expense.createdById);

          return (
            <div
              key={expense.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectExpense(expense)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectExpense(expense);
                }
              }}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-[#E7E5E0] bg-white hover:border-[#0F766E]/50 hover:shadow-xs transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0F766E]"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-10 w-10 shrink-0 rounded-lg bg-[#FAF8F5] border border-[#E7E5E0] flex items-center justify-center text-[#0F766E] group-hover:bg-teal-50 transition-colors">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-[#18181B] truncate group-hover:text-[#0F766E] transition-colors">
                      {expense.description}
                    </p>
                    {expense.category && (
                      <Badge variant="outline" className="text-[10px] bg-[#FAF8F5]">
                        {expense.category}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] font-mono">
                      v{expense.version}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#71717A]">
                    <span>{formatDate(expense.expenseDate)}</span>
                    <span>•</span>
                    <span>{payerSummary}</span>
                    <span>•</span>
                    <span className="font-medium text-[#52525B]">
                      {expense.splits.length} participant{expense.splits.length === 1 ? "" : "s"}
                    </span>
                    <span>•</span>
                    <span className="text-[#A1A1AA]">Created by {creatorName}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center shrink-0">
                <div className="text-right">
                  <p className="text-sm sm:text-base font-bold text-[#18181B] tabular-nums">
                    {formatMoneyDisplay(expense.totalMinor, currency)}
                  </p>
                  <p className="text-[11px] font-medium text-[#0F766E]">
                    {expense.splitType.toLowerCase()} split
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#A1A1AA] group-hover:text-[#0F766E] group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Load More */}
      {hasNextPage && (
        <div className="pt-3 text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full sm:w-auto"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Loading more...
              </>
            ) : (
              "Load more expenses"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

