import { createServiceRoleClient } from "@/lib/supabase/server";
import { calculateDistance } from "@/lib/utils";
// crypto.randomUUID() is used instead of uuid package

const PICKUP_DISTANCE_THRESHOLD = 3; // miles
const DROPOFF_DISTANCE_THRESHOLD = 3; // miles
const TIME_WINDOW_MINUTES = 30;

export async function matchSharedRide(
  rideId: string
): Promise<{ matched: boolean; driverId?: string; groupId?: string }> {
  const supabase = createServiceRoleClient();

  const { data: ride } = await supabase
    .from("rides")
    .select("*")
    .eq("id", rideId)
    .single();

  if (!ride || !ride.pickup_lat || !ride.pickup_lng || !ride.dropoff_lat || !ride.dropoff_lng) {
    return { matched: false };
  }

  const scheduledTime = new Date(ride.scheduled_pickup_time);
  const windowStart = new Date(scheduledTime.getTime() - TIME_WINDOW_MINUTES * 60 * 1000);
  const windowEnd = new Date(scheduledTime.getTime() + TIME_WINDOW_MINUTES * 60 * 1000);

  // Find rides that could be shared
  const { data: candidates } = await supabase
    .from("rides")
    .select("*, driver:drivers(*)")
    .eq("vehicle_type_needed", ride.vehicle_type_needed)
    .in("status", ["assigned", "driver_en_route"])
    .gte("scheduled_pickup_time", windowStart.toISOString())
    .lte("scheduled_pickup_time", windowEnd.toISOString())
    .neq("id", rideId)
    .not("driver_id", "is", null);

  if (!candidates || candidates.length === 0) {
    return { matched: false };
  }

  for (const candidate of candidates) {
    if (!candidate.pickup_lat || !candidate.pickup_lng || !candidate.dropoff_lat || !candidate.dropoff_lng) {
      continue;
    }

    const pickupDistance = calculateDistance(
      ride.pickup_lat,
      ride.pickup_lng,
      candidate.pickup_lat,
      candidate.pickup_lng
    );

    const dropoffDistance = calculateDistance(
      ride.dropoff_lat,
      ride.dropoff_lng,
      candidate.dropoff_lat,
      candidate.dropoff_lng
    );

    if (pickupDistance <= PICKUP_DISTANCE_THRESHOLD && dropoffDistance <= DROPOFF_DISTANCE_THRESHOLD) {
      // Check driver capacity
      const driver = candidate.driver;
      if (!driver || driver.max_passengers <= 1) continue;

      // Count current passengers in this group
      const groupId = candidate.shared_group_id || crypto.randomUUID();
      const { count } = await supabase
        .from("rides")
        .select("*", { count: "exact", head: true })
        .eq("shared_group_id", groupId)
        .not("status", "in", '("cancelled","completed","no_show")');

      const currentPassengers = (count || 0) + 1;
      if (currentPassengers >= driver.max_passengers) continue;

      // Match found — group the rides
      await supabase
        .from("rides")
        .update({
          is_shared: true,
          shared_group_id: groupId,
          driver_id: candidate.driver_id,
          status: "assigned",
          updated_at: new Date().toISOString(),
        })
        .eq("id", rideId);

      if (!candidate.shared_group_id) {
        await supabase
          .from("rides")
          .update({ is_shared: true, shared_group_id: groupId })
          .eq("id", candidate.id);
      }

      return { matched: true, driverId: candidate.driver_id!, groupId };
    }
  }

  return { matched: false };
}

export async function checkShareability(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  vehicleType: string,
  scheduledTime: string
): Promise<{ shareable: boolean; potentialMatches: number }> {
  const supabase = createServiceRoleClient();
  const time = new Date(scheduledTime);
  const windowStart = new Date(time.getTime() - TIME_WINDOW_MINUTES * 60 * 1000);
  const windowEnd = new Date(time.getTime() + TIME_WINDOW_MINUTES * 60 * 1000);

  const { data: candidates } = await supabase
    .from("rides")
    .select("pickup_lat, pickup_lng, dropoff_lat, dropoff_lng")
    .eq("vehicle_type_needed", vehicleType)
    .in("status", ["requested", "assigned", "driver_en_route"])
    .gte("scheduled_pickup_time", windowStart.toISOString())
    .lte("scheduled_pickup_time", windowEnd.toISOString());

  if (!candidates) return { shareable: false, potentialMatches: 0 };

  let matches = 0;
  for (const c of candidates) {
    if (!c.pickup_lat || !c.pickup_lng || !c.dropoff_lat || !c.dropoff_lng) continue;
    const pd = calculateDistance(pickupLat, pickupLng, c.pickup_lat, c.pickup_lng);
    const dd = calculateDistance(dropoffLat, dropoffLng, c.dropoff_lat, c.dropoff_lng);
    if (pd <= PICKUP_DISTANCE_THRESHOLD && dd <= DROPOFF_DISTANCE_THRESHOLD) matches++;
  }

  return { shareable: matches > 0, potentialMatches: matches };
}
