-- Mindful Rides Database Schema
-- Run this migration in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('admin', 'facility_staff', 'driver');
CREATE TYPE vehicle_type AS ENUM ('ambulatory', 'wheelchair', 'bariatric', 'stretcher');
CREATE TYPE driver_status AS ENUM ('available', 'on_ride', 'off_duty');
CREATE TYPE ride_status AS ENUM (
  'requested', 'assigned', 'driver_en_route', 'arrived_at_pickup',
  'in_transit', 'arrived_at_dropoff', 'completed', 'cancelled', 'no_show'
);
CREATE TYPE ride_type AS ENUM ('one_way', 'round_trip');
CREATE TYPE invoice_status AS ENUM ('draft', 'pending', 'paid', 'overdue', 'cancelled');
CREATE TYPE notification_type AS ENUM ('email', 'sms', 'push');
CREATE TYPE notification_status AS ENUM ('sent', 'failed', 'pending');

-- ============================================
-- TABLES
-- ============================================

-- Organizations (facilities)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  billing_email TEXT,
  stripe_customer_id TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'facility_staff',
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drivers
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type vehicle_type NOT NULL DEFAULT 'ambulatory',
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year INTEGER,
  vehicle_color TEXT,
  license_plate TEXT,
  max_passengers INTEGER DEFAULT 3,
  status driver_status DEFAULT 'off_duty',
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  last_location_update TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rides
CREATE TABLE rides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  booked_by UUID NOT NULL REFERENCES users(id),
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  pickup_address TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  dropoff_address TEXT NOT NULL,
  dropoff_lat DOUBLE PRECISION,
  dropoff_lng DOUBLE PRECISION,
  ride_type ride_type NOT NULL DEFAULT 'one_way',
  vehicle_type_needed vehicle_type NOT NULL DEFAULT 'ambulatory',
  scheduled_pickup_time TIMESTAMPTZ NOT NULL,
  is_asap BOOLEAN DEFAULT FALSE,
  return_pickup_time TIMESTAMPTZ,
  status ride_status DEFAULT 'requested',
  is_shared BOOLEAN DEFAULT FALSE,
  shared_group_id UUID,
  special_notes TEXT,
  estimated_cost DECIMAL(10,2),
  final_cost DECIMAL(10,2),
  estimated_duration_minutes INTEGER,
  estimated_distance_miles DECIMAL(10,2),
  actual_pickup_time TIMESTAMPTZ,
  actual_dropoff_time TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status invoice_status DEFAULT 'draft',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  line_items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications Log
CREATE TABLE notifications_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status notification_status DEFAULT 'pending'
);

-- App Settings (for configurable pricing etc.)
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pricing
INSERT INTO app_settings (key, value) VALUES (
  'pricing',
  '{"base_rate": 25, "per_mile_rate": 2.5, "vehicle_multipliers": {"ambulatory": 1.0, "wheelchair": 1.3, "bariatric": 1.5, "stretcher": 2.0}, "shared_ride_discount": 0.2, "round_trip_multiplier": 1.8}'::jsonb
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_drivers_status ON drivers(status);
CREATE INDEX idx_drivers_vehicle ON drivers(vehicle_type);
CREATE INDEX idx_drivers_user ON drivers(user_id);
CREATE INDEX idx_rides_org ON rides(organization_id);
CREATE INDEX idx_rides_driver ON rides(driver_id);
CREATE INDEX idx_rides_status ON rides(status);
CREATE INDEX idx_rides_scheduled ON rides(scheduled_pickup_time);
CREATE INDEX idx_rides_booked_by ON rides(booked_by);
CREATE INDEX idx_rides_shared_group ON rides(shared_group_id);
CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_notifications_ride ON notifications_log(ride_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Organizations: admins see all, facility staff sees own org
CREATE POLICY "Admins can do everything with organizations" ON organizations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "Facility staff can view own organization" ON organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM users WHERE users.id = auth.uid())
  );

-- Users: admins see all, users see themselves
CREATE POLICY "Admins can do everything with users" ON users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (id = auth.uid());

-- Facility staff can see users in their org
CREATE POLICY "Facility staff can view org users" ON users
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users u WHERE u.id = auth.uid() AND u.role = 'facility_staff')
  );

-- Drivers: admins see all, drivers see themselves, facility staff can see driver details
CREATE POLICY "Admins can do everything with drivers" ON drivers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "Drivers can view and update own record" ON drivers
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Facility staff can view drivers" ON drivers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'facility_staff')
  );

-- Rides: admins see all, facility staff sees own org rides, drivers see assigned rides
CREATE POLICY "Admins can do everything with rides" ON rides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "Facility staff can manage own org rides" ON rides
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM users WHERE users.id = auth.uid() AND users.role = 'facility_staff')
  );

CREATE POLICY "Drivers can view assigned rides" ON rides
  FOR SELECT USING (
    driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid())
  );

CREATE POLICY "Drivers can update assigned rides" ON rides
  FOR UPDATE USING (
    driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid())
  );

-- Invoices: admins see all, facility staff sees own org invoices
CREATE POLICY "Admins can do everything with invoices" ON invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "Facility staff can view own org invoices" ON invoices
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE users.id = auth.uid() AND users.role = 'facility_staff')
  );

-- Notifications: admins see all, users see own
CREATE POLICY "Admins can do everything with notifications" ON notifications_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "Users can view own notifications" ON notifications_log
  FOR SELECT USING (user_id = auth.uid());

-- App Settings: admins can read/write, others can read
CREATE POLICY "Admins can manage settings" ON app_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "All users can read settings" ON app_settings
  FOR SELECT USING (true);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_rides_updated_at
  BEFORE UPDATE ON rides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable realtime for rides and drivers
ALTER PUBLICATION supabase_realtime ADD TABLE rides;
ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
