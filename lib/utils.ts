import { clsx, type ClassValue } from "clsx";
import { RideStatus } from "@/types/database";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export const RIDE_STATUS_CONFIG: Record<
  RideStatus,
  { label: string; color: string; bgColor: string }
> = {
  requested: { label: "Requested", color: "text-gray-700", bgColor: "bg-gray-100" },
  assigned: { label: "Assigned", color: "text-blue-700", bgColor: "bg-blue-100" },
  driver_en_route: { label: "En Route", color: "text-yellow-700", bgColor: "bg-yellow-100" },
  arrived_at_pickup: { label: "At Pickup", color: "text-green-700", bgColor: "bg-green-100" },
  in_transit: { label: "In Transit", color: "text-purple-700", bgColor: "bg-purple-100" },
  arrived_at_dropoff: { label: "At Dropoff", color: "text-emerald-700", bgColor: "bg-emerald-100" },
  completed: { label: "Completed", color: "text-emerald-800", bgColor: "bg-emerald-200" },
  cancelled: { label: "Cancelled", color: "text-red-700", bgColor: "bg-red-100" },
  no_show: { label: "No Show", color: "text-orange-700", bgColor: "bg-orange-100" },
};

export function formatAddress(address: string): string {
  const parts = address.split(",");
  return parts.length > 1 ? parts[0].trim() : address;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
