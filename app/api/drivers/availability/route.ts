import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { totalBlockedMinutes } from "@/lib/ride-buffers";

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
          .select("driver_id, scheduled_pickup_time, estimated_duration_minutes")
          .not("status", "in", "(cancelled,no_show,completed)")
          .not("driver_id", "is", null)
          .in("driver_id", allDriverIds)
      : { data: [] };

    function isDriverFree(driverId: string, slotStart: Date, durationMins: number): boolean {
      // Use totalBlockedMinutes for both the new ride and existing rides
      const blocked = totalBlockedMinutes(durationMins);
      const slotEnd = new Date(slotStart.getTime() + blocked * 60 * 1000);
      return !(activeRides ?? []).some((r: any) => {
        if (r.driver_id !== driverId) return false;
        const rStart   = new Date(r.scheduled_pickup_time).getTime();
        const rBlocked = totalBlockedMinutes(r.estimated_duration_minutes ?? 60);
        const rEnd     = rStart + rBlocked * 60 * 1000;
        return rStart < slotEnd.getTime() && rEnd > slotStart.getTime();
      });
    }

    function checkSlot(slotStart: Date, overrideDate?: string, overrideTime?: string) {
      const date = overrideDate || toDateStr(slotStart);
      const time = overrideTime || toTimeStr(slotStart);
      const scheduled = activeSchedules.filter((s: any) =>
        s.scheduled_date === date && s.start_time <= time && s.end_time > time
      );
      const scheduledIds = scheduled.map((s: any) => s.driver_id as string);
      const freeIds = scheduledIds.filter((id) => isDriverFree(id, slotStart, durationMinutes));
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

    return NextResponse.json({ ...result, alternatives });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
