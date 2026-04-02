import { createServiceRoleClient } from "@/lib/supabase/server";
import { totalBlockedMinutes } from "@/lib/ride-buffers";
import { calculateDistance } from "@/lib/utils";
import { buildRideWebhookPayload, sendWebhook } from "@/lib/notifications/gohighlevel-webhook";
import { matchSharedRide } from "@/lib/shared-ride-matching";

export async function autoAssignDriver(rideId: string): Promise<{ success: boolean; driverId?: string; error?: string }> {
  const supabase = createServiceRoleClient();

  const { data: ride, error: rideError } = await supabase
    .from("rides")
    .select("*, organization:organizations(*)")
    .eq("id", rideId)
    .single();

  if (rideError || !ride) {
    return { success: false, error: "Ride not found" };
  }

  if (ride.status !== "requested") {
    return { success: false, error: "Ride is not in requested status" };
  }

  // Check for shared ride possibility
  const sharedResult = await matchSharedRide(rideId);
  if (sharedResult.matched) {
    return { success: true, driverId: sharedResult.driverId };
  }

  // Find available drivers with matching vehicle type and sufficient capacity
  const passengerCount = ride.passenger_count ?? 1;
  let driverQuery = supabase
    .from("drivers")
    .select("*, user:users(*)")
    .eq("status", "available")
    .eq("vehicle_type", ride.vehicle_type_needed)
    .eq("is_active", true)
    .gte("max_passengers", passengerCount);

  const { data: drivers, error: driversError } = await driverQuery;

  if (driversError || !drivers || drivers.length === 0) {
    // No driver available — notify admin
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
    return { success: false, error: "No available drivers" };
  }

  // Filter out drivers with conflicting rides using buffered window
  const scheduledTime = new Date(ride.scheduled_pickup_time);
  const blockedMins = totalBlockedMinutes(ride.estimated_duration_minutes ?? 60);
  const windowStart = new Date(scheduledTime.getTime() - blockedMins * 60 * 1000);
  const windowEnd   = new Date(scheduledTime.getTime() + blockedMins * 60 * 1000);

  const { data: conflictingRides } = await supabase
    .from("rides")
    .select("driver_id")
    .in("status", ["assigned", "driver_en_route", "arrived_at_pickup", "in_transit"])
    .gte("scheduled_pickup_time", windowStart.toISOString())
    .lte("scheduled_pickup_time", windowEnd.toISOString());

  const busyDriverIds = new Set(conflictingRides?.map((r) => r.driver_id) || []);
  const availableDrivers = drivers.filter((d) => !busyDriverIds.has(d.id));

  if (availableDrivers.length === 0) {
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
    return { success: false, error: "No available drivers for this time slot" };
  }

  let selectedDriver;

  if (ride.is_asap && ride.pickup_lat && ride.pickup_lng) {
    // ASAP: pick closest driver
    const driversWithDistance = availableDrivers
      .filter((d) => d.current_lat && d.current_lng)
      .map((d) => ({
        ...d,
        distance: calculateDistance(
          d.current_lat!,
          d.current_lng!,
          ride.pickup_lat!,
          ride.pickup_lng!
        ),
      }))
      .sort((a, b) => a.distance - b.distance);

    selectedDriver = driversWithDistance[0] || availableDrivers[0];
  } else {
    // Scheduled: pick driver with fewest rides in window
    const driverRideCounts = await Promise.all(
      availableDrivers.map(async (driver) => {
        const { count } = await supabase
          .from("rides")
          .select("*", { count: "exact", head: true })
          .eq("driver_id", driver.id)
          .gte("scheduled_pickup_time", windowStart.toISOString())
          .lte("scheduled_pickup_time", windowEnd.toISOString())
          .not("status", "in", '("cancelled","no_show")');

        return { driver, count: count || 0 };
      })
    );

    driverRideCounts.sort((a, b) => a.count - b.count);
    selectedDriver = driverRideCounts[0].driver;
  }

  // Assign the driver
  const { error: updateError } = await supabase
    .from("rides")
    .update({
      driver_id: selectedDriver.id,
      status: "assigned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", rideId);

  if (updateError) {
    return { success: false, error: "Failed to assign driver" };
  }

  // Send notification
  const driverUser = selectedDriver.user;
  await sendWebhook(
    buildRideWebhookPayload("ride_assigned", ride, driverUser, ride.organization?.name, [
      {
        type: "driver",
        email: driverUser?.email,
        phone: driverUser?.phone || undefined,
      },
    ])
  );

  return { success: true, driverId: selectedDriver.id };
}
