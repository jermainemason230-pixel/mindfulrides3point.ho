import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, full_name, phone, organization_id } = await request.json();

    if (!email || !full_name || !organization_id) {
      return NextResponse.json(
        { error: "email, full_name, and organization_id are required" },
        { status: 400 }
      );
    }

    const service = getServiceClient();

    // Create auth user
    const { data: authData, error: authCreateError } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authCreateError) {
      return NextResponse.json({ error: authCreateError.message }, { status: 400 });
    }

    const newUserId = authData.user.id;

    // Create users record
    const { error: userInsertError } = await service.from("users").insert({
      id: newUserId,
      email,
      full_name,
      phone: phone || null,
      role: "facility_staff",
      organization_id,
      is_active: true,
    });

    if (userInsertError) {
      await service.auth.admin.deleteUser(newUserId);
      return NextResponse.json({ error: userInsertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
