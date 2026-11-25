import { Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GroupMember } from "@/types/api";
import {
  formatMoneyDisplay,
  getCurrencyExponent,
  parseMajorToMinor,
} from "../money";

export interface PayerRow {
  userId: string;
  amount: string;
}

export interface PayerEditorProps {
  payers: PayerRow[];
  onChange: (payers: PayerRow[]) => void;
  members: GroupMember[];
  currency: string;
  payerTotalMinor: bigint;
  errors?: Record<number, string>;
  generalError?: string;
  disabled?: boolean;
}

export function PayerEditor({
  payers,
  onChange,
  members,
  currency,
  payerTotalMinor,
  errors = {},
  generalError,
  disabled = false,
}: PayerEditorProps) {
  const exponent = getCurrencyExponent(currency);
  const selectedUserIds = new Set(payers.map((p) => p.userId));

  const handlePayerUserChange = (index: number, newUserId: string) => {
    const updated = payers.map((payer, i) =>
      i === index ? { ...payer, userId: newUserId } : payer,
    );
    onChange(updated);
  };

  const handlePayerAmountChange = (index: number, newAmount: string) => {
    const updated = payers.map((payer, i) =>
      i === index ? { ...payer, amount: newAmount } : payer,
    );
    onChange(updated);
  };

  const handleAddPayerRow = () => {
    // Find first member not yet in payers
    const nextMember = members.find((m) => !selectedUserIds.has(m.user.id));
    if (!nextMember) return;

    onChange([...payers, { userId: nextMember.user.id, amount: "" }]);
  };

  const handleRemovePayerRow = (index: number) => {
    if (payers.length <= 1) return;
    onChange(payers.filter((_, i) => i !== index));
  };

  const canAddMorePayers = payers.length < members.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-1 border-b border-border-subtle">
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-accent" />
            2. Who Paid
          </h4>
          <p className="text-[11px] text-ink-muted">
            Specify who covered this expense and how much each person paid.
          </p>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <span className="text-xs text-ink-muted">Payer Total:</span>
          <p className="text-sm font-semibold font-mono text-ink tabular-nums">
            {formatMoneyDisplay(payerTotalMinor, currency)}
          </p>
        </div>
      </div>

      {generalError && (
        <p className="text-xs font-medium text-red-600">{generalError}</p>
      )}

      <div className="space-y-2.5">
        {payers.map((payer, index) => {
          const rowError = errors[index];
          const parsed = parseMajorToMinor(payer.amount, currency);
          const isZeroOrNegative = parsed !== null && parsed <= 0n;

          return (
            <div key={index} className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <select
                    value={payer.userId}
                    onChange={(e) => handlePayerUserChange(index, e.target.value)}
                    disabled={disabled}
                    className="h-10 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-ink shadow-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {members.map((member) => {
                      const isTaken =
                        selectedUserIds.has(member.user.id) &&
                        member.user.id !== payer.userId;
                      return (
                        <option
                          key={member.user.id}
                          value={member.user.id}
                          disabled={isTaken}
                        >
                          {member.user.displayName}
                          {member.user.username ? ` (@${member.user.username})` : ""}
                          {isTaken ? " (Already added)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="w-36 sm:w-44 shrink-0 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-ink-muted">
                    {currency}
                  </span>
                  <Input
                    value={payer.amount}
                    onChange={(e) => handlePayerAmountChange(index, e.target.value)}
                    placeholder={exponent === 0 ? "0" : `0.${"0".repeat(exponent)}`}
                    className="pl-12 font-mono text-sm text-right"
                    disabled={disabled}
                  />
                </div>

                {payers.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemovePayerRow(index)}
                    disabled={disabled}
                    className="h-10 w-10 p-0 text-ink-muted hover:text-red-600 hover:bg-red-50 shrink-0"
                    aria-label={`Remove payer ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {rowError && (
                <p className="text-xs font-medium text-red-600 pl-1">{rowError}</p>
              )}
              {isZeroOrNegative && !rowError && (
                <p className="text-xs font-medium text-red-600 pl-1">
                  Payer amount must be greater than zero.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {canAddMorePayers && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddPayerRow}
          disabled={disabled}
          className="text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add another payer
        </Button>
      )}
    </div>
  );
}

