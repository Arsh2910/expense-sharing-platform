import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", hasError = false, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={hasError || undefined}
        className={cn(
          "flex h-10 w-full rounded-lg border bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted transition-colors duration-150",
          "focus:outline-none focus:ring-2 focus:ring-offset-0",
          "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-muted",
          hasError
            ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
            : "border-field-border hover:border-action focus:border-action focus:ring-action/25",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

