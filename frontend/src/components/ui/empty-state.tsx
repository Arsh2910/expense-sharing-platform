import type { LucideIcon } from "lucide-react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-[#D6D3CD] bg-[#FAF9F6]/60 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-lg border border-[#E7E5E0] bg-white text-[#52525B] shadow-2xs">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-[#18181B]">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-[#52525B] leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export interface ComingSoonPanelProps {
  icon: LucideIcon;
  title: string;
  description: string;
  detail?: string;
  className?: string;
}

export function ComingSoonPanel({
  icon: Icon,
  title,
  description,
  detail,
  className,
}: ComingSoonPanelProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[#E7E5E0] bg-white p-6 shadow-[0_1px_2px_rgba(24,24,27,0.04)]",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E7E5E0] bg-[#FAF9F6] text-[#52525B]">
            <Icon className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[#18181B]">{title}</h3>
              <Badge variant="neutral">
                <Clock className="h-3 w-3 text-[#71717A]" aria-hidden="true" />
                Coming soon
              </Badge>
            </div>
            <p className="text-sm text-[#52525B] leading-relaxed">
              {description}
            </p>
            {detail && (
              <p className="pt-0.5 text-xs text-[#71717A]">{detail}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

