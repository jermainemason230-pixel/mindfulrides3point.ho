"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes } from "react";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
}

export function Input({
  label,
  error,
  className,
  required,
  disabled,
  id,
  name,
  ...props
}: InputProps) {
  const inputId = id || name;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
          {required && <span className="text-[#E11900] ml-0.5">*</span>}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        required={required}
        disabled={disabled}
        className={cn(
          "block w-full rounded-lg border px-3 py-2 text-sm transition-colors",
          "placeholder:text-gray-400",
          "focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent",
          "disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed",
          error
            ? "border-[#E11900] focus:ring-[#E11900]"
            : "border-gray-300",
          className
        )}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-[#E11900]">{error}</p>
      )}
    </div>
  );
}
