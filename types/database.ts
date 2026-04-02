export type UserRole = "admin" | "facility_staff" | "driver";
export type VehicleType = "ambulatory" | "wheelchair" | "bariatric" | "stretcher";
export type DriverStatus = "available" | "on_ride" | "off_duty";
export type RideStatus =
  | "requested"
  | "assigned"
  | "driver_en_route"
  | "arrived_at_pickup"
  | "in_transit"
  | "arrived_at_dropoff"
  | "completed"
  | "cancelled"
  | "no_show";
export type RideType = "one_way" | "round_trip";
export type InvoiceStatus = "draft" | "pending" | "paid" | "overdue" | "cancelled";
export type NotificationType = "email" | "sms" | "push";
export type NotificationStatus = "sent" | "failed" | "pending";

export interface Organization {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  billing_email: string | null;
  stripe_customer_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  organization_id: string | null;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  user_id: string;
  vehicle_type: VehicleType;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  license_plate: string | null;
  max_passengers: number;
  status: DriverStatus;
  current_lat: number | null;
  current_lng: number | null;
  last_location_update: string | null;
  is_active: boolean;
  created_at: string;
  user?: User;
}

export interface Ride {
  id: string;
  organization_id: string;
  booked_by: string;
  driver_id: string | null;
  patient_name: string;
  patient_phone: string | null;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  ride_type: RideType;
  vehicle_type_needed: VehicleType;
  scheduled_pickup_time: string;
  is_asap: boolean;
  return_pickup_time: string | null;
  status: RideStatus;
  ride_direction: "to_appointment" | "from_appointment" | "other";
  allow_shared_ride: boolean;
  appointment_time: string | null;
  is_shared: boolean;
  shared_group_id: string | null;
  service_level: "curb_to_curb" | "door_to_door" | "door_through_door";
  passenger_count: number;
  special_notes: string | null;
  estimated_cost: number | null;
  final_cost: number | null;
  estimated_duration_minutes: number | null;
  estimated_distance_miles: number | null;
  actual_pickup_time: string | null;
  actual_dropoff_time: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  organization?: Organization;
  driver?: Driver;
  booked_by_user?: User;
}

export interface Invoice {
  id: string;
  organization_id: string;
  stripe_invoice_id: string | null;
  amount_cents: number;
  status: InvoiceStatus;
  period_start: string;
  period_end: string;
  due_date: string;
  paid_at: string | null;
  line_items: InvoiceLineItem[];
  created_at: string;
  organization?: Organization;
}

export interface InvoiceLineItem {
  ride_id: string;
  patient_name: string;
  date: string;
  pickup: string;
  dropoff: string;
  amount_cents: number;
}

export interface NotificationLog {
  id: string;
  ride_id: string;
  user_id: string;
  type: NotificationType;
  message: string;
  sent_at: string;
  status: NotificationStatus;
}

export interface PricingConfig {
  base_rate: number;
  per_mile_rate: number;
  vehicle_multipliers: Record<VehicleType, number>;
  shared_ride_discount: number;
  round_trip_multiplier: number;
}
