import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circle" | "card";
}

const variantStyles: Record<string, string> = {
  text: "h-4 w-full rounded",
  circle: "h-10 w-10 rounded-full",
  card: "h-32 w-full rounded-lg",
};

export function Skeleton({ className, variant = "text" }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-gray-200",
        variantStyles[variant],
        className
      )}
    />
  );
}
