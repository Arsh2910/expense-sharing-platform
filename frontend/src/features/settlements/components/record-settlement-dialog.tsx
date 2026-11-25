import * as React from "react";
import {
  Check,
  Info,
  Scale,
  Send,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-context";
import { useAuth } from "@/hooks/use-auth";
import { localIsoDate } from "@/lib/utils/format";
import type { GroupMember } from "@/types/api";
import { useGroupBalancesQuery } from "@/features/balances/balances.queries";
import {
  formatMoneyDisplay,
  getCurrencyExponent,
  parseMajorToMinor,
} from "@/features/expenses/money";
import { getErrorMessage, isApiError } from "@/lib/api/errors";
import { useCreateSettlementMutation } from "../settlements.queries";
import type { CreateSettlementPayload, Settlement } from "../settlements.types";

export interface RecordSettlementDialogProps {
  groupId: string;
  currency: string;
  members: GroupMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPayerId?: string;
  defaultRecipientId?: string;
  onSettlementRecorded?: (settlement: Settlement) => void;
}

interface RecordSettlementFormProps {
  groupId: string;
  currency: string;
  members: GroupMember[];
  onClose: () => void;
  defaultPayerId?: string;
  defaultRecipientId?: string;
  onSettlementRecorded?: (settlement: Settlement) => void;
}

function RecordSettlementForm({
  groupId,
  currency,
  members,
  onClose,
  defaultPayerId,
  defaultRecipientId,
  onSettlementRecorded,
}: RecordSettlementFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const todayIso = localIsoDate();
  const actorRole = members.find((member) => member.user.id === user?.id)?.role;
  const canRecordForOthers = actorRole === "OWNER" || actorRole === "ADMIN";
  const exponent = getCurrencyExponent(currency);

  const { data: balanceData } = useGroupBalancesQuery(groupId, true);
  const createMutation = useCreateSettlementMutation(groupId);

  const balanceMap = React.useMemo(() => {
    const map = new Map<
      string,
      { balanceMinor: number; direction: "OWES" | "RECEIVES" | "SQUARE" }
    >();
    if (balanceData?.members) {
      balanceData.members.forEach((m) => {
        map.set(m.userId, {
          balanceMinor: m.balanceMinor,
          direction: m.direction,
        });
      });
    }
    return map;
  }, [balanceData]);

  // Initial payer selection logic
  const initialPayer = React.useMemo(() => {
    if (defaultPayerId && members.some((m) => m.user.id === defaultPayerId)) {
      return defaultPayerId;
    }
    if (!canRecordForOthers && actorRole && user && balanceMap.get(user.id)?.direction !== "RECEIVES") {
      return user.id;
    }
    // If current user owes money, default payer to current user
    const currentUserBal = user ? balanceMap.get(user.id) : null;
    if (
      user &&
      currentUserBal?.direction === "OWES" &&
      members.some((m) => m.user.id === user.id)
    ) {
      return user.id;
    }
    // Otherwise member with most negative balance
    let minBal = 0;
    let minUser = members[0]?.user.id ?? "";
    members.forEach((m) => {
      const b = balanceMap.get(m.user.id)?.balanceMinor ?? 0;
      if (b < minBal) {
        minBal = b;
        minUser = m.user.id;
      }
    });
    return minUser;
  }, [defaultPayerId, members, user, balanceMap, canRecordForOthers, actorRole]);

  // Initial recipient selection logic
  const initialRecipient = React.useMemo(() => {
    if (
      defaultRecipientId &&
      defaultRecipientId !== initialPayer &&
      members.some((m) => m.user.id === defaultRecipientId)
    ) {
      return defaultRecipientId;
    }
    if (!canRecordForOthers && user && user.id !== initialPayer) return user.id;
    // Find a member who is owed money (RECEIVES) and is not the payer
    const receiver = members.find(
      (m) =>
        m.user.id !== initialPayer &&
        balanceMap.get(m.user.id)?.direction === "RECEIVES",
    );
    if (receiver) return receiver.user.id;

    // Fallback to first member who is not the payer
    const other = members.find((m) => m.user.id !== initialPayer);
    return other?.user.id ?? "";
  }, [defaultRecipientId, initialPayer, members, balanceMap, canRecordForOthers, user]);

  const [fromUserId, setFromUserId] = React.useState(initialPayer);
  const [toUserId, setToUserId] = React.useState(initialRecipient);
  const [amount, setAmount] = React.useState("");
  const [settledOn, setSettledOn] = React.useState(todayIso);
  const [note, setNote] = React.useState("");
  const [generalError, setGeneralError] = React.useState<string | null>(null);

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

  // Validations
  const parsedAmountMinor = parseMajorToMinor(amount, currency);
  const isAmountPositive =
    parsedAmountMinor !== null && parsedAmountMinor > 0n;
  const isSameUser = fromUserId === toUserId;
  const isFutureDate = settledOn > todayIso;

  let validationMessage: string | undefined;
  if (!fromUserId || !toUserId) {
    validationMessage = "Select both a payer and a recipient.";
  } else if (isSameUser) {
    validationMessage = "Payer and recipient must be different group members.";
  } else if (!canRecordForOthers && user?.id !== fromUserId && user?.id !== toUserId) {
    validationMessage = "Select yourself as the payer or recipient.";
  } else if (!amount.trim()) {
    validationMessage = "Enter a settlement amount.";
  } else if (!isAmountPositive) {
    validationMessage = "Settlement amount must be a valid positive amount.";
  } else if (isFutureDate) {
    validationMessage = "Settlement date cannot be in the future.";
  }

  const isFormValid = !validationMessage;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || createMutation.isPending) return;

    setGeneralError(null);

    const payload: CreateSettlementPayload = {
      fromUserId,
      toUserId,
      amount: amount.trim(),
      settledOn,
      note: note.trim() || undefined,
    };

    try {
      const res = await createMutation.mutateAsync(payload);
      addToast({
        title: "Settlement recorded",
        description: `${getMemberName(fromUserId)} paid ${getMemberName(toUserId)} ${formatMoneyDisplay(parsedAmountMinor!, currency)}.`,
        variant: "success",
      });
      onClose();
      onSettlementRecorded?.(res.data);
    } catch (err) {
      if (isApiError(err)) {
        if (err.status === 409 && err.code === "GROUP_ARCHIVED") {
          setGeneralError(
            "This group has been archived. Settlements cannot be recorded.",
          );
          return;
        }
        if (err.status === 422) {
          if (err.code === "SAME_USER") {
            setGeneralError("A settlement must involve two different members.");
            return;
          }
          if (err.code === "INVALID_MEMBER") {
            setGeneralError(
              "Both settlement participants must be active group members.",
            );
            return;
          }
          if (err.code === "FUTURE_DATE") {
            setGeneralError("Settlement date cannot be in the future.");
            return;
          }
        }
      }
      setGeneralError(getErrorMessage(err, "Failed to record settlement."));
    }
  };

  const payerBalance = balanceMap.get(fromUserId);
  const recipientBalance = balanceMap.get(toUserId);

  const isOverpaying = Boolean(
    payerBalance &&
      payerBalance.direction === "OWES" &&
      parsedAmountMinor !== null &&
      parsedAmountMinor > -payerBalance.balanceMinor,
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pt-1">
      {generalError && <Alert variant="error">{generalError}</Alert>}

      {/* Participants Selection Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Payer (From) */}
        <div className="space-y-1.5">
          <label
            htmlFor="settlement-from-user"
            className="block text-xs font-semibold text-ink"
          >
            Payer (Who Paid)
          </label>
          <select
            id="settlement-from-user"
            value={fromUserId}
            onChange={(e) => setFromUserId(e.target.value)}
            disabled={createMutation.isPending}
            className="h-10 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-ink shadow-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {members.map((m) => {
              const bal = balanceMap.get(m.user.id);
              let balNote = "";
              if (bal) {
                if (bal.direction === "OWES") {
                  balNote = ` (owes ${formatMoneyDisplay(-bal.balanceMinor, currency)})`;
                } else if (bal.direction === "RECEIVES") {
                  balNote = ` (is owed ${formatMoneyDisplay(bal.balanceMinor, currency)})`;
                } else {
                  balNote = " (settled)";
                }
              }

              return (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.displayName}
                  {m.user.username ? ` (@${m.user.username})` : ""}
                  {balNote}
                </option>
              );
            })}
          </select>
          {payerBalance && (
            <p className="text-[11px] text-ink-muted flex items-center gap-1 pt-0.5">
              <Scale className="h-3 w-3" />
              Current balance:{" "}
              <strong
                className={
                  payerBalance.direction === "RECEIVES"
                    ? "text-emerald-700"
                    : payerBalance.direction === "OWES"
                      ? "text-amber-800"
                      : "text-ink-secondary"
                }
              >
                {payerBalance.direction === "RECEIVES" && "+"}
                {payerBalance.direction === "OWES" && "-"}
                {formatMoneyDisplay(
                  payerBalance.balanceMinor < 0
                    ? -payerBalance.balanceMinor
                    : payerBalance.balanceMinor,
                  currency,
                )}
              </strong>
            </p>
          )}
        </div>

        {/* Recipient (To) */}
        <div className="space-y-1.5">
          <label
            htmlFor="settlement-to-user"
            className="block text-xs font-semibold text-ink"
          >
            Recipient (Who Received)
          </label>
          <select
            id="settlement-to-user"
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
            disabled={createMutation.isPending}
            className="h-10 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-ink shadow-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {members.map((m) => {
              const isPayer = m.user.id === fromUserId;
              const bal = balanceMap.get(m.user.id);
              let balNote = "";
              if (bal) {
                if (bal.direction === "RECEIVES") {
                  balNote = ` (is owed ${formatMoneyDisplay(bal.balanceMinor, currency)})`;
                } else if (bal.direction === "OWES") {
                  balNote = ` (owes ${formatMoneyDisplay(-bal.balanceMinor, currency)})`;
                } else {
                  balNote = " (settled)";
                }
              }

              return (
                <option key={m.user.id} value={m.user.id} disabled={isPayer}>
                  {m.user.displayName}
                  {m.user.username ? ` (@${m.user.username})` : ""}
                  {balNote}
                  {isPayer ? " (Payer)" : ""}
                </option>
              );
            })}
          </select>
          {recipientBalance && (
            <p className="text-[11px] text-ink-muted flex items-center gap-1 pt-0.5">
              <Scale className="h-3 w-3" />
              Current balance:{" "}
              <strong
                className={
                  recipientBalance.direction === "RECEIVES"
                    ? "text-emerald-700"
                    : recipientBalance.direction === "OWES"
                      ? "text-amber-800"
                      : "text-ink-secondary"
                }
              >
                {recipientBalance.direction === "RECEIVES" && "+"}
                {recipientBalance.direction === "OWES" && "-"}
                {formatMoneyDisplay(
                  recipientBalance.balanceMinor < 0
                    ? -recipientBalance.balanceMinor
                    : recipientBalance.balanceMinor,
                  currency,
                )}
              </strong>
            </p>
          )}
        </div>
      </div>

      {/* Amount and Date Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Amount */}
        <div className="space-y-1.5">
          <label
            htmlFor="settlement-amount"
            className="block text-xs font-semibold text-ink"
          >
            Amount ({currency})
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-ink-muted">
              {currency}
            </span>
            <Input
              id="settlement-amount"
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={exponent === 0 ? "0" : `0.${"0".repeat(exponent)}`}
              disabled={createMutation.isPending}
              className="pl-12 font-mono text-sm text-right"
            />
          </div>
        </div>

        {/* Settlement Date */}
        <div className="space-y-1.5">
          <label
            htmlFor="settlement-date"
            className="block text-xs font-semibold text-ink"
          >
            Settled On
          </label>
          <div className="relative">
            <Input
              id="settlement-date"
              type="date"
              max={todayIso}
              value={settledOn}
              onChange={(e) => setSettledOn(e.target.value)}
              disabled={createMutation.isPending}
              className="text-sm"
            />
          </div>
        </div>
      </div>

      {/* Note (Optional) */}
      <div className="space-y-1.5">
        <label
          htmlFor="settlement-note"
          className="block text-xs font-semibold text-ink"
        >
          Note (Optional)
        </label>
        <Input
          id="settlement-note"
          type="text"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Bank transfer, Cash, Venmo"
          disabled={createMutation.isPending}
          className="text-sm"
        />
      </div>

      {/* Overpayment & Flow Notice */}
      {isOverpaying && payerBalance && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <Info className="h-4 w-4 text-blue-700 shrink-0" />
            <span>Notice: Settlement amount exceeds outstanding debt</span>
          </div>
          <p>
            The entered amount ({formatMoneyDisplay(parsedAmountMinor!, currency)})
            exceeds the payer&apos;s current debt ({formatMoneyDisplay(-payerBalance.balanceMinor, currency)}).
            The overpayment will turn into a credit in the payer&apos;s favor.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border-subtle bg-surface-subtle/80 p-3.5 text-xs text-ink-secondary space-y-1.5">
        <div className="flex items-center gap-1.5 font-semibold text-ink">
          <Info className="h-4 w-4 text-accent shrink-0" />
          <span>Settlement Preview & Overpayments</span>
        </div>
        <p className="leading-relaxed">
          Recording this payment adds an authoritative settlement entry from{" "}
          <strong>{getMemberName(fromUserId)}</strong> to{" "}
          <strong>{getMemberName(toUserId)}</strong>. Overpayments are fully
          supported: any payment amount exceeding the debt will credit the
          payer's net balance accordingly.
        </p>
      </div>

      {validationMessage && (
        <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
          {validationMessage}
        </p>
      )}

      <DialogFooter className="pt-2 border-t border-border-subtle">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={createMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          isLoading={createMutation.isPending}
          disabled={!isFormValid || createMutation.isPending}
        >
          <Check className="h-4 w-4 mr-1.5" />
          Record Settlement
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RecordSettlementDialog({
  groupId,
  currency,
  members,
  open,
  onOpenChange,
  defaultPayerId,
  defaultRecipientId,
  onSettlementRecorded,
}: RecordSettlementDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-accent" />
            Record Member Settlement
          </DialogTitle>
          <DialogDescription>
            Record a direct repayment between group members to settle debts in{" "}
            {currency}.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <RecordSettlementForm
            groupId={groupId}
            currency={currency}
            members={members}
            onClose={() => onOpenChange(false)}
            defaultPayerId={defaultPayerId}
            defaultRecipientId={defaultRecipientId}
            onSettlementRecorded={onSettlementRecorded}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
