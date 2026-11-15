import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import type { GroupMember } from "@/types/api";
import {
  formatMoneyDisplay,
  getCurrencyExponent,
  parseMajorToMinor,
} from "../money";

export interface ExactParticipantRow {
  userId: string;
  amount: string;
}

export interface ExactSplitEditorProps {
  participants: ExactParticipantRow[];
  onChange: (participants: ExactParticipantRow[]) => void;
  members: GroupMember[];
  totalMinor: bigint;
  currency: string;
  errors?: Record<string, string>;
  generalError?: string;
  disabled?: boolean;
}

export function ExactSplitEditor({
  participants,
  onChange,
  members,
  totalMinor,
  currency,
  errors = {},
  generalError,
  disabled = false,
}: ExactSplitEditorProps) {
  const exponent = getCurrencyExponent(currency);
  const participantMap = new Map(participants.map((p) => [p.userId, p.amount]));

  // Calculate sum of exact amounts in minor units
  let allocatedMinor = 0n;
  for (const p of participants) {
    const minor = parseMajorToMinor(p.amount, currency);
    if (minor !== null && minor > 0n) {
      allocatedMinor += minor;
    }
  }

  const differenceMinor = totalMinor - allocatedMinor;
  const isReconciled = totalMinor > 0n && differenceMinor === 0n;

  const handleToggleParticipant = (userId: string) => {
    if (participantMap.has(userId)) {
      onChange(participants.filter((p) => p.userId !== userId));
    } else {
      onChange([...participants, { userId, amount: "" }]);
    }
  };

  const handleAmountChange = (userId: string, newAmount: string) => {
    const updated = participants.map((p) =>
      p.userId === userId ? { ...p, amount: newAmount } : p,
    );
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[#71717A]">
          Allocate exact amounts ({participants.length} participant(s))
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[#71717A]">Allocated:</span>
          <span className="font-mono font-semibold text-[#18181B] tabular-nums">
            {formatMoneyDisplay(allocatedMinor, currency)}
          </span>
        </div>
      </div>

      {generalError && (
        <p className="text-xs font-medium text-red-600">{generalError}</p>
      )}

      {/* Difference status pill */}
      <div
        className={`rounded-xl border p-2.5 text-xs flex items-center justify-between transition-colors ${
          isReconciled
            ? "border-teal-200 bg-teal-50/50 text-[#0F766E]"
            : differenceMinor > 0n
              ? "border-amber-200 bg-amber-50/50 text-amber-900"
              : "border-red-200 bg-red-50/50 text-red-900"
        }`}
      >
        <div className="flex items-center gap-1.5 font-medium">
          {isReconciled ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-[#0F766E]" />
              <span>Exact split perfectly balanced</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4" />
              <span>
                {differenceMinor > 0n
                  ? `${formatMoneyDisplay(differenceMinor, currency)} remaining to allocate`
                  : `${formatMoneyDisplay(-differenceMinor, currency)} over total amount`}
              </span>
            </>
          )}
        </div>
        <span className="font-mono font-semibold">
          Target: {formatMoneyDisplay(totalMinor, currency)}
        </span>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto p-1">
        {members.map((member) => {
          const isSelected = participantMap.has(member.user.id);
          const currentAmount = participantMap.get(member.user.id) ?? "";
          const rowError = errors[member.user.id];

          return (
            <div
              key={member.user.id}
              className={`p-2.5 rounded-xl border transition-colors ${
                isSelected
                  ? "border-[#0F766E]/40 bg-[#0F766E]/5"
                  : "border-[#E7E5E0] bg-white opacity-80"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleParticipant(member.user.id)}
                    disabled={disabled}
                    className="h-4 w-4 rounded text-[#0F766E] border-gray-300 focus:ring-[#0F766E]"
                  />
                  <Avatar name={member.user.displayName} size="sm" tone="neutral" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#18181B] truncate">
                      {member.user.displayName}
                    </p>
                    <p className="text-[10px] text-[#71717A] truncate">
                      {member.user.username ? `@${member.user.username}` : member.role}
                    </p>
                  </div>
                </label>

                {isSelected ? (
                  <div className="w-32 sm:w-40 relative shrink-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-[#71717A]">
                      {currency}
                    </span>
                    <Input
                      value={currentAmount}
                      onChange={(e) =>
                        handleAmountChange(member.user.id, e.target.value)
                      }
                      placeholder={
                        exponent === 0 ? "0" : `0.${"0".repeat(exponent)}`
                      }
                      className="pl-10 font-mono text-xs text-right h-8"
                      disabled={disabled}
                    />
                  </div>
                ) : (
                  <span className="text-xs text-[#A1A1AA] italic">Excluded</span>
                )}
              </div>

              {isSelected && rowError && (
                <p className="text-xs font-medium text-red-600 mt-1 pl-6">
                  {rowError}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

