import * as React from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Calendar,
  Clock,
  FileText,
  RotateCcw,
  Send,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-context";
import type { GroupMember } from "@/types/api";
import { formatMoneyDisplay } from "@/features/expenses/money";
import { getErrorMessage, isApiError } from "@/lib/api/errors";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import {
  useReverseSettlementMutation,
  useSettlementsQuery,
} from "../settlements.queries";
import type { Settlement } from "../settlements.types";

export interface SettlementsViewProps {
  groupId: string;
  currency: string;
  members: GroupMember[];
  isArchived?: boolean;
  onRecordSettlement: () => void;
}

export function SettlementsView({
  groupId,
  currency,
  members,
  isArchived = false,
  onRecordSettlement,
}: SettlementsViewProps) {
  const { addToast } = useToast();
  const { data: settlements, isLoading, isError, error, refetch } =
    useSettlementsQuery(groupId);

  const reverseMutation = useReverseSettlementMutation(groupId);

  const [settlementToReverse, setSettlementToReverse] =
    React.useState<Settlement | null>(null);
  const [reverseConfirmOpen, setReverseConfirmOpen] = React.useState(false);
  const [reverseError, setReverseError] = React.useState<string | null>(null);

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

  // Find set of settlement IDs that have already been reversed
  const reversedSettlementIds = React.useMemo(() => {
    const set = new Set<string>();
    if (settlements) {
      settlements.forEach((s) => {
        if (s.reversesId) {
          set.add(s.reversesId);
        }
      });
    }
    return set;
  }, [settlements]);

  const handleOpenReverseDialog = (settlement: Settlement) => {
    setReverseError(null);
    setSettlementToReverse(settlement);
    setReverseConfirmOpen(true);
  };

  const handleConfirmReverse = async () => {
    if (!settlementToReverse) return;
    setReverseError(null);

    try {
      await reverseMutation.mutateAsync(settlementToReverse.id);
      addToast({
        title: "Settlement reversed",
        description: `Settlement between ${getMemberName(settlementToReverse.fromUserId)} and ${getMemberName(settlementToReverse.toUserId)} was successfully reversed.`,
        variant: "success",
      });
      setReverseConfirmOpen(false);
      setSettlementToReverse(null);
    } catch (err) {
      if (isApiError(err) && err.status === 409) {
        if (err.code === "ALREADY_REVERSED") {
          setReverseError("This settlement has already been reversed.");
          return;
        }
        if (err.code === "GROUP_ARCHIVED") {
          setReverseError(
            "This group is archived. Settlements cannot be reversed.",
          );
          return;
        }
      }
      setReverseError(getErrorMessage(err, "Failed to reverse settlement."));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
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
              : "Failed to load settlement history for this group."}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!settlements || settlements.length === 0) {
    return (
      <Card className="border-dashed border-[#D6D3CD] bg-[#FAF8F5]/40 text-center py-12 px-4">
        <CardContent className="space-y-4 max-w-md mx-auto pt-0">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-[#0F766E]">
            <ArrowLeftRight className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-[#18181B]">
              No settlements recorded yet
            </h3>
            <p className="text-xs text-[#71717A] leading-relaxed">
              {isArchived
                ? "This group is archived and has no settlement records."
                : `When members pay each other back to settle group debts in ${currency}, record direct payments here.`}
            </p>
          </div>
          {!isArchived && (
            <Button onClick={onRecordSettlement}>
              <Send className="h-4 w-4 mr-1.5" />
              Record settlement
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isArchived && (
        <Alert variant="info">
          This group is archived. Settlements cannot be recorded or reversed.
        </Alert>
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between pb-1">
        <p className="text-xs font-medium text-[#71717A]">
          Showing {settlements.length} settlement
          {settlements.length === 1 ? "" : "s"}
        </p>
        {!isArchived && (
          <Button size="sm" onClick={onRecordSettlement} className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Record settlement
          </Button>
        )}
      </div>

      {/* Settlements List */}
      <div className="space-y-3">
        {settlements.map((settlement) => {
          const isReversal = Boolean(settlement.reversesId);
          const isReversed = reversedSettlementIds.has(settlement.id);
          const payerName = getMemberName(settlement.fromUserId);
          const recipientName = getMemberName(settlement.toUserId);

          return (
            <div
              key={settlement.id}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border transition-all ${
                isReversal
                  ? "bg-purple-50/40 border-purple-200"
                  : isReversed
                    ? "bg-[#FAF8F5]/80 border-[#E7E5E0] opacity-80"
                    : "bg-white border-[#E7E5E0] hover:border-[#0F766E]/40"
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`h-10 w-10 shrink-0 rounded-lg border flex items-center justify-center ${
                    isReversal
                      ? "bg-purple-100 border-purple-200 text-purple-700"
                      : isReversed
                        ? "bg-[#F4F3EF] border-[#E7E5E0] text-[#71717A]"
                        : "bg-teal-50 border-teal-200 text-[#0F766E]"
                  }`}
                >
                  <ArrowLeftRight className="h-5 w-5" />
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-[#18181B]">
                      {payerName}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#71717A] shrink-0" />
                    <span className="font-semibold text-sm text-[#18181B]">
                      {recipientName}
                    </span>

                    {isReversal && (
                      <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">
                        Reversal
                      </Badge>
                    )}
                    {isReversed && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                        Reversed
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#71717A]">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(settlement.settledOn)}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(settlement.createdAt)}
                    </span>
                  </div>

                  {settlement.note && (
                    <p className="text-xs text-[#52525B] flex items-center gap-1 pt-0.5">
                      <FileText className="h-3 w-3 text-[#71717A] shrink-0" />
                      <span className="italic">"{settlement.note}"</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center shrink-0">
                <div className="text-right">
                  <p
                    className={`text-base font-bold tabular-nums ${
                      isReversal
                        ? "text-purple-700"
                        : isReversed
                          ? "text-[#71717A] line-through"
                          : "text-[#0F766E]"
                    }`}
                  >
                    {formatMoneyDisplay(settlement.amountMinor, currency)}
                  </p>
                  <p className="text-[10px] text-[#71717A]">Direct Payment</p>
                </div>

                {!isArchived && !isReversed && !isReversal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenReverseDialog(settlement)}
                    disabled={reverseMutation.isPending}
                    className="text-xs h-8 text-[#71717A] hover:text-rose-700 hover:border-rose-300"
                    title="Reverse this settlement"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reverse
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reverse Confirmation Dialog */}
      {settlementToReverse && (
        <ConfirmDialog
          open={reverseConfirmOpen}
          onOpenChange={setReverseConfirmOpen}
          title="Reverse Settlement?"
          description={`Are you sure you want to reverse this settlement of ${formatMoneyDisplay(settlementToReverse.amountMinor, currency)} from ${getMemberName(settlementToReverse.fromUserId)} to ${getMemberName(settlementToReverse.toUserId)}? This will append an opposite compensation settlement in the ledger without erasing the original record.`}
          confirmLabel={reverseMutation.isPending ? "Reversing..." : "Reverse Settlement"}
          variant="destructive"
          isLoading={reverseMutation.isPending}
          onConfirm={handleConfirmReverse}
        />
      )}

      {reverseError && (
        <Alert variant="error" className="mt-2">
          {reverseError}
        </Alert>
      )}
    </div>
  );
}
