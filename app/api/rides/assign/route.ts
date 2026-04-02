import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  sendWebhook,
  buildRideWebhookPayload,
} from "@/lib/notifications/gohighlevel-webhook";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is an admin
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (userError || !userData || userData.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { ride_id, driver_id } = body;

    if (!ride_id || !driver_id) {
      return NextResponse.json(
        { error: "ride_id and driver_id are required" },
        { status: 400 }
      );
    }

    // Update ride with driver assignment
    const { data: ride, error: updateError } = await supabase
      .from("rides")
      .update({
        driver_id,
        status: "assigned",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ride_id)
      .select(
        "*, organization:organizations(*), driver:drivers(*, user:users(*))"
      )
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Send ride_assigned webhook
    const driverUser = ride.driver?.user;
    await sendWebhook(
      buildRideWebhookPayload(
        "ride_assigned",
        ride,
        driverUser,
        ride.organization?.name,
        driverUser
          ? [
              {
                type: "driver",
                email: driverUser.email,
                phone: driverUser.phone || undefined,
              },
            ]
          : []
      )
    );

    return NextResponse.json({ ride });
  } catch (error) {
    console.error("POST /api/rides/assign error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
