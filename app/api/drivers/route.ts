import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: drivers, error } = await supabase
      .from("drivers")
      .select("*, user:users(*)")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ drivers });
  } catch (error) {
    console.error("GET /api/drivers error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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

    const body = await request.json();
    const {
      email,
      full_name,
      phone,
      vehicle_type,
      vehicle_make,
      vehicle_model,
      vehicle_year,
      vehicle_color,
      license_plate,
      max_passengers,
    } = body;

    if (!email || !full_name || !vehicle_type) {
      return NextResponse.json(
        { error: "email, full_name, and vehicle_type are required" },
        { status: 400 }
      );
    }

    const serviceClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create auth user
    const { data: authData, error: authCreateError } =
      await serviceClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name },
      });

    if (authCreateError) {
      return NextResponse.json(
        { error: authCreateError.message },
        { status: 400 }
      );
    }

    const newUserId = authData.user.id;

    // Create users record
    const { error: userInsertError } = await serviceClient
      .from("users")
      .insert({
        id: newUserId,
        email,
        full_name,
        phone: phone || null,
        role: "driver",
        is_active: true,
      });

    if (userInsertError) {
      // Clean up auth user on failure
      await serviceClient.auth.admin.deleteUser(newUserId);
      return NextResponse.json(
        { error: userInsertError.message },
        { status: 500 }
      );
    }

    // Create driver record
    const { data: driver, error: driverError } = await serviceClient
      .from("drivers")
      .insert({
        user_id: newUserId,
        vehicle_type,
        vehicle_make: vehicle_make || null,
        vehicle_model: vehicle_model || null,
        vehicle_year: vehicle_year || null,
        vehicle_color: vehicle_color || null,
        license_plate: license_plate || null,
        max_passengers: max_passengers || 1,
        status: "off_duty",
        is_active: true,
      })
      .select("*, user:users(*)")
      .single();

    if (driverError) {
      // Clean up on failure
      await serviceClient.from("users").delete().eq("id", newUserId);
      await serviceClient.auth.admin.deleteUser(newUserId);
      return NextResponse.json(
        { error: driverError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ driver }, { status: 201 });
  } catch (error) {
    console.error("POST /api/drivers error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
