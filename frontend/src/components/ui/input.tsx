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
          "flex h-10 w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#A1A1AA] transition-colors duration-150",
          "focus:outline-none focus:ring-2 focus:ring-offset-0",
          "disabled:cursor-not-allowed disabled:bg-[#F4F3EF] disabled:text-[#71717A]",
          hasError
            ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
            : "border-[#D6D3CD] hover:border-[#B8B4AC] focus:border-[#0F766E] focus:ring-[#0F766E]/15",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

