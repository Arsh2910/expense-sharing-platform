import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  FileText,
  PieChart,
  Split,
  Wallet,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { GroupMember } from "@/types/api";
import { formatDate } from "@/lib/utils/format";
import type { SplitType } from "../expenses.types";
import { formatMoneyDisplay, parseMajorToMinor } from "../money";
import type { PayerRow } from "./payer-editor";

export interface ExpenseReviewSummaryProps {
  description: string;
  category?: string;
  expenseDate: string;
  currency: string;
  payers: PayerRow[];
  splitType: SplitType;
  computedSplits: Map<string, bigint>;
  members: GroupMember[];
  payerTotalMinor: bigint;
  isReconciled: boolean;
  reconciliationMessage?: string;
}

export function ExpenseReviewSummary({
  description,
  category,
  expenseDate,
  currency,
  payers,
  splitType,
  computedSplits,
  members,
  payerTotalMinor,
  isReconciled,
  reconciliationMessage,
}: ExpenseReviewSummaryProps) {
  const memberMap = new Map(members.map((m) => [m.user.id, m]));

  const splitTypeLabel: Record<SplitType, string> = {
    EQUAL: "Split Equally",
    EXACT: "Exact Amounts",
    PERCENTAGE: "By Percentage",
  };

  return (
    <div className="space-y-4 rounded-xl border border-[#E7E5E0] bg-[#FAF8F5]/60 p-4 text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-[#E7E5E0]">
        <div>
          <h4 className="font-semibold text-xs text-[#18181B] flex items-center gap-1.5 uppercase tracking-wider">
            <FileText className="h-3.5 w-3.5 text-[#0F766E]" />
            4. Expense Review
          </h4>
          {description && (
            <p className="text-xs font-medium text-[#18181B] mt-0.5 truncate max-w-sm">
              &ldquo;{description}&rdquo;
            </p>
          )}
        </div>
        <Badge
          variant={isReconciled ? "accent" : "danger"}
          className="text-[11px]"
        >
          {isReconciled ? (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Reconciled
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Unbalanced
            </span>
          )}
        </Badge>
      </div>

      {reconciliationMessage && (
        <div
          className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${
            isReconciled
              ? "border-teal-200 bg-teal-50 text-[#0F766E]"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {isReconciled ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>{reconciliationMessage}</span>
        </div>
      )}

      {/* Meta Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-[#E7E5E0]">
        <div>
          <span className="text-[10px] text-[#71717A] uppercase font-semibold">
            Total Amount
          </span>
          <p className="font-mono text-sm font-bold text-[#18181B]">
            {formatMoneyDisplay(payerTotalMinor, currency)}
          </p>
        </div>

        <div>
          <span className="text-[10px] text-[#71717A] uppercase font-semibold flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Date
          </span>
          <p className="font-medium text-xs text-[#18181B]">
            {formatDate(expenseDate)}
          </p>
        </div>

        <div>
          <span className="text-[10px] text-[#71717A] uppercase font-semibold flex items-center gap-1">
            <Split className="h-3 w-3" /> Method
          </span>
          <p className="font-medium text-xs text-[#18181B]">
            {splitTypeLabel[splitType]}
          </p>
        </div>

        <div>
          <span className="text-[10px] text-[#71717A] uppercase font-semibold">
            Category
          </span>
          <p className="font-medium text-xs text-[#18181B] truncate">
            {category || "None"}
          </p>
        </div>
      </div>

      {/* Payers & Owed comparison columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Who Paid */}
        <div className="bg-white p-3 rounded-lg border border-[#E7E5E0] space-y-2">
          <p className="font-semibold text-xs text-[#18181B] flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-[#0F766E]" />
            Paid by ({payers.length})
          </p>
          <ul className="divide-y divide-[#F4F3EF]">
            {payers.map((payer, idx) => {
              const member = memberMap.get(payer.userId);
              const minor = parseMajorToMinor(payer.amount, currency) ?? 0n;

              return (
                <li
                  key={idx}
                  className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar
                      name={member?.user.displayName ?? "User"}
                      size="sm"
                      tone="neutral"
                    />
                    <span className="truncate text-[#18181B]">
                      {member?.user.displayName ?? payer.userId}
                    </span>
                  </div>
                  <span className="font-mono font-medium text-[#18181B] tabular-nums shrink-0">
                    {formatMoneyDisplay(minor, currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Who Owes */}
        <div className="bg-white p-3 rounded-lg border border-[#E7E5E0] space-y-2">
          <p className="font-semibold text-xs text-[#18181B] flex items-center gap-1.5">
            <PieChart className="h-3.5 w-3.5 text-[#0F766E]" />
            Shared by ({computedSplits.size})
          </p>
          {computedSplits.size === 0 ? (
            <p className="text-xs text-[#A1A1AA] italic">No participants selected</p>
          ) : (
            <ul className="divide-y divide-[#F4F3EF] max-h-40 overflow-y-auto pr-1">
              {Array.from(computedSplits.entries()).map(([userId, shareMinor]) => {
                const member = memberMap.get(userId);

                return (
                  <li
                    key={userId}
                    className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar
                        name={member?.user.displayName ?? "User"}
                        size="sm"
                        tone="neutral"
                      />
                      <span className="truncate text-[#18181B]">
                        {member?.user.displayName ?? userId}
                      </span>
                    </div>
                    <span className="font-mono font-medium text-[#0F766E] tabular-nums shrink-0">
                      {formatMoneyDisplay(shareMinor, currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
