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
    const driver_id = searchParams.get("driver_id");

    let query = db
      .from("driver_schedules")
      .select("*, driver:drivers(*, user:users(*))")
      .order("scheduled_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (driver_id) {
      query = query.eq("driver_id", driver_id);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ schedules: data });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { driver_id, scheduled_date, start_time, end_time, notes } = body;

    if (!driver_id || !scheduled_date || !start_time || !end_time) {
      return NextResponse.json({ error: "driver_id, scheduled_date, start_time, and end_time are required" }, { status: 400 });
    }

    const db = createServiceRoleClient();
    const { data, error } = await db
      .from("driver_schedules")
      .insert({ driver_id, scheduled_date, start_time, end_time, notes: notes || null })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ schedule: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, status, notes, start_time, end_time } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const db = createServiceRoleClient();
    const { data, error } = await db
      .from("driver_schedules")
      .update({ status, notes, start_time, end_time })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ schedule: data });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const db = createServiceRoleClient();
    const { error } = await db.from("driver_schedules").delete().eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
