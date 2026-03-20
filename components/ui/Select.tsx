"use client";

import { cn } from "@/lib/utils";
import { SelectHTMLAttributes } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export function Select({
  label,
  error,
  options,
  placeholder,
  required,
  name,
  id,
  className,
  ...props
}: SelectProps) {
  const selectId = id || name;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
          {required && <span className="text-[#E11900] ml-0.5">*</span>}
        </label>
      )}
      <select
        id={selectId}
        name={name}
        required={required}
        className={cn(
          "block w-full rounded-lg border px-3 py-2 text-sm transition-colors appearance-none bg-white",
          "focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent",
          "disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed",
          error
            ? "border-[#E11900] focus:ring-[#E11900]"
            : "border-gray-300",
          className
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-[#E11900]">{error}</p>
      )}
    </div>
  );
}
