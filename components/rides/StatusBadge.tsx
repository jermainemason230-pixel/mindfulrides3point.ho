import { Badge } from "@/components/ui/Badge";
import { RIDE_STATUS_CONFIG } from "@/lib/utils";
import { RideStatus } from "@/types/database";

interface StatusBadgeProps {
  status: RideStatus;
}

const statusToVariant: Record<
  RideStatus,
  "gray" | "blue" | "yellow" | "green" | "purple" | "red" | "emerald" | "orange"
> = {
  requested: "gray",
  assigned: "blue",
  driver_en_route: "yellow",
  arrived_at_pickup: "green",
  in_transit: "purple",
  arrived_at_dropoff: "emerald",
  completed: "emerald",
  cancelled: "red",
  no_show: "orange",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = RIDE_STATUS_CONFIG[status];
  const variant = statusToVariant[status];

  return <Badge variant={variant}>{config.label}</Badge>;
}
