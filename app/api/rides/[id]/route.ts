import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { calculateRideCost } from "@/lib/pricing";
import {
  sendWebhook,
  buildRideWebhookPayload,
} from "@/lib/notifications/gohighlevel-webhook";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authClient = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = createServiceRoleClient();
    const { data: ride, error } = await db
      .from("rides")
      .select(
        "*, organization:organizations(*), driver:drivers(*, user:users(*)), booked_by_user:users!booked_by(*)"
      )
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ ride });
  } catch (error) {
    console.error("GET /api/rides/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authClient = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const db = createServiceRoleClient();

    const { data: currentRide, error: fetchError } = await db
      .from("rides")
      .select(
        "*, organization:organizations(*), driver:drivers(*, user:users(*))"
      )
      .eq("id", id)
      .single();

    if (fetchError || !currentRide) {
      return NextResponse.json({ error: "Ride not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      ...body,
      updated_at: new Date().toISOString(),
    };

    if (body.status && body.status !== currentRide.status) {
      switch (body.status) {
        case "arrived_at_pickup":
          updateData.actual_pickup_time = new Date().toISOString();
          break;

        case "completed":
          updateData.actual_dropoff_time = new Date().toISOString();
          if (
            currentRide.estimated_distance_miles &&
            currentRide.vehicle_type_needed
          ) {
            updateData.final_cost = calculateRideCost(
              currentRide.estimated_distance_miles,
              currentRide.vehicle_type_needed,
              currentRide.is_shared,
              currentRide.ride_type === "round_trip"
            );
          } else {
            updateData.final_cost = currentRide.estimated_cost;
          }
          break;

        case "cancelled":
          updateData.cancellation_reason =
            body.cancellation_reason || "No reason provided";
          break;
      }
    }

    const { data: ride, error } = await db
      .from("rides")
      .update(updateData)
      .eq("id", id)
      .select(
        "*, organization:organizations(*), driver:drivers(*, user:users(*))"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (body.status && body.status !== currentRide.status) {
      const webhookEvents: Record<string, string> = {
        driver_en_route: "driver_en_route",
        arrived_at_pickup: "arrived_at_pickup",
        completed: "ride_completed",
        cancelled: "ride_cancelled",
      };

      const webhookEvent = webhookEvents[body.status];
      if (webhookEvent) {
        const driverUser = ride.driver?.user;
        await sendWebhook(
          buildRideWebhookPayload(
            webhookEvent,
            ride,
            driverUser,
            ride.organization?.name
          )
        );
      }
    }

    return NextResponse.json({ ride });
  } catch (error) {
    console.error("PATCH /api/rides/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authClient = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = createServiceRoleClient();
    const { data: ride, error } = await db
      .from("rides")
      .update({
        status: "cancelled",
        cancellation_reason: "Cancelled via API",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        "*, organization:organizations(*), driver:drivers(*, user:users(*))"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await sendWebhook(
      buildRideWebhookPayload(
        "ride_cancelled",
        ride,
        ride.driver?.user,
        ride.organization?.name
      )
    );

    return NextResponse.json({ ride });
  } catch (error) {
    console.error("DELETE /api/rides/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
