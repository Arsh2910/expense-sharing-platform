import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-[#0F766E] text-white shadow-xs hover:bg-[#0D5E57] active:bg-[#0B4F4A]",
        secondary:
          "bg-[#F4F3EF] text-[#18181B] border border-[#E7E5E0] hover:bg-[#EAE8E2]",
        outline:
          "border border-[#D6D3CD] bg-white text-[#18181B] shadow-2xs hover:bg-[#FAF9F6] hover:border-[#B8B4AC]",
        ghost:
          "text-[#52525B] hover:bg-[#F4F3EF] hover:text-[#18181B]",
        destructive:
          "bg-[#B91C1C] text-white shadow-xs hover:bg-[#991B1B]",
        destructiveOutline:
          "border border-red-200 bg-white text-[#B91C1C] hover:bg-red-50 hover:border-red-300",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9.5 px-4 text-sm",
        lg: "h-10.5 px-5 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref,
  ) => {
    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={cn(buttonVariants({ variant, size, className }))}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

