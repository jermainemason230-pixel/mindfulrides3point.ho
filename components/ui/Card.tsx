import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-lg shadow-sm border border-gray-100",
        onClick && "cursor-pointer hover:shadow-md transition-shadow",
        className
      )}
      style={{ borderRadius: "8px" }}
    >
      {children}
    </div>
  );
}
