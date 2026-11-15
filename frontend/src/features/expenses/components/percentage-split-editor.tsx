import { AlertCircle, CheckCircle2, Percent } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import type { GroupMember } from "@/types/api";
import {
  formatMoneyDisplay,
  formatPercentageUnits,
  parsePercentageUnits,
  PERCENTAGE_SCALE,
} from "../money";
import { computePercentagePreview } from "../split-engine";

export interface PercentageParticipantRow {
  userId: string;
  percentage: string;
}

export interface PercentageSplitEditorProps {
  participants: PercentageParticipantRow[];
  onChange: (participants: PercentageParticipantRow[]) => void;
  members: GroupMember[];
  totalMinor: bigint;
  currency: string;
  errors?: Record<string, string>;
  generalError?: string;
  disabled?: boolean;
}

export function PercentageSplitEditor({
  participants,
  onChange,
  members,
  totalMinor,
  currency,
  errors = {},
  generalError,
  disabled = false,
}: PercentageSplitEditorProps) {
  const participantMap = new Map(
    participants.map((p) => [p.userId, p.percentage]),
  );

  // Sum up percentages in 1e-6 integer units
  let totalPercentUnits = 0n;
  const validParsedList: Array<{ userId: string; percentUnits: bigint }> = [];

  for (const p of participants) {
    const units = parsePercentageUnits(p.percentage);
    if (units !== null && units > 0n) {
      totalPercentUnits += units;
      validParsedList.push({ userId: p.userId, percentUnits: units });
    }
  }

  const remainingUnits = PERCENTAGE_SCALE - totalPercentUnits;
  const isReconciled = totalPercentUnits === PERCENTAGE_SCALE;

  const handleToggleParticipant = (userId: string) => {
    if (participantMap.has(userId)) {
      onChange(participants.filter((p) => p.userId !== userId));
    } else {
      onChange([...participants, { userId, percentage: "" }]);
    }
  };

  const handlePercentageChange = (userId: string, newPercentage: string) => {
    const updated = participants.map((p) =>
      p.userId === userId ? { ...p, percentage: newPercentage } : p,
    );
    onChange(updated);
  };

  const previewShares = computePercentagePreview(totalMinor, validParsedList);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[#71717A]">
          Assign percentage shares ({participants.length} participant(s))
        </span>
        <div className="flex items-center gap-1.5 font-mono">
          <span className="text-[#71717A]">Total:</span>
          <span className="font-semibold text-[#18181B] tabular-nums">
            {formatPercentageUnits(totalPercentUnits)}%
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
            : remainingUnits > 0n
              ? "border-amber-200 bg-amber-50/50 text-amber-900"
              : "border-red-200 bg-red-50/50 text-red-900"
        }`}
      >
        <div className="flex items-center gap-1.5 font-medium">
          {isReconciled ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-[#0F766E]" />
              <span>Percentages total exactly 100.00%</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4" />
              <span>
                {remainingUnits > 0n
                  ? `${formatPercentageUnits(remainingUnits)}% remaining to assign`
                  : `${formatPercentageUnits(-remainingUnits)}% over 100%`}
              </span>
            </>
          )}
        </div>
        <span className="font-mono font-semibold">Target: 100%</span>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto p-1">
        {members.map((member) => {
          const isSelected = participantMap.has(member.user.id);
          const currentPercentage = participantMap.get(member.user.id) ?? "";
          const rowError = errors[member.user.id];
          const calculatedShareMinor = previewShares.get(member.user.id);

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
                    {isSelected && calculatedShareMinor !== undefined && totalMinor > 0n && (
                      <p className="text-[10px] font-mono text-[#0F766E] tabular-nums">
                        ≈ {formatMoneyDisplay(calculatedShareMinor, currency)}
                      </p>
                    )}
                  </div>
                </label>

                {isSelected ? (
                  <div className="w-28 sm:w-36 relative shrink-0">
                    <Input
                      value={currentPercentage}
                      onChange={(e) =>
                        handlePercentageChange(member.user.id, e.target.value)
                      }
                      placeholder="0.0"
                      className="pr-7 font-mono text-xs text-right h-8"
                      disabled={disabled}
                    />
                    <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#71717A]" />
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

