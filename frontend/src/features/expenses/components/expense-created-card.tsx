import {
  Calendar,
  CheckCircle2,
  PieChart,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { GroupMember } from "@/types/api";
import { formatDate } from "@/lib/utils/format";
import type { CreatedExpense } from "../expenses.types";
import { formatMoneyDisplay } from "../money";

export interface ExpenseCreatedCardProps {
  expense: CreatedExpense;
  members: GroupMember[];
  onAddAnother: () => void;
}

export function ExpenseCreatedCard({
  expense,
  members,
  onAddAnother,
}: ExpenseCreatedCardProps) {
  const memberMap = new Map(members.map((m) => [m.user.id, m]));
  const totalMinor = BigInt(expense.totalMinor);

  return (
    <Card className="border-teal-200 bg-teal-50/20 shadow-xs">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-teal-100 text-accent">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <CardTitle className="text-base text-ink">
              {expense.description}
            </CardTitle>
            <Badge variant="outline" className="text-xs font-mono">
              {expense.splitType}
            </Badge>
          </div>
          <CardDescription className="text-xs text-ink-secondary flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-ink-muted" />
              {formatDate(expense.expenseDate)}
            </span>
            {expense.category && (
              <span>• Category: <strong className="font-medium text-ink">{expense.category}</strong></span>
            )}
            <span>• Recorded by <strong className="font-medium text-ink">{memberMap.get(expense.createdById)?.user.displayName ?? "You"}</strong></span>
          </CardDescription>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center">
          <div className="text-right">
            <span className="text-[10px] text-ink-muted uppercase font-semibold">
              Total Amount
            </span>
            <p className="font-mono text-lg font-bold text-accent tabular-nums">
              {formatMoneyDisplay(totalMinor, expense.currency)}
            </p>
          </div>
          <Button size="sm" onClick={onAddAnother} className="text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Another
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-teal-100/80 text-xs">
          {/* Payers */}
          <div className="bg-surface p-3 rounded-lg border border-border-subtle space-y-2">
            <p className="font-semibold text-xs text-ink flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-accent" />
              Paid by ({expense.payers.length})
            </p>
            <ul className="divide-y divide-surface-subtle">
              {expense.payers.map((payer) => {
                const member = memberMap.get(payer.userId);
                return (
                  <li
                    key={payer.userId}
                    className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar
                        name={member?.user.displayName ?? "User"}
                        size="sm"
                        tone="neutral"
                      />
                      <span className="truncate text-ink">
                        {member?.user.displayName ?? payer.userId}
                      </span>
                    </div>
                    <span className="font-mono font-medium text-ink tabular-nums">
                      {formatMoneyDisplay(
                        BigInt(payer.amountMinor),
                        expense.currency,
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Splits */}
          <div className="bg-surface p-3 rounded-lg border border-border-subtle space-y-2">
            <p className="font-semibold text-xs text-ink flex items-center gap-1.5">
              <PieChart className="h-3.5 w-3.5 text-accent" />
              Split Allocations ({expense.splits.length})
            </p>
            <ul className="divide-y divide-surface-subtle max-h-48 overflow-y-auto pr-1">
              {expense.splits.map((split) => {
                const member = memberMap.get(split.userId);
                return (
                  <li
                    key={split.userId}
                    className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar
                        name={member?.user.displayName ?? "User"}
                        size="sm"
                        tone="neutral"
                      />
                      <span className="truncate text-ink">
                        {member?.user.displayName ?? split.userId}
                      </span>
                    </div>
                    <span className="font-mono font-medium text-accent tabular-nums">
                      {formatMoneyDisplay(
                        BigInt(split.amountMinor),
                        expense.currency,
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="mt-3 rounded-lg bg-surface-subtle p-2.5 text-[11px] text-ink-muted flex items-center gap-2">
          <Receipt className="h-4 w-4 shrink-0 text-accent" />
          <span>
            Expense has been atomically recorded with revision 1 in the group ledger.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

