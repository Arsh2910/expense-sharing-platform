import { CheckSquare, Square, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { GroupMember } from "@/types/api";
import { formatMoneyDisplay } from "../money";
import { computeEqualPreview } from "../split-engine";

export interface EqualSplitEditorProps {
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  members: GroupMember[];
  totalMinor: bigint;
  currency: string;
  error?: string;
  disabled?: boolean;
}

export function EqualSplitEditor({
  selectedUserIds,
  onChange,
  members,
  totalMinor,
  currency,
  error,
  disabled = false,
}: EqualSplitEditorProps) {
  const selectedSet = new Set(selectedUserIds);
  const allSelected = members.length > 0 && selectedUserIds.length === members.length;

  const handleToggleMember = (userId: string) => {
    if (selectedSet.has(userId)) {
      onChange(selectedUserIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedUserIds, userId]);
    }
  };

  const handleToggleSelectAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(members.map((m) => m.user.id));
    }
  };

  const previewShares = computeEqualPreview(totalMinor, selectedUserIds);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#71717A]">
          Select who shares this expense ({selectedUserIds.length} of {members.length} selected)
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleToggleSelectAll}
          disabled={disabled}
          className="text-xs h-7 px-2"
        >
          {allSelected ? (
            <>
              <Square className="h-3.5 w-3.5 mr-1" />
              Deselect All
            </>
          ) : (
            <>
              <CheckSquare className="h-3.5 w-3.5 mr-1" />
              Select All Members
            </>
          )}
        </Button>
      </div>

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
        {members.map((member) => {
          const isSelected = selectedSet.has(member.user.id);
          const shareMinor = previewShares.get(member.user.id);

          return (
            <label
              key={member.user.id}
              className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-colors ${
                isSelected
                  ? "border-[#0F766E] bg-[#0F766E]/5"
                  : "border-[#E7E5E0] bg-white hover:bg-[#FAF8F5]"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleMember(member.user.id)}
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
              </div>

              {isSelected && shareMinor !== undefined && totalMinor > 0n && (
                <span className="text-xs font-mono font-medium text-[#0F766E] tabular-nums shrink-0">
                  {formatMoneyDisplay(shareMinor, currency)}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {selectedUserIds.length > 0 && totalMinor > 0n && (
        <div className="rounded-lg bg-[#FAF8F5] p-2.5 text-[11px] text-[#71717A] flex items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-[#0F766E]" />
          <span>
            {selectedUserIds.length} person(s) sharing{" "}
            <span className="font-mono font-semibold text-[#18181B]">
              {formatMoneyDisplay(totalMinor, currency)}
            </span>
            . Indivisible remainder units are deterministically distributed.
          </span>
        </div>
      )}
    </div>
  );
}

