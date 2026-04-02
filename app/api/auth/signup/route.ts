import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName, phone, role } = await request.json();

    if (!email || !password || !fullName || !role) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create the auth user
    const { data, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Insert profile row — service role bypasses RLS
    const { error: profileError } = await supabase.from("users").insert({
      id: data.user.id,
      email,
      full_name: fullName,
      phone: phone || null,
      role,
    });

    if (profileError) {
      // Roll back the auth user so we don't leave orphaned auth records
      await supabase.auth.admin.deleteUser(data.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ userId: data.user.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[signup]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
