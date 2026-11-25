import { Percent, Split, Users2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SplitType } from "../expenses.types";

export interface SplitMethodSelectorProps {
  value: SplitType;
  onChange: (value: SplitType) => void;
  disabled?: boolean;
}

const METHODS: ReadonlyArray<{
  type: SplitType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    type: "EQUAL",
    label: "Split Equally",
    description: "Divided evenly among selected participants",
    icon: Users2,
  },
  {
    type: "EXACT",
    label: "Exact Amounts",
    description: "Specify the exact dollar/currency amount for each person",
    icon: Split,
  },
  {
    type: "PERCENTAGE",
    label: "By Percentage",
    description: "Assign a percentage share to each person (totals 100%)",
    icon: Percent,
  },
];

export function SplitMethodSelector({
  value,
  onChange,
  disabled = false,
}: SplitMethodSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="pb-1 border-b border-border-subtle">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          3. Split Method
        </h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {METHODS.map((method) => {
          const Icon = method.icon;
          const isSelected = value === method.type;

          return (
            <button
              key={method.type}
              type="button"
              onClick={() => onChange(method.type)}
              disabled={disabled}
              className={cn(
                "flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-colors cursor-pointer",
                isSelected
                  ? "border-accent bg-accent-tint ring-1 ring-accent text-ink"
                  : "border-border-subtle bg-surface text-ink-secondary hover:bg-surface-subtle hover:text-ink",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs sm:text-sm">
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isSelected ? "text-accent" : "text-ink-muted",
                  )}
                />
                <span>{method.label}</span>
              </div>
              <p className="text-[11px] text-ink-muted leading-tight">
                {method.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

