import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { geocodeAddress, getRouteDistance } from "@/lib/mapbox/geocoding";
import { calculateRideCost } from "@/lib/pricing";
import { autoAssignDriver } from "@/lib/auto-assign";
import {
  sendWebhook,
  buildRideWebhookPayload,
} from "@/lib/notifications/gohighlevel-webhook";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const organization_id = searchParams.get("organization_id");
    const driver_id = searchParams.get("driver_id");
    const status = searchParams.get("status");
    const date_from = searchParams.get("date_from");
    const date_to = searchParams.get("date_to");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

    let query = supabase
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
    const supabase = createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
        estimatedDistance = route.distanceMiles;
        estimatedDuration = route.durationMinutes;
        estimatedCost = calculateRideCost(
          route.distanceMiles,
          body.vehicle_type_needed,
          body.is_shared ?? false,
          body.ride_type === "round_trip"
        );
      }
    }

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
      is_shared: body.is_shared ?? false,
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
