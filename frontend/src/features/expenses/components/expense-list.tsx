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
      <Card className="border-dashed border-border-strong bg-surface-subtle/40 text-center py-12 px-4">
        <CardContent className="space-y-4 max-w-md mx-auto pt-0">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-accent">
            <Receipt className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-ink">
              No expenses recorded yet
            </h3>
            <p className="text-xs text-ink-muted leading-relaxed">
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
        <p className="text-xs font-medium text-ink-muted">
          Showing {expenses.length} expense{expenses.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Expense List */}
      <ul className="rounded-xl border border-border-subtle bg-surface divide-y divide-border-subtle">
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

          return (
            <li key={expense.id}>
              <button
                type="button"
                onClick={() => onSelectExpense(expense)}
                className="group grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_fit-content(45%)_auto] items-start gap-x-2 gap-y-1 rounded-lg px-3 py-3.5 text-left transition-colors hover:bg-surface-subtle focus-visible:-outline-offset-2 sm:gap-x-3 sm:px-4"
              >
                <span className="row-span-2 grid size-8 place-items-center rounded-md bg-surface-subtle text-accent sm:size-9">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 break-words text-sm font-semibold text-ink group-hover:text-accent">
                  {expense.description}
                </span>
                <span className="text-right text-sm font-semibold text-ink tabular-nums [overflow-wrap:anywhere]">
                  {formatMoneyDisplay(expense.totalMinor, currency)}
                </span>
                <ChevronRight className="mt-0.5 size-4 text-ink-muted group-hover:text-accent" aria-hidden="true" />
                <span className="col-span-3 col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                  <span className="break-words">{payerSummary}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={expense.expenseDate}>{formatDate(expense.expenseDate)}</time>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

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

