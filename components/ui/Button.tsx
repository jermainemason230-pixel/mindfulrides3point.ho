"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
  type?: "button" | "submit" | "reset";
}

const variantStyles: Record<string, string> = {
  primary:
    "bg-black text-white hover:bg-gray-800 disabled:bg-gray-400",
  secondary:
    "bg-white text-black border border-gray-300 hover:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200",
  danger:
    "bg-[#E11900] text-white hover:bg-red-700 disabled:bg-red-300",
};

const sizeStyles: Record<string, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black",
        variantStyles[variant],
        sizeStyles[size],
        loading && "cursor-wait",
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
