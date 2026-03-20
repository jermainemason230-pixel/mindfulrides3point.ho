"use client";

import { Menu, Bell } from "lucide-react";

interface TopNavProps {
  onMenuOpen: () => void;
  userName: string;
}

export function TopNav({ onMenuOpen, userName }: TopNavProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 md:hidden">
      {/* Hamburger */}
      <button
        onClick={onMenuOpen}
        className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Title */}
      <span className="text-lg font-bold text-gray-900">Mindful Rides</span>

      {/* Notification bell */}
      <button
        className="relative rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
      </button>
    </header>
  );
}
