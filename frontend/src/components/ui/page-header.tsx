import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface PageHeaderProps {
  title: string;
  description?: string;
  backTo?: {
    label: string;
    href: string;
  };
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  backTo,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {backTo && (
        <div>
          <Link
            to={backTo.href}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#52525B] transition-colors hover:text-[#18181B]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {backTo.label}
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[#18181B]">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-[#52525B] leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}

