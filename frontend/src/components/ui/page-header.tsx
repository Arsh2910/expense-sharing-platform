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
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {backTo.label}
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-[1_1_18rem] space-y-1.5">
          <h1 className="break-words text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-ink-secondary leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex min-w-0 flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}

