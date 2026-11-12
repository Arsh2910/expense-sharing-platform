import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const alertVariants = cva(
  "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        info: "border-[#E7E5E0] bg-[#F4F3EF]/70 text-[#27272A]",
        success: "border-teal-200 bg-teal-50/70 text-[#115E59]",
        warning: "border-amber-200 bg-amber-50/80 text-amber-900",
        error: "border-red-200 bg-red-50/80 text-red-900",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
} as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
}

export function Alert({
  className,
  variant = "info",
  title,
  children,
  ...props
}: AlertProps) {
  const Icon = ICONS[variant ?? "info"];

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-medium leading-snug">{title}</p>}
        <div className="text-sm leading-relaxed opacity-95">{children}</div>
      </div>
    </div>
  );
}

