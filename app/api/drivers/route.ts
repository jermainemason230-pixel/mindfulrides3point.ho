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

    // Try to create auth user; if email already exists, look up the existing user instead
    let newUserId: string;

    const { data: authData, error: authCreateError } =
      await serviceClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name },
      });

    if (authCreateError) {
      if (!authCreateError.message.toLowerCase().includes("already registered")) {
        return NextResponse.json(
          { error: authCreateError.message },
          { status: 400 }
        );
      }

      // User already exists — find them by email
      const { data: listData, error: listError } =
        await serviceClient.auth.admin.listUsers();
      if (listError) {
        return NextResponse.json({ error: listError.message }, { status: 500 });
      }
      const existing = listData.users.find((u) => u.email === email);
      if (!existing) {
        return NextResponse.json(
          { error: "User exists but could not be located." },
          { status: 500 }
        );
      }
      newUserId = existing.id;
    } else {
      newUserId = authData.user.id;
    }

    // Upsert users record (driver may have self-registered)
    const { error: userInsertError } = await serviceClient
      .from("users")
      .upsert(
        {
          id: newUserId,
          email,
          full_name,
          phone: phone || null,
          role: "driver",
          is_active: true,
        },
        { onConflict: "id" }
      );

    if (userInsertError) {
      return NextResponse.json(
        { error: userInsertError.message },
        { status: 500 }
      );
    }

    // Upsert driver record (self-registered drivers may already have a stub row)
    const { data: driver, error: driverError } = await serviceClient
      .from("drivers")
      .upsert(
        {
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
        },
        { onConflict: "user_id" }
      )
      .select("*, user:users(*)")
      .single();

    if (driverError) {
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
