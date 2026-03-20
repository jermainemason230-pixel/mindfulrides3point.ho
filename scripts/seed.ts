/**
 * Seed Script for Mindful Rides
 *
 * Run this after setting up your Supabase project and running the migration.
 * Make sure your .env.local file has the correct SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage: npm run seed
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing environment variables. Make sure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log("🚀 Starting seed...\n");

  // 1. Create Organizations
  console.log("Creating organizations...");
  const { data: orgs, error: orgsError } = await supabase
    .from("organizations")
    .insert([
      {
        name: "Sunrise Care Center",
        address: "123 Healthcare Blvd, Miami, FL 33101",
        phone: "(305) 555-0100",
        email: "info@sunrisecare.com",
        billing_email: "billing@sunrisecare.com",
        notes: "Primary care facility, high volume",
      },
      {
        name: "Valley Medical Group",
        address: "456 Medical Way, Miami, FL 33125",
        phone: "(305) 555-0200",
        email: "info@valleymedical.com",
        billing_email: "billing@valleymedical.com",
        notes: "Multi-specialty practice",
      },
      {
        name: "Harmony Health Clinic",
        address: "789 Wellness Ave, Fort Lauderdale, FL 33301",
        phone: "(954) 555-0300",
        email: "info@harmonyhealth.com",
        billing_email: "billing@harmonyhealth.com",
        notes: "Outpatient rehabilitation",
      },
    ])
    .select();

  if (orgsError) {
    console.error("Error creating organizations:", orgsError);
    return;
  }
  console.log(`  ✅ Created ${orgs.length} organizations\n`);

  // 2. Create Admin User
  console.log("Creating admin user...");
  const { data: adminAuth, error: adminAuthError } =
    await supabase.auth.admin.createUser({
      email: "admin@mindfulrides.com",
      password: "admin123456",
      email_confirm: true,
    });

  if (adminAuthError) {
    console.error("Error creating admin auth:", adminAuthError);
    return;
  }

  await supabase.from("users").insert({
    id: adminAuth.user.id,
    email: "admin@mindfulrides.com",
    full_name: "Admin User",
    phone: "(305) 555-0001",
    role: "admin",
  });
  console.log('  ✅ Admin: admin@mindfulrides.com / admin123456\n');

  // 3. Create Facility Staff Users
  console.log("Creating facility staff...");
  const staffData = [
    {
      email: "sarah@sunrisecare.com",
      name: "Sarah Johnson",
      phone: "(305) 555-0101",
      orgIndex: 0,
    },
    {
      email: "mike@valleymedical.com",
      name: "Mike Chen",
      phone: "(305) 555-0201",
      orgIndex: 1,
    },
    {
      email: "lisa@harmonyhealth.com",
      name: "Lisa Rodriguez",
      phone: "(954) 555-0301",
      orgIndex: 2,
    },
  ];

  for (const staff of staffData) {
    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email: staff.email,
        password: "staff123456",
        email_confirm: true,
      });

    if (authError) {
      console.error(`Error creating staff ${staff.email}:`, authError);
      continue;
    }

    await supabase.from("users").insert({
      id: authUser.user.id,
      email: staff.email,
      full_name: staff.name,
      phone: staff.phone,
      role: "facility_staff",
      organization_id: orgs[staff.orgIndex].id,
    });
    console.log(`  ✅ Staff: ${staff.email} / staff123456`);
  }
  console.log("");

  // 4. Create Drivers
  console.log("Creating drivers...");
  const driverData = [
    {
      email: "james@mindfulrides.com",
      name: "James Wilson",
      phone: "(305) 555-1001",
      vehicle: {
        type: "ambulatory" as const,
        make: "Toyota",
        model: "Sienna",
        year: 2023,
        color: "White",
        plate: "MR-001",
      },
    },
    {
      email: "maria@mindfulrides.com",
      name: "Maria Garcia",
      phone: "(305) 555-1002",
      vehicle: {
        type: "ambulatory" as const,
        make: "Honda",
        model: "Odyssey",
        year: 2022,
        color: "Silver",
        plate: "MR-002",
      },
    },
    {
      email: "david@mindfulrides.com",
      name: "David Brown",
      phone: "(305) 555-1003",
      vehicle: {
        type: "wheelchair" as const,
        make: "Ford",
        model: "Transit",
        year: 2023,
        color: "Blue",
        plate: "MR-003",
      },
    },
    {
      email: "anna@mindfulrides.com",
      name: "Anna Martinez",
      phone: "(305) 555-1004",
      vehicle: {
        type: "ambulatory" as const,
        make: "Chrysler",
        model: "Pacifica",
        year: 2024,
        color: "Black",
        plate: "MR-004",
      },
    },
  ];

  const driverIds: string[] = [];

  for (const driver of driverData) {
    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email: driver.email,
        password: "driver123456",
        email_confirm: true,
      });

    if (authError) {
      console.error(`Error creating driver ${driver.email}:`, authError);
      continue;
    }

    await supabase.from("users").insert({
      id: authUser.user.id,
      email: driver.email,
      full_name: driver.name,
      phone: driver.phone,
      role: "driver",
    });

    const { data: driverRecord } = await supabase
      .from("drivers")
      .insert({
        user_id: authUser.user.id,
        vehicle_type: driver.vehicle.type,
        vehicle_make: driver.vehicle.make,
        vehicle_model: driver.vehicle.model,
        vehicle_year: driver.vehicle.year,
        vehicle_color: driver.vehicle.color,
        license_plate: driver.vehicle.plate,
        max_passengers: 3,
        status: "available",
        current_lat: 25.7617 + (Math.random() - 0.5) * 0.1,
        current_lng: -80.1918 + (Math.random() - 0.5) * 0.1,
        last_location_update: new Date().toISOString(),
      })
      .select()
      .single();

    if (driverRecord) driverIds.push(driverRecord.id);
    console.log(`  ✅ Driver: ${driver.email} / driver123456`);
  }
  console.log("");

  // 5. Create Sample Rides
  console.log("Creating sample rides...");

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Get the staff user IDs
  const { data: staffUsers } = await supabase
    .from("users")
    .select("id, organization_id")
    .eq("role", "facility_staff");

  if (!staffUsers || staffUsers.length === 0) {
    console.error("No staff users found");
    return;
  }

  const sampleRides = [
    {
      organization_id: orgs[0].id,
      booked_by: staffUsers[0].id,
      driver_id: driverIds[0] || null,
      patient_name: "John Smith",
      patient_phone: "(305) 555-2001",
      pickup_address: "123 Healthcare Blvd, Miami, FL 33101",
      pickup_lat: 25.7751,
      pickup_lng: -80.1947,
      dropoff_address: "500 University Dr, Coral Gables, FL 33134",
      dropoff_lat: 25.7215,
      dropoff_lng: -80.2684,
      ride_type: "one_way" as const,
      vehicle_type_needed: "ambulatory" as const,
      scheduled_pickup_time: new Date(today.getTime() + 9 * 60 * 60 * 1000).toISOString(),
      status: "completed" as const,
      estimated_cost: 37.5,
      final_cost: 37.5,
      estimated_distance_miles: 5.0,
      estimated_duration_minutes: 15,
    },
    {
      organization_id: orgs[0].id,
      booked_by: staffUsers[0].id,
      driver_id: driverIds[1] || null,
      patient_name: "Mary Johnson",
      patient_phone: "(305) 555-2002",
      pickup_address: "200 SW 1st Ave, Miami, FL 33130",
      pickup_lat: 25.7685,
      pickup_lng: -80.1936,
      dropoff_address: "123 Healthcare Blvd, Miami, FL 33101",
      dropoff_lat: 25.7751,
      dropoff_lng: -80.1947,
      ride_type: "round_trip" as const,
      vehicle_type_needed: "ambulatory" as const,
      scheduled_pickup_time: new Date(today.getTime() + 10 * 60 * 60 * 1000).toISOString(),
      return_pickup_time: new Date(today.getTime() + 14 * 60 * 60 * 1000).toISOString(),
      status: "in_transit" as const,
      estimated_cost: 54.0,
      estimated_distance_miles: 3.0,
      estimated_duration_minutes: 12,
    },
    {
      organization_id: orgs[0].id,
      booked_by: staffUsers[0].id,
      patient_name: "Robert Davis",
      patient_phone: "(305) 555-2003",
      pickup_address: "123 Healthcare Blvd, Miami, FL 33101",
      pickup_lat: 25.7751,
      pickup_lng: -80.1947,
      dropoff_address: "1611 NW 12th Ave, Miami, FL 33136",
      dropoff_lat: 25.7895,
      dropoff_lng: -80.2104,
      ride_type: "one_way" as const,
      vehicle_type_needed: "ambulatory" as const,
      scheduled_pickup_time: new Date(today.getTime() + 14 * 60 * 60 * 1000).toISOString(),
      status: "requested" as const,
      estimated_cost: 31.25,
      estimated_distance_miles: 2.5,
      estimated_duration_minutes: 10,
    },
    {
      organization_id: orgs[1].id,
      booked_by: staffUsers[1]?.id || staffUsers[0].id,
      driver_id: driverIds[2] || null,
      patient_name: "Patricia Wilson",
      patient_phone: "(305) 555-2004",
      pickup_address: "456 Medical Way, Miami, FL 33125",
      pickup_lat: 25.7743,
      pickup_lng: -80.2341,
      dropoff_address: "1000 NW 7th St, Miami, FL 33136",
      dropoff_lat: 25.7823,
      dropoff_lng: -80.2098,
      ride_type: "one_way" as const,
      vehicle_type_needed: "wheelchair" as const,
      scheduled_pickup_time: new Date(today.getTime() + 11 * 60 * 60 * 1000).toISOString(),
      status: "assigned" as const,
      estimated_cost: 40.63,
      estimated_distance_miles: 2.0,
      estimated_duration_minutes: 8,
    },
    {
      organization_id: orgs[2].id,
      booked_by: staffUsers[2]?.id || staffUsers[0].id,
      patient_name: "Thomas Anderson",
      patient_phone: "(954) 555-2005",
      pickup_address: "789 Wellness Ave, Fort Lauderdale, FL 33301",
      pickup_lat: 26.1224,
      pickup_lng: -80.1373,
      dropoff_address: "1600 S Andrews Ave, Fort Lauderdale, FL 33316",
      dropoff_lat: 26.0979,
      dropoff_lng: -80.1418,
      ride_type: "one_way" as const,
      vehicle_type_needed: "ambulatory" as const,
      scheduled_pickup_time: new Date(today.getTime() + 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000).toISOString(),
      status: "requested" as const,
      estimated_cost: 33.75,
      estimated_distance_miles: 3.5,
      estimated_duration_minutes: 11,
    },
  ];

  const { data: rides, error: ridesError } = await supabase
    .from("rides")
    .insert(sampleRides)
    .select();

  if (ridesError) {
    console.error("Error creating rides:", ridesError);
  } else {
    console.log(`  ✅ Created ${rides.length} sample rides\n`);
  }

  // 6. Create Sample Invoice
  console.log("Creating sample invoice...");
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthEnd = new Date(today);
  lastMonthEnd.setDate(0);

  await supabase.from("invoices").insert({
    organization_id: orgs[0].id,
    amount_cents: 15000,
    status: "paid",
    period_start: lastMonth.toISOString().split("T")[0],
    period_end: lastMonthEnd.toISOString().split("T")[0],
    due_date: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    paid_at: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    line_items: [
      {
        ride_id: "sample-1",
        patient_name: "John Smith",
        date: lastMonth.toISOString(),
        pickup: "123 Healthcare Blvd",
        dropoff: "500 University Dr",
        amount_cents: 3750,
      },
      {
        ride_id: "sample-2",
        patient_name: "Jane Doe",
        date: lastMonth.toISOString(),
        pickup: "200 SW 1st Ave",
        dropoff: "123 Healthcare Blvd",
        amount_cents: 3125,
      },
    ],
  });
  console.log("  ✅ Created sample invoice\n");

  console.log("========================================");
  console.log("🎉 Seed complete! Here are your login credentials:\n");
  console.log("  Admin:    admin@mindfulrides.com / admin123456");
  console.log("  Staff 1:  sarah@sunrisecare.com / staff123456");
  console.log("  Staff 2:  mike@valleymedical.com / staff123456");
  console.log("  Staff 3:  lisa@harmonyhealth.com / staff123456");
  console.log("  Driver 1: james@mindfulrides.com / driver123456");
  console.log("  Driver 2: maria@mindfulrides.com / driver123456");
  console.log("  Driver 3: david@mindfulrides.com / driver123456");
  console.log("  Driver 4: anna@mindfulrides.com / driver123456");
  console.log("========================================\n");
}

seed().catch(console.error);
