import { cn } from "@/lib/utils/cn";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-lg bg-border-subtle motion-safe:animate-pulse",
        className,
      )}
      {...props}
    />
  );
}

