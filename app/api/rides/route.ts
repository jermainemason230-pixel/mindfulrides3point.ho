import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { geocodeAddress, getRouteDistance } from "@/lib/mapbox/geocoding";
import { calculateRideCost } from "@/lib/pricing";
import { totalBlockedMinutes } from "@/lib/ride-buffers";
import { autoAssignDriver } from "@/lib/auto-assign";
import { evaluateSharing, SHARE_WINDOW_MINUTES } from "@/lib/ride-sharing";
import {
  sendWebhook,
  buildRideWebhookPayload,
} from "@/lib/notifications/gohighlevel-webhook";

export async function GET(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = createServiceRoleClient();
    const { searchParams } = request.nextUrl;
    const organization_id = searchParams.get("organization_id");
    const driver_id = searchParams.get("driver_id");
    const status = searchParams.get("status");
    const date_from = searchParams.get("date_from");
    const date_to = searchParams.get("date_to");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

    let query = db
      .from("rides")
      .select(
        "*, organization:organizations(*), driver:drivers(*, user:users(*))",
        { count: "exact" }
      )
      .order("scheduled_pickup_time", { ascending: false })
      .range(offset, offset + limit - 1);

    if (organization_id) {
      query = query.eq("organization_id", organization_id);
    }
    if (driver_id) {
      query = query.eq("driver_id", driver_id);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (date_from) {
      query = query.gte("scheduled_pickup_time", date_from);
    }
    if (date_to) {
      query = query.lte("scheduled_pickup_time", date_to);
    }

    const { data: rides, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      rides,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        total_pages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (error) {
    console.error("GET /api/rides error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const body = await request.json();

    // Geocode pickup and dropoff addresses
    const [pickupGeo, dropoffGeo] = await Promise.all([
      geocodeAddress(body.pickup_address),
      geocodeAddress(body.dropoff_address),
    ]);

    // Calculate route distance and estimated cost
    let estimatedCost: number | null = null;
    let estimatedDistance: number | null = null;
    let estimatedDuration: number | null = null;

    if (pickupGeo && dropoffGeo) {
      const route = await getRouteDistance(
        pickupGeo.lat,
        pickupGeo.lng,
        dropoffGeo.lat,
        dropoffGeo.lng
      );

      if (route) {
        estimatedDistance = Math.round(route.distanceMiles * 10) / 10;
        estimatedDuration = Math.round(route.durationMinutes);
        estimatedCost = calculateRideCost(
          route.distanceMiles,
          body.vehicle_type_needed,
          body.is_shared ?? false,
          body.ride_type === "round_trip"
        );
      }
    }

    if (!body.organization_id) {
      return NextResponse.json({ error: "organization_id is required" }, { status: 400 });
    }

    // Check for driver conflicts over the full ride window, respecting vehicle type + capacity
    const pickupTime  = new Date(body.scheduled_pickup_time);
    // Use total blocked time (pickup buffer + buffered ride + drop-off buffer) for conflict detection
    const rawDuration  = estimatedDuration ?? 60;
    const durationMins = totalBlockedMinutes(rawDuration);
    const rideEndTime  = new Date(pickupTime.getTime() + durationMins * 60 * 1000);
    const passengerCount = body.passenger_count ?? 1;

    const pad = (n: number) => String(n).padStart(2, "0");
    // Prefer browser-local date/time sent in payload to avoid UTC timezone mismatch
    const date = body.local_date || `${pickupTime.getFullYear()}-${pad(pickupTime.getMonth() + 1)}-${pad(pickupTime.getDate())}`;
    const time = body.local_time || `${pad(pickupTime.getHours())}:${pad(pickupTime.getMinutes())}:00`;

    const { data: schedules } = await supabase
      .from("driver_schedules")
      .select("driver_id, drivers(id, is_active, vehicle_type, max_passengers)")
      .eq("scheduled_date", date)
      .lte("start_time", time)
      .gt("end_time", time)
      .in("status", ["scheduled", "confirmed"]);

    // Filter by vehicle type and passenger capacity
    const scheduledDriverIds = (schedules ?? [])
      .filter((s: any) => {
        if (!s.drivers?.is_active) return false;
        if (s.drivers.vehicle_type !== body.vehicle_type_needed) return false;
        if (s.drivers.max_passengers != null && s.drivers.max_passengers < passengerCount) return false;
        return true;
      })
      .map((s: any) => s.driver_id as string);

    if (scheduledDriverIds.length === 0) {
      return NextResponse.json(
        { error: `No ${body.vehicle_type_needed} vehicle with capacity for ${passengerCount} passenger${passengerCount !== 1 ? "s" : ""} is scheduled for this time slot.` },
        { status: 409 }
      );
    }

    const { data: activeRides } = await supabase
      .from("rides")
      .select("driver_id, scheduled_pickup_time, estimated_duration_minutes")
      .not("status", "in", "(cancelled,no_show,completed)")
      .not("driver_id", "is", null)
      .lt("scheduled_pickup_time", rideEndTime.toISOString())
      .in("driver_id", scheduledDriverIds);

    const busyDriverIds = new Set<string>(
      (activeRides ?? [])
        .filter((r: any) => {
          const rStart = new Date(r.scheduled_pickup_time).getTime();
          const rEnd   = rStart + (r.estimated_duration_minutes ?? 60) * 60 * 1000;
          return rEnd > pickupTime.getTime();
        })
        .map((r: any) => r.driver_id as string)
    );

    const freeDrivers = scheduledDriverIds.filter((id) => !busyDriverIds.has(id));

    if (freeDrivers.length === 0) {
      return NextResponse.json(
        { error: "No matching drivers are available for this time slot — all are already on rides. Please choose a different time." },
        { status: 409 }
      );
    }

    const direction: "to_appointment" | "from_appointment" | "other" =
      body.ride_direction ?? "other";
    const allowShared: boolean = body.allow_shared_ride ?? true;

    const rideData = {
      organization_id: body.organization_id,
      booked_by: user.id,
      patient_name: body.patient_name,
      patient_phone: body.patient_phone || null,
      pickup_address: body.pickup_address,
      pickup_lat: pickupGeo?.lat ?? body.pickup_lat ?? null,
      pickup_lng: pickupGeo?.lng ?? body.pickup_lng ?? null,
      dropoff_address: body.dropoff_address,
      dropoff_lat: dropoffGeo?.lat ?? body.dropoff_lat ?? null,
      dropoff_lng: dropoffGeo?.lng ?? body.dropoff_lng ?? null,
      ride_type: body.ride_type || "one_way",
      vehicle_type_needed: body.vehicle_type_needed,
      scheduled_pickup_time: body.scheduled_pickup_time,
      is_asap: body.is_asap ?? false,
      return_pickup_time: body.return_pickup_time || null,
      status: "requested" as const,
      is_shared: false,
      ride_direction: direction,
      allow_shared_ride: allowShared,
      appointment_time: body.appointment_time || null,
      service_level: body.service_level || "curb_to_curb",
      passenger_count: body.passenger_count ?? 1,
      special_notes: body.special_notes || null,
      estimated_cost: estimatedCost,
      estimated_distance_miles: estimatedDistance,
      estimated_duration_minutes: estimatedDuration,
    };

    const { data: ride, error } = await supabase
      .from("rides")
      .insert(rideData)
      .select("*, organization:organizations(*)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Ride-sharing matching ─────────────────────────────────────────────
    if (allowShared && direction !== "other" && ride) {
      try {
        const windowMs = SHARE_WINDOW_MINUTES * 60_000;
        const pickupMs = new Date(body.scheduled_pickup_time).getTime();
        const windowStart = new Date(pickupMs - windowMs).toISOString();
        const windowEnd   = new Date(pickupMs + windowMs).toISOString();

        const { data: candidates } = await supabase
          .from("rides")
          .select("id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, estimated_duration_minutes, scheduled_pickup_time, appointment_time, passenger_count")
          .eq("organization_id", body.organization_id)
          .eq("ride_direction", direction)
          .eq("vehicle_type_needed", body.vehicle_type_needed)
          .eq("allow_shared_ride", true)
          .is("shared_group_id", null)
          .in("status", ["requested", "assigned"])
          .gte("scheduled_pickup_time", windowStart)
          .lte("scheduled_pickup_time", windowEnd)
          .neq("id", ride.id);

        for (const cand of (candidates ?? [])) {
          // Combined passenger count must not exceed vehicle capacity
          const combinedPax = (body.passenger_count ?? 1) + (cand.passenger_count ?? 1);
          const matchedDriver = freeDrivers.length > 0
            ? await supabase
                .from("drivers")
                .select("max_passengers")
                .eq("id", freeDrivers[0])
                .single()
            : null;
          const vehicleCapacity = matchedDriver?.data?.max_passengers ?? 99;
          if (combinedPax > vehicleCapacity) continue;

          const result = await evaluateSharing(
            {
              id: ride.id,
              pickup_lat: ride.pickup_lat,
              pickup_lng: ride.pickup_lng,
              dropoff_lat: ride.dropoff_lat,
              dropoff_lng: ride.dropoff_lng,
              estimated_duration_minutes: ride.estimated_duration_minutes,
              scheduled_pickup_time: ride.scheduled_pickup_time,
              appointment_time: ride.appointment_time,
              passenger_count: ride.passenger_count,
            },
            cand,
            direction
          );

          if (result.viable) {
            const groupId = crypto.randomUUID();
            await supabase
              .from("rides")
              .update({ is_shared: true, shared_group_id: groupId })
              .in("id", [ride.id, cand.id]);
            break; // only match one candidate per ride
          }
        }
      } catch (shareErr) {
        // sharing failure is non-fatal — ride still gets created
        console.error("Ride sharing evaluation error:", shareErr);
      }
    }

    // Send ride_requested webhook
    await sendWebhook(
      buildRideWebhookPayload(
        "ride_requested",
        ride,
        undefined,
        ride.organization?.name
      )
    );

    // Trigger auto-assignment
    await autoAssignDriver(ride.id);

    return NextResponse.json({ ride }, { status: 201 });
  } catch (error) {
    console.error("POST /api/rides error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
