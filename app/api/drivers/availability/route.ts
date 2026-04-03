import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { totalBlockedMinutes, BUFFERS } from "@/lib/ride-buffers";
import { getRouteDistance } from "@/lib/mapbox/geocoding";

function pad(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeStr(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const datetime        = searchParams.get("datetime");
    const durationMinutes = parseInt(searchParams.get("duration_minutes") || "60", 10);
    const vehicleType     = searchParams.get("vehicle_type") || null;
    const passengerCount  = parseInt(searchParams.get("passenger_count") || "1", 10);
    // Browser-local date/time — matches how admin enters shift times
    const localDate       = searchParams.get("local_date") || null;
    const localTime       = searchParams.get("local_time") || null;

    if (!datetime) {
      return NextResponse.json({ error: "datetime is required" }, { status: 400 });
    }

    const dt      = new Date(datetime);
    const rideEnd = new Date(dt.getTime() + durationMinutes * 60 * 1000);
    const db      = createServiceRoleClient();

    // Build the date window using local dates when available
    const windowStart = new Date(dt.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd   = new Date(dt.getTime() + 2 * 60 * 60 * 1000);
    const dates = new Set<string>();
    // Always include the browser-local date if provided
    if (localDate) dates.add(localDate);
    for (let t = windowStart.getTime(); t <= windowEnd.getTime(); t += 60 * 60 * 1000) {
      dates.add(toDateStr(new Date(t)));
    }

    // Fetch schedules + driver vehicle info
    let scheduleQuery = db
      .from("driver_schedules")
      .select("driver_id, scheduled_date, start_time, end_time, drivers(id, is_active, vehicle_type, max_passengers)")
      .in("scheduled_date", [...dates])
      .in("status", ["scheduled", "confirmed"]);

    const { data: allSchedules } = await scheduleQuery;

    // Filter by vehicle type and passenger capacity
    const activeSchedules = (allSchedules ?? []).filter((s: any) => {
      if (!s.drivers?.is_active) return false;
      if (vehicleType && s.drivers.vehicle_type !== vehicleType) return false;
      if (s.drivers.max_passengers != null && s.drivers.max_passengers < passengerCount) return false;
      return true;
    });

    const allDriverIds = [...new Set(activeSchedules.map((s: any) => s.driver_id as string))];

    // Fetch active rides for those drivers
    const { data: activeRides } = allDriverIds.length > 0
      ? await db
          .from("rides")
          .select("driver_id, scheduled_pickup_time, estimated_duration_minutes, allow_shared_ride, passenger_count")
          .not("status", "in", "(cancelled,no_show,completed)")
          .not("driver_id", "is", null)
          .in("driver_id", allDriverIds)
      : { data: [] };

    // Driver capacity lookup from schedules
    const driverCapMap = new Map<string, number>();
    for (const s of (activeSchedules ?? []) as any[]) {
      if (s.drivers?.max_passengers != null) driverCapMap.set(s.driver_id, s.drivers.max_passengers);
    }

    function isDriverFree(driverId: string, slotStart: Date, durationMins: number, newPax = 1, newAllowShared = true): boolean {
      const blocked = totalBlockedMinutes(durationMins);
      const slotEnd = new Date(slotStart.getTime() + blocked * 60 * 1000);
      return !(activeRides ?? []).some((r: any) => {
        if (r.driver_id !== driverId) return false;
        const rStart   = new Date(r.scheduled_pickup_time).getTime();
        const rBlocked = totalBlockedMinutes(r.estimated_duration_minutes ?? 60);
        const rEnd     = rStart + rBlocked * 60 * 1000;
        if (!(rStart < slotEnd.getTime() && rEnd > slotStart.getTime())) return false;
        // Overlapping — but if both allow sharing, check capacity instead of blocking outright
        if (newAllowShared && r.allow_shared_ride) {
          const committed = (activeRides ?? [])
            .filter((x: any) => x.driver_id === driverId && x.allow_shared_ride)
            .reduce((sum: number, x: any) => sum + (x.passenger_count ?? 1), 0);
          const capacity = driverCapMap.get(driverId) ?? 99;
          return committed + newPax > capacity;
        }
        return true;
      });
    }

    function checkSlot(slotStart: Date, overrideDate?: string, overrideTime?: string) {
      const date = overrideDate || toDateStr(slotStart);
      const time = overrideTime || toTimeStr(slotStart);
      const scheduled = activeSchedules.filter((s: any) =>
        s.scheduled_date === date && s.start_time <= time && s.end_time > time
      );
      const scheduledIds = scheduled.map((s: any) => s.driver_id as string);
      const freeIds = scheduledIds.filter((id) => isDriverFree(id, slotStart, durationMinutes, passengerCount, true));
      const busyCount = scheduledIds.length - freeIds.length;
      return {
        available: freeIds.length > 0,
        driver_count: freeIds.length,
        total_scheduled: scheduledIds.length,
        conflict: busyCount > 0 && freeIds.length === 0,
      };
    }

    // Use browser-local date/time for the exact requested slot to avoid UTC mismatch
    const result = checkSlot(dt, localDate ?? undefined, localTime ?? undefined);

    // Find up to 3 alternative slots within ±2 hours if unavailable
    let alternatives: string[] = [];
    if (!result.available) {
      const now = new Date();
      let candidate = new Date(windowStart);
      const rem = candidate.getMinutes() % 15;
      if (rem !== 0) candidate = new Date(candidate.getTime() + (15 - rem) * 60 * 1000);
      candidate.setSeconds(0, 0);

      while (candidate <= windowEnd && alternatives.length < 3) {
        const isSameSlot = Math.abs(candidate.getTime() - dt.getTime()) < 15 * 60 * 1000;
        if (!isSameSlot && candidate > now && checkSlot(candidate).available) {
          alternatives.push(candidate.toISOString());
        }
        candidate = new Date(candidate.getTime() + 15 * 60 * 1000);
      }
    }

    // If pickup coords are provided and drivers are available, calculate real ETAs from driver GPS
    const pickupLat = parseFloat(searchParams.get("pickup_lat") ?? "");
    const pickupLng = parseFloat(searchParams.get("pickup_lng") ?? "");
    let etaMinutes: number = BUFFERS.asapDispatchMinutes;
    let etaSource: "gps" | "estimate" = "estimate";

    if (result.available && !isNaN(pickupLat) && !isNaN(pickupLng)) {
      // Get the IDs of free drivers at this slot
      const date = localDate ?? toDateStr(dt);
      const time = localTime ?? toTimeStr(dt);
      const freeDriverIds = activeSchedules
        .filter((s: any) => s.scheduled_date === date && s.start_time <= time && s.end_time > time)
        .map((s: any) => s.driver_id as string)
        .filter((id: string) => isDriverFree(id, dt, durationMinutes, passengerCount, true));

      if (freeDriverIds.length > 0) {
        // Fetch GPS locations updated within the last 30 minutes
        const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: locatedDrivers } = await db
          .from("drivers")
          .select("id, current_lat, current_lng")
          .in("id", freeDriverIds)
          .not("current_lat", "is", null)
          .not("current_lng", "is", null)
          .gte("last_location_update", staleThreshold);

        if (locatedDrivers && locatedDrivers.length > 0) {
          // Route each located driver to the pickup point, pick the fastest
          const driveTimes = await Promise.all(
            locatedDrivers.map((d: any) =>
              getRouteDistance(d.current_lat, d.current_lng, pickupLat, pickupLng)
                .then((r) => r?.durationMinutes ?? null)
                .catch(() => null)
            )
          );
          const validTimes = driveTimes.filter((t): t is number => t !== null);
          if (validTimes.length > 0) {
            etaMinutes = Math.round(Math.min(...validTimes));
            etaSource = "gps";
          }
        }
      }
    }

    return NextResponse.json({ ...result, alternatives, eta_minutes: etaMinutes, eta_source: etaSource });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
