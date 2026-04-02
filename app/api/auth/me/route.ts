import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user }, error } = await authClient.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = createServiceRoleClient();
    const { data: profile, error: profileError } = await db
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ user: profile });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
