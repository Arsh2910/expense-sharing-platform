import {
  Calendar,
  Clock,
  History,
  Layers,
  Receipt,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { GroupMember } from "@/types/api";
import { formatDateTime } from "@/lib/utils/format";
import { useExpenseRevisionsQuery } from "../expenses.queries";
import type { ExpenseItem, ExpenseRevision } from "../expenses.types";
import { formatMoneyDisplay, parseMajorToMinor } from "../money";

export interface ExpenseRevisionsDialogProps {
  groupId: string;
  currency: string;
  expense: ExpenseItem | null;
  members: GroupMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExpenseRevisionsDialog({
  groupId,
  currency,
  expense,
  members,
  open,
  onOpenChange,
}: ExpenseRevisionsDialogProps) {
  const { data: revisions, isLoading } = useExpenseRevisionsQuery(
    groupId,
    expense?.id,
    open && Boolean(expense?.id),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-accent" />
            Audit History: {expense?.description ?? "Expense"}
          </DialogTitle>
          <DialogDescription>
            Chronological audit log of revisions, changes, and historical snapshots.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          )}

          {!isLoading && (!revisions || revisions.length === 0) && (
            <div className="text-center py-8 text-sm text-ink-muted">
              No revision history found for this expense.
            </div>
          )}

          {!isLoading && revisions && revisions.length > 0 && (
            <div className="space-y-4">
              {revisions.map((rev: ExpenseRevision) => {
                const isCurrent = rev.revision === expense?.version;
                const changeType = rev.changes.type;
                const authorName = getMemberName(rev.createdById);

                const snapshotAmountMinor =
                  parseMajorToMinor(rev.snapshot.amount, currency) ??
                  BigInt(rev.snapshot.amount || "0");

                return (
                  <Card
                    key={rev.revision}
                    className={`border ${
                      isCurrent
                        ? "border-accent/40 bg-surface-subtle/60"
                        : "border-border-subtle bg-surface"
                    }`}
                  >
                    <CardHeader className="pb-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            v{rev.revision}
                          </Badge>
                          {changeType === "CREATED" && (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                              Created
                            </Badge>
                          )}
                          {changeType === "UPDATED" && (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                              Updated
                            </Badge>
                          )}
                          {changeType === "DELETED" && (
                            <Badge className="bg-rose-100 text-rose-800 border-rose-200">
                              Deleted
                            </Badge>
                          )}
                          {isCurrent && (
                            <span className="text-[11px] font-semibold text-accent bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                              Current Active Version
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatDateTime(rev.createdAt)}</span>
                        </div>
                      </div>
                      <CardDescription className="text-xs pt-1 flex items-center gap-1 text-ink-secondary">
                        <User className="h-3 w-3 text-ink-muted" />
                        <span>Action by: <strong>{authorName}</strong></span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs space-y-2">
                      <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-surface-subtle/60 border border-border-subtle">
                        <div>
                          <p className="text-[11px] text-ink-muted flex items-center gap-1">
                            <Receipt className="h-3 w-3" />
                            Total Amount
                          </p>
                          <p className="font-semibold text-sm text-ink">
                            {formatMoneyDisplay(snapshotAmountMinor, currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-ink-muted flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Expense Date
                          </p>
                          <p className="font-medium text-ink">
                            {rev.snapshot.expenseDate}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-ink-secondary flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          Split: <span className="font-semibold uppercase">{rev.snapshot.splitType}</span>
                        </p>
                        <div className="text-[11px] text-ink-muted">
                          Payers:{" "}
                          {rev.snapshot.payers
                            .map((p) => {
                              const minor =
                                parseMajorToMinor(p.amount, currency) ??
                                BigInt(p.amount);
                              return `${getMemberName(p.userId)} (${formatMoneyDisplay(minor, currency)})`;
                            })
                            .join(", ")}
                        </div>
                        <div className="text-[11px] text-ink-muted">
                          Participants ({rev.snapshot.splits.length}):{" "}
                          {rev.snapshot.splits
                            .map((s) => getMemberName(s.userId))
                            .join(", ")}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
