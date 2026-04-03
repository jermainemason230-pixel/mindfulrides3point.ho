import { createServiceRoleClient } from "@/lib/supabase/server";
import { totalBlockedMinutes } from "@/lib/ride-buffers";
import { calculateDistance } from "@/lib/utils";
import { buildRideWebhookPayload, sendWebhook } from "@/lib/notifications/gohighlevel-webhook";

function pad(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeStr(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export async function autoAssignDriver(
  rideId: string
): Promise<{ success: boolean; driverId?: string; error?: string }> {
  const supabase = createServiceRoleClient();

  const { data: ride, error: rideError } = await supabase
    .from("rides")
    .select("*, organization:organizations(*)")
    .eq("id", rideId)
    .single();

  if (rideError || !ride) return { success: false, error: "Ride not found" };

  // Already assigned (e.g. pooled during booking)
  if (ride.status !== "requested") {
    return { success: true, driverId: ride.driver_id ?? undefined };
  }

  const pickupTime  = new Date(ride.scheduled_pickup_time);
  const date        = toDateStr(pickupTime);
  const time        = toTimeStr(pickupTime);
  const passengerCount = ride.passenger_count ?? 1;

  // ── 1. Find drivers scheduled at this date/time ───────────────────────
  const { data: schedules } = await supabase
    .from("driver_schedules")
    .select("driver_id, drivers(id, is_active, vehicle_type, max_passengers, current_lat, current_lng, user:users(*))")
    .eq("scheduled_date", date)
    .lte("start_time", time)
    .gt("end_time", time)
    .in("status", ["scheduled", "confirmed"]);

  const eligibleSchedules = (schedules ?? []).filter((s: any) => {
    if (!s.drivers?.is_active) return false;
    if (s.drivers.vehicle_type !== ride.vehicle_type_needed) return false;
    if (s.drivers.max_passengers != null && s.drivers.max_passengers < passengerCount) return false;
    return true;
  });

  if (eligibleSchedules.length === 0) {
    await _notifyNoDriver(ride);
    return { success: false, error: "No drivers scheduled for this time slot" };
  }

  const scheduledDriverIds = eligibleSchedules.map((s: any) => s.driver_id as string);

  // ── 2. Filter out drivers with conflicting rides ───────────────────────
  const blockedMins = totalBlockedMinutes(ride.estimated_duration_minutes ?? 60);
  const windowStart = new Date(pickupTime.getTime() - blockedMins * 60 * 1000);
  const windowEnd   = new Date(pickupTime.getTime() + blockedMins * 60 * 1000);

  const { data: conflictRides } = await supabase
    .from("rides")
    .select("driver_id, scheduled_pickup_time, estimated_duration_minutes, allow_shared_ride, passenger_count")
    .not("status", "in", "(cancelled,no_show,completed)")
    .not("driver_id", "is", null)
    .in("driver_id", scheduledDriverIds)
    .lt("scheduled_pickup_time", windowEnd.toISOString())
    .gt("scheduled_pickup_time", windowStart.toISOString());

  // Build committed passenger map for shared capacity checks
  const driverPaxMap = new Map<string, number>();
  for (const r of (conflictRides ?? []) as any[]) {
    driverPaxMap.set(r.driver_id, (driverPaxMap.get(r.driver_id) ?? 0) + (r.passenger_count ?? 1));
  }

  const driverCapMap = new Map<string, number>();
  for (const s of eligibleSchedules as any[]) {
    if (s.drivers?.max_passengers != null) driverCapMap.set(s.driver_id, s.drivers.max_passengers);
  }

  const busyIds = new Set<string>(
    (conflictRides ?? [])
      .filter((r: any) => {
        // If both rides allow sharing, only block if capacity exceeded
        if (ride.allow_shared_ride && r.allow_shared_ride) {
          const committed = driverPaxMap.get(r.driver_id) ?? 0;
          const capacity  = driverCapMap.get(r.driver_id) ?? 99;
          return committed + passengerCount > capacity;
        }
        return true;
      })
      .map((r: any) => r.driver_id as string)
  );

  const availableIds = scheduledDriverIds.filter((id) => !busyIds.has(id));

  if (availableIds.length === 0) {
    await _notifyNoDriver(ride);
    return { success: false, error: "No available drivers for this time slot" };
  }

  // Build a map of driverId -> driver record for easy lookup
  const driverMap = new Map<string, any>();
  for (const s of eligibleSchedules as any[]) {
    if (availableIds.includes(s.driver_id)) driverMap.set(s.driver_id, s.drivers);
  }

  // ── 3. Pick the best driver ───────────────────────────────────────────
  let selectedId: string;

  if (ride.is_asap && ride.pickup_lat && ride.pickup_lng) {
    // ASAP: closest driver by GPS
    const withDist = availableIds
      .map((id) => {
        const d = driverMap.get(id);
        const dist = d?.current_lat && d?.current_lng
          ? calculateDistance(d.current_lat, d.current_lng, ride.pickup_lat, ride.pickup_lng)
          : Infinity;
        return { id, dist };
      })
      .sort((a, b) => a.dist - b.dist);
    selectedId = withDist[0].id;
  } else {
    // Scheduled: driver with fewest committed passengers in the window
    selectedId = availableIds.reduce((best, id) => {
      return (driverPaxMap.get(id) ?? 0) < (driverPaxMap.get(best) ?? 0) ? id : best;
    }, availableIds[0]);
  }

  // ── 4. Assign ─────────────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from("rides")
    .update({ driver_id: selectedId, status: "assigned", updated_at: new Date().toISOString() })
    .eq("id", rideId);

  if (updateError) return { success: false, error: "Failed to assign driver" };

  // If this ride is in a shared group, also assign the same driver to unassigned group-mates
  if (ride.shared_group_id) {
    await supabase
      .from("rides")
      .update({ driver_id: selectedId, status: "assigned", updated_at: new Date().toISOString() })
      .eq("shared_group_id", ride.shared_group_id)
      .eq("status", "requested")
      .neq("id", rideId);
  }

  const selectedDriver = driverMap.get(selectedId);
  const driverUser = selectedDriver?.user;

  await sendWebhook(
    buildRideWebhookPayload("ride_assigned", ride, driverUser, ride.organization?.name, [
      { type: "driver", email: driverUser?.email, phone: driverUser?.phone || undefined },
    ])
  );

  return { success: true, driverId: selectedId };
}

async function _notifyNoDriver(ride: any) {
  await sendWebhook({
    event: "no_driver_available",
    ride_id: ride.id,
    patient_name: ride.patient_name,
    pickup_address: ride.pickup_address,
    dropoff_address: ride.dropoff_address,
    scheduled_time: ride.scheduled_pickup_time,
    facility_name: ride.organization?.name,
    recipients: [],
  });
}
