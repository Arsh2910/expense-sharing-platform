import * as React from "react";
import {
  AlertTriangle,
  Calendar,
  Clock,
  History,
  Pencil,
  Receipt,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-context";
import type { GroupMember } from "@/types/api";
import { getErrorMessage, isApiError } from "@/lib/api/errors";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import {
  useDeleteExpenseMutation,
  useExpenseDetailsQuery,
} from "../expenses.queries";
import type { ExpenseItem } from "../expenses.types";
import { formatMoneyDisplay, formatPercentageUnits } from "../money";
import { ExpenseRevisionsDialog } from "./expense-revisions-dialog";

export interface ExpenseDetailsDialogProps {
  groupId: string;
  currency: string;
  expenseId: string | null;
  members: GroupMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditExpense?: (expense: ExpenseItem) => void;
  isArchived?: boolean;
}

export function ExpenseDetailsDialog({
  groupId,
  currency,
  expenseId,
  members,
  open,
  onOpenChange,
  onEditExpense,
  isArchived = false,
}: ExpenseDetailsDialogProps) {
  const { addToast } = useToast();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [revisionsOpen, setRevisionsOpen] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const {
    data: expense,
    isLoading,
    error,
  } = useExpenseDetailsQuery(
    groupId,
    expenseId ?? undefined,
    open && Boolean(expenseId),
  );

  const deleteMutation = useDeleteExpenseMutation(
    groupId,
    expense?.id ?? "",
  );

  const memberNameMap = new Map<string, string>();
  members.forEach((m) => {
    memberNameMap.set(
      m.user.id,
      m.user.displayName || (m.user.username ? `@${m.user.username}` : "Member"),
    );
  });

  const getMemberName = (userId: string) =>
    memberNameMap.get(userId) ?? `User ${userId.slice(0, 8)}`;

  const handleDeleteConfirm = async () => {
    if (!expense) return;
    setDeleteError(null);

    try {
      await deleteMutation.mutateAsync({ version: expense.version });
      addToast({
        title: "Expense deleted",
        description: `"${expense.description}" was removed from group balances.`,
        variant: "success",
      });
      setDeleteConfirmOpen(false);
      onOpenChange(false);
    } catch (err) {
      if (isApiError(err) && err.status === 409) {
        if (err.code === "VERSION_CONFLICT") {
          const details = err.details as { currentVersion?: number } | undefined;
          setDeleteError(
            `Version conflict: This expense was modified by another user (Server version v${details?.currentVersion ?? "latest"}). Close and refresh before retrying.`,
          );
          return;
        }
        if (err.code === "GROUP_ARCHIVED") {
          setDeleteError("This group has been archived. Expenses cannot be deleted.");
          return;
        }
      }
      setDeleteError(getErrorMessage(err, "Failed to delete expense"));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          {isLoading && (
            <div className="space-y-4 py-4">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {error && (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm text-red-600 font-medium">
                {getErrorMessage(error, "Failed to load expense details")}
              </p>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}

          {!isLoading && expense && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {expense.category && (
                      <Badge variant="outline" className="text-xs bg-[#F4F3EF]">
                        {expense.category}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs font-mono">
                      v{expense.version}
                    </Badge>
                    <Badge className="bg-teal-100 text-teal-800 border-teal-200 text-xs">
                      {expense.splitType} Split
                    </Badge>
                  </div>
                  <span className="text-xs text-[#71717A] flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(expense.expenseDate)}
                  </span>
                </div>
                <DialogTitle className="text-xl font-bold text-[#18181B] pt-2">
                  {expense.description}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#71717A] flex items-center gap-1.5 pt-1">
                  <User className="h-3 w-3" />
                  Recorded by <strong>{getMemberName(expense.createdById)}</strong>
                </DialogDescription>
              </DialogHeader>

              {/* Total Card */}
              <div className="rounded-xl border border-[#E7E5E0] bg-[#FAF8F5]/80 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#71717A] font-medium">Total Amount</p>
                  <p className="text-2xl font-bold text-[#0F766E] tabular-nums">
                    {formatMoneyDisplay(expense.totalMinor, currency)}
                  </p>
                </div>
                <div className="text-right text-xs text-[#71717A] space-y-0.5">
                  <p>{expense.payers.length} Payer(s)</p>
                  <p>{expense.splits.length} Participant(s)</p>
                </div>
              </div>

              {/* Payers breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-[#52525B] uppercase tracking-wider flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5 text-[#0F766E]" />
                  Who Paid
                </h4>
                <div className="rounded-lg border border-[#E7E5E0] divide-y divide-[#F4F3EF] overflow-hidden">
                  {expense.payers.map((payer) => (
                    <div
                      key={payer.userId}
                      className="flex items-center justify-between p-2.5 bg-white text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={getMemberName(payer.userId)} size="sm" />
                        <span className="font-medium text-[#18181B]">
                          {getMemberName(payer.userId)}
                        </span>
                      </div>
                      <span className="font-semibold text-[#18181B] tabular-nums">
                        {formatMoneyDisplay(payer.amountMinor, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Splits breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-[#52525B] uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-[#0F766E]" />
                  Participant Shares ({expense.splitType})
                </h4>
                <div className="rounded-lg border border-[#E7E5E0] divide-y divide-[#F4F3EF] overflow-hidden">
                  {expense.splits.map((split) => (
                    <div
                      key={split.userId}
                      className="flex items-center justify-between p-2.5 bg-white text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={getMemberName(split.userId)} size="sm" />
                        <span className="font-medium text-[#18181B]">
                          {getMemberName(split.userId)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {split.percentUnits !== null && split.percentUnits !== undefined && (
                          <Badge variant="outline" className="text-[10px]">
                            {formatPercentageUnits(BigInt(split.percentUnits))}%
                          </Badge>
                        )}
                        <span className="font-semibold text-[#18181B] tabular-nums">
                          {formatMoneyDisplay(split.amountMinor, currency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revision history button */}
              <div className="pt-1 flex items-center justify-between text-xs text-[#71717A] border-t border-[#E7E5E0]">
                <div className="flex items-center gap-1 text-[11px]">
                  <Clock className="h-3 w-3" />
                  <span>Last updated {formatDateTime(expense.updatedAt)}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRevisionsOpen(true)}
                  className="text-xs gap-1.5 text-[#0F766E] hover:text-[#0D5E57]"
                >
                  <History className="h-3.5 w-3.5" />
                  Audit History
                </Button>
              </div>

              {isArchived && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    This group is archived. Editing and deleting expenses are disabled.
                  </span>
                </div>
              )}

              {deleteError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {deleteError}
                </div>
              )}

              <DialogFooter className="pt-2 border-t border-[#E7E5E0] flex-col-reverse sm:flex-row gap-2 sm:justify-between">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {!isArchived && (
                    <Button
                      type="button"
                      variant="destructiveOutline"
                      size="sm"
                      onClick={() => setDeleteConfirmOpen(true)}
                      disabled={deleteMutation.isPending}
                      className="w-full sm:w-auto"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Delete
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    className="w-full sm:w-auto"
                  >
                    Close
                  </Button>
                  {!isArchived && onEditExpense && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onOpenChange(false);
                        onEditExpense(expense);
                      }}
                      className="w-full sm:w-auto"
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit Expense
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      {expense && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Expense?"
          description={`Are you sure you want to delete "${expense.description}" (Version ${expense.version})? Deletion removes this expense from active balances, but retains full audit history in the revision ledger.`}
          confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete Expense"}
          variant="destructive"
          isLoading={deleteMutation.isPending}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {/* Audit Revisions Modal */}
      {expense && (
        <ExpenseRevisionsDialog
          groupId={groupId}
          currency={currency}
          expense={expense}
          members={members}
          open={revisionsOpen}
          onOpenChange={setRevisionsOpen}
        />
      )}
    </>
  );
}
