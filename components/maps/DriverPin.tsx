"use client";

import { DriverStatus } from "@/types/database";

interface DriverPinProps {
  status: DriverStatus;
  name: string;
  size?: number;
}

const STATUS_COLORS: Record<DriverStatus, string> = {
  available: "#05944F",
  on_ride: "#276EF1",
  off_duty: "#9CA3AF",
};

export default function DriverPin({ status, name, size = 32 }: DriverPinProps) {
  return (
    <div
      className="relative flex items-center justify-center rounded-full border-2 border-white shadow-lg cursor-pointer"
      style={{
        width: size,
        height: size,
        backgroundColor: STATUS_COLORS[status],
      }}
      title={`${name} (${status.replace("_", " ")})`}
    >
      <span className="text-white text-xs font-bold">
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}
