import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = createServiceRoleClient();
    const { searchParams } = request.nextUrl;
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: "date_from and date_to are required" }, { status: 400 });
    }

    // All active drivers
    const { data: drivers, error: driversError } = await db
      .from("drivers")
      .select("id, vehicle_type, status, user:users(id, full_name, email)")
      .eq("is_active", true)
      .order("created_at");

    if (driversError) {
      return NextResponse.json({ error: driversError.message }, { status: 500 });
    }

    // Scheduled shift hours per driver in range
    const { data: schedules } = await db
      .from("driver_schedules")
      .select("driver_id, scheduled_date, start_time, end_time, status")
      .gte("scheduled_date", dateFrom)
      .lte("scheduled_date", dateTo)
      .in("status", ["scheduled", "confirmed", "completed"]);

    // Completed rides per driver in range
    const { data: rides } = await db
      .from("rides")
      .select("driver_id, actual_pickup_time, actual_dropoff_time, estimated_duration_minutes, status")
      .eq("status", "completed")
      .gte("scheduled_pickup_time", new Date(dateFrom).toISOString())
      .lte("scheduled_pickup_time", new Date(dateTo + "T23:59:59").toISOString())
      .not("driver_id", "is", null);

    // Aggregate per driver
    const hoursMap = new Map<string, { scheduledHours: number; rideHours: number; rideCount: number }>();

    for (const driver of drivers ?? []) {
      hoursMap.set(driver.id, { scheduledHours: 0, rideHours: 0, rideCount: 0 });
    }

    for (const s of schedules ?? []) {
      const entry = hoursMap.get(s.driver_id);
      if (!entry) continue;
      // Parse HH:MM:SS time strings into fractional hours
      const toHours = (t: string) => {
        const [h, m, sec] = t.split(":").map(Number);
        return h + m / 60 + (sec ?? 0) / 3600;
      };
      const shiftHours = toHours(s.end_time) - toHours(s.start_time);
      if (shiftHours > 0) entry.scheduledHours += shiftHours;
    }

    for (const r of rides ?? []) {
      if (!r.driver_id) continue;
      const entry = hoursMap.get(r.driver_id);
      if (!entry) continue;
      entry.rideCount += 1;
      if (r.actual_pickup_time && r.actual_dropoff_time) {
        const ms = new Date(r.actual_dropoff_time).getTime() - new Date(r.actual_pickup_time).getTime();
        entry.rideHours += ms / 3_600_000;
      } else if (r.estimated_duration_minutes) {
        entry.rideHours += r.estimated_duration_minutes / 60;
      }
    }

    const result = (drivers ?? []).map((d: any) => {
      const hours = hoursMap.get(d.id) ?? { scheduledHours: 0, rideHours: 0, rideCount: 0 };
      return {
        id: d.id,
        full_name: d.user?.full_name ?? "Unknown",
        email: d.user?.email ?? "",
        vehicle_type: d.vehicle_type,
        status: d.status,
        scheduled_hours: Math.round(hours.scheduledHours * 100) / 100,
        ride_hours: Math.round(hours.rideHours * 100) / 100,
        ride_count: hours.rideCount,
      };
    });

    return NextResponse.json({ drivers: result });
  } catch (error) {
    console.error("GET /api/drivers/hours error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
