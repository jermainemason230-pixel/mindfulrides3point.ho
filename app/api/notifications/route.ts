import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
    const { ride_id, user_id, type, message } = body;

    if (!ride_id || !user_id || !type || !message) {
      return NextResponse.json(
        { error: "ride_id, user_id, type, and message are required" },
        { status: 400 }
      );
    }

    const { data: notification, error } = await supabase
      .from("notifications_log")
      .insert({
        ride_id,
        user_id,
        type,
        message,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ notification }, { status: 201 });
  } catch (error) {
    console.error("POST /api/notifications error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
