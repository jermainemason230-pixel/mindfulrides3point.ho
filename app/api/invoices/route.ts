import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createInvoiceForOrganization,
  getOrCreateStripeCustomer,
} from "@/lib/stripe/client";
import { sendWebhook } from "@/lib/notifications/gohighlevel-webhook";

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
    const status = searchParams.get("status");

    let query = supabase
      .from("invoices")
      .select("*, organization:organizations(*)")
      .order("created_at", { ascending: false });

    if (organization_id) {
      query = query.eq("organization_id", organization_id);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data: invoices, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("GET /api/invoices error:", error);
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
    const { organization_id, period_start, period_end } = body;

    if (!organization_id || !period_start || !period_end) {
      return NextResponse.json(
        { error: "organization_id, period_start, and period_end are required" },
        { status: 400 }
      );
    }

    // Fetch organization
    const { data: organization, error: orgError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", organization_id)
      .single();

    if (orgError || !organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Fetch completed rides in the period
    const { data: rides, error: ridesError } = await supabase
      .from("rides")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("status", "completed")
      .gte("scheduled_pickup_time", period_start)
      .lte("scheduled_pickup_time", period_end);

    if (ridesError) {
      return NextResponse.json({ error: ridesError.message }, { status: 500 });
    }

    if (!rides || rides.length === 0) {
      return NextResponse.json(
        { error: "No completed rides found for this period" },
        { status: 400 }
      );
    }

    // Build line items
    const lineItems = rides.map((ride) => {
      const amount = ride.final_cost ?? ride.estimated_cost ?? 0;
      return {
        ride_id: ride.id,
        patient_name: ride.patient_name,
        date: ride.scheduled_pickup_time,
        pickup: ride.pickup_address,
        dropoff: ride.dropoff_address,
        amount_cents: Math.round(amount * 100),
        description: `Ride for ${ride.patient_name} on ${new Date(ride.scheduled_pickup_time).toLocaleDateString()} — ${ride.pickup_address} to ${ride.dropoff_address}`,
        amount: Math.round(amount * 100),
      };
    });

    const totalCents = lineItems.reduce(
      (sum, item) => sum + item.amount_cents,
      0
    );

    // Get or create Stripe customer
    const stripeCustomerId = await getOrCreateStripeCustomer(
      organization.name,
      organization.billing_email || organization.email || "",
      organization.stripe_customer_id
    );

    // Update org with Stripe customer ID if newly created
    if (!organization.stripe_customer_id) {
      await supabase
        .from("organizations")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", organization_id);
    }

    // Create Stripe invoice
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const stripeInvoice = await createInvoiceForOrganization(
      stripeCustomerId,
      lineItems.map((item) => ({
        description: item.description,
        amount: item.amount,
      })),
      dueDate
    );

    // Store invoice in database
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        organization_id,
        stripe_invoice_id: stripeInvoice.id,
        amount_cents: totalCents,
        status: "pending",
        period_start,
        period_end,
        due_date: dueDate.toISOString(),
        line_items: lineItems.map((item) => ({
          ride_id: item.ride_id,
          patient_name: item.patient_name,
          date: item.date,
          pickup: item.pickup,
          dropoff: item.dropoff,
          amount_cents: item.amount_cents,
        })),
      })
      .select("*, organization:organizations(*)")
      .single();

    if (invoiceError) {
      return NextResponse.json(
        { error: invoiceError.message },
        { status: 500 }
      );
    }

    // Send invoice_created webhook
    await sendWebhook({
      event: "invoice_created",
      ride_id: "",
      patient_name: "",
      pickup_address: "",
      dropoff_address: "",
      scheduled_time: "",
      facility_name: organization.name,
      recipients: [
        {
          type: "facility",
          email: organization.billing_email || organization.email || undefined,
        },
      ],
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
