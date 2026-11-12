import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium tracking-tight",
  {
    variants: {
      variant: {
        neutral: "border-[#E7E5E0] bg-[#F4F3EF] text-[#3F3F46]",
        accent: "border-teal-200 bg-teal-50 text-[#0F766E]",
        warning: "border-amber-200 bg-amber-50 text-amber-800",
        danger: "border-red-200 bg-red-50 text-red-700",
        outline: "border-[#D6D3CD] bg-white text-[#52525B]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

