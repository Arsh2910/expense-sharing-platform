import { cn } from "@/lib/utils/cn";
import { getInitials } from "@/lib/utils/format";

export interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  tone?: "neutral" | "accent";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

export function Avatar({
  name,
  size = "md",
  tone = "neutral",
  className,
}: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold tracking-tight select-none",
        SIZE_CLASSES[size],
        tone === "accent"
          ? "border border-teal-200 bg-teal-50 text-[#0F766E]"
          : "border border-[#E7E5E0] bg-[#F4F3EF] text-[#3F3F46]",
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}

