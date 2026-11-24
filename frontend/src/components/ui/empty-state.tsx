import type { LucideIcon } from "lucide-react";
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

