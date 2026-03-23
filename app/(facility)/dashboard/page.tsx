"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Plus, MapPin, Clock, User, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTodayRides } from "@/hooks/useRides";
import { useRealtime } from "@/hooks/useRealtime";
import { createClient } from "@/lib/supabase/client";
import { formatAddress, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/rides/StatusBadge";
import type { Ride, RideStatus, VehicleType, RideType } from "@/types/database";

/* ------------------------------------------------------------------ */
/*  Filter Tabs                                                        */
/* ------------------------------------------------------------------ */

type FilterTab = "all" | "upcoming" | "in_progress" | "completed" | "cancelled";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

const UPCOMING_STATUSES: RideStatus[] = ["requested", "assigned"];
const IN_PROGRESS_STATUSES: RideStatus[] = [
  "driver_en_route",
  "arrived_at_pickup",
  "in_transit",
  "arrived_at_dropoff",
];

function filterRides(rides: Ride[], tab: FilterTab): Ride[] {
  switch (tab) {
    case "upcoming":
      return rides.filter((r) => UPCOMING_STATUSES.includes(r.status));
    case "in_progress":
      return rides.filter((r) => IN_PROGRESS_STATUSES.includes(r.status));
    case "completed":
      return rides.filter((r) => r.status === "completed");
    case "cancelled":
      return rides.filter((r) =>
        r.status === "cancelled" || r.status === "no_show"
      );
    default:
      return rides;
  }
}

/* ------------------------------------------------------------------ */
/*  Booking Modal                                                      */
/* ------------------------------------------------------------------ */

interface BookingForm {
  patient_name: string;
  patient_phone: string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type_needed: VehicleType;
  ride_type: RideType;
  is_asap: boolean;
  scheduled_pickup_time: string;
  special_notes: string;
}

const INITIAL_FORM: BookingForm = {
  patient_name: "",
  patient_phone: "",
  pickup_address: "",
  dropoff_address: "",
  vehicle_type_needed: "ambulatory",
  ride_type: "one_way",
  is_asap: true,
  scheduled_pickup_time: "",
  special_notes: "",
};

const VEHICLE_OPTIONS = [
  { value: "ambulatory", label: "Ambulatory" },
  { value: "wheelchair", label: "Wheelchair" },
  { value: "bariatric", label: "Bariatric" },
  { value: "stretcher", label: "Stretcher" },
];

const STEPS = ["Patient Info", "Addresses", "Ride Options", "Confirm"];

function BookingModal({
  isOpen,
  onClose,
  organizationId,
  bookedBy,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  bookedBy: string;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<BookingForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const { toast } = useToast();

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setForm(INITIAL_FORM);
      setEstimatedCost(null);
    }
  }, [isOpen]);

  // Estimate cost when reaching confirm step
  useEffect(() => {
    if (step === 3) {
      // Simple estimate: base rate + vehicle multiplier
      const baseRate = 25;
      const vehicleMultipliers: Record<VehicleType, number> = {
        ambulatory: 1,
        wheelchair: 1.3,
        bariatric: 1.5,
        stretcher: 2,
      };
      const multiplier = vehicleMultipliers[form.vehicle_type_needed];
      const roundTripMultiplier = form.ride_type === "round_trip" ? 1.8 : 1;
      setEstimatedCost(baseRate * multiplier * roundTripMultiplier);
    }
  }, [step, form.vehicle_type_needed, form.ride_type]);

  function update(field: keyof BookingForm, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return form.patient_name.trim().length > 0;
      case 1:
        return (
          form.pickup_address.trim().length > 0 &&
          form.dropoff_address.trim().length > 0
        );
      case 2:
        return form.is_asap || form.scheduled_pickup_time.length > 0;
      default:
        return true;
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const payload = {
        organization_id: organizationId,
        booked_by: bookedBy,
        patient_name: form.patient_name,
        patient_phone: form.patient_phone || null,
        pickup_address: form.pickup_address,
        dropoff_address: form.dropoff_address,
        vehicle_type_needed: form.vehicle_type_needed,
        ride_type: form.ride_type,
        is_asap: form.is_asap,
        scheduled_pickup_time: form.is_asap
          ? new Date().toISOString()
          : new Date(form.scheduled_pickup_time).toISOString(),
        special_notes: form.special_notes || null,
        estimated_cost: estimatedCost,
      };

      const res = await fetch("/api/rides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to book ride");
      }

      toast("Ride booked successfully!", "success");
      onSuccess();
      onClose();
    } catch {
      toast("Failed to book ride. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Book a Ride" size="lg">
      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                  i < step
                    ? "bg-black text-white"
                    : i === step
                    ? "bg-[#276EF1] text-white"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {i + 1}
              </div>
              <span className="mt-1 text-[10px] font-medium text-gray-500 whitespace-nowrap">
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mt-[-14px] ${
                  i < step ? "bg-black" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Patient Info */}
      {step === 0 && (
        <div className="space-y-4">
          <Input
            label="Patient Name"
            placeholder="Full name"
            required
            value={form.patient_name}
            onChange={(e) => update("patient_name", e.target.value)}
          />
          <Input
            label="Patient Phone"
            placeholder="(555) 123-4567"
            type="tel"
            value={form.patient_phone}
            onChange={(e) => update("patient_phone", e.target.value)}
          />
        </div>
      )}

      {/* Step 2: Addresses */}
      {step === 1 && (
        <div className="space-y-4">
          <Input
            label="Pickup Address"
            placeholder="Enter pickup address"
            required
            value={form.pickup_address}
            onChange={(e) => update("pickup_address", e.target.value)}
          />
          <Input
            label="Dropoff Address"
            placeholder="Enter dropoff address"
            required
            value={form.dropoff_address}
            onChange={(e) => update("dropoff_address", e.target.value)}
          />
        </div>
      )}

      {/* Step 3: Ride Options */}
      {step === 2 && (
        <div className="space-y-5">
          <Select
            label="Vehicle Type"
            options={VEHICLE_OPTIONS}
            value={form.vehicle_type_needed}
            onChange={(e) =>
              update("vehicle_type_needed", e.target.value)
            }
          />

          {/* One-way / Round-trip toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trip Type
            </label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                type="button"
                onClick={() => update("ride_type", "one_way")}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  form.ride_type === "one_way"
                    ? "bg-black text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                One Way
              </button>
              <button
                type="button"
                onClick={() => update("ride_type", "round_trip")}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  form.ride_type === "round_trip"
                    ? "bg-black text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Round Trip
              </button>
            </div>
          </div>

          {/* ASAP / Scheduled toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              When
            </label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                type="button"
                onClick={() => update("is_asap", true)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  form.is_asap
                    ? "bg-black text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                ASAP
              </button>
              <button
                type="button"
                onClick={() => update("is_asap", false)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  !form.is_asap
                    ? "bg-black text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Scheduled
              </button>
            </div>
          </div>

          {!form.is_asap && (
            <Input
              label="Pickup Date & Time"
              type="datetime-local"
              required
              value={form.scheduled_pickup_time}
              onChange={(e) =>
                update("scheduled_pickup_time", e.target.value)
              }
            />
          )}

          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Special Notes
            </label>
            <textarea
              placeholder="Any special requirements or instructions..."
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              value={form.special_notes}
              onChange={(e) => update("special_notes", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500">Patient</span>
              <span className="text-sm font-medium text-gray-900">
                {form.patient_name}
              </span>
            </div>
            {form.patient_phone && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-sm text-gray-500">Phone</span>
                <span className="text-sm font-medium text-gray-900">
                  {form.patient_phone}
                </span>
              </div>
            )}
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500">Pickup</span>
              <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">
                {form.pickup_address}
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500">Dropoff</span>
              <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">
                {form.dropoff_address}
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500">Vehicle</span>
              <span className="text-sm font-medium text-gray-900 capitalize">
                {form.vehicle_type_needed}
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500">Trip</span>
              <span className="text-sm font-medium text-gray-900">
                {form.ride_type === "one_way" ? "One Way" : "Round Trip"}
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500">When</span>
              <span className="text-sm font-medium text-gray-900">
                {form.is_asap
                  ? "ASAP"
                  : format(
                      new Date(form.scheduled_pickup_time),
                      "MMM d, yyyy h:mm a"
                    )}
              </span>
            </div>
            {form.special_notes && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-sm text-gray-500">Notes</span>
                <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">
                  {form.special_notes}
                </span>
              </div>
            )}
            <div className="flex justify-between px-4 py-3 bg-gray-50 rounded-b-lg">
              <span className="text-sm font-semibold text-gray-900">
                Estimated Cost
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {estimatedCost !== null
                  ? formatCurrency(estimatedCost)
                  : "Calculating..."}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between mt-8 pt-4 border-t border-gray-100">
        <Button
          variant="secondary"
          onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
          disabled={submitting}
        >
          {step === 0 ? "Cancel" : "Back"}
        </Button>

        {step < 3 ? (
          <Button
            className="bg-[#276EF1] hover:bg-[#1E54B7] min-w-[120px] min-h-[44px]"
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
          >
            Continue
          </Button>
        ) : (
          <Button
            className="bg-[#276EF1] hover:bg-[#1E54B7] min-w-[120px] min-h-[44px]"
            loading={submitting}
            onClick={handleSubmit}
          >
            Book Ride
          </Button>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Ride Card                                                          */
/* ------------------------------------------------------------------ */

function RideCard({
  ride,
  onViewDetails,
}: {
  ride: Ride;
  onViewDetails: (id: string) => void;
}) {
  const driverName =
    ride.driver?.user?.full_name ?? null;

  return (
    <Card
      className="p-4 hover:shadow-md transition-shadow"
      onClick={() => onViewDetails(ride.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Patient & Time */}
          <div className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-900 truncate">
              {ride.patient_name}
            </span>
            <span className="text-xs text-gray-500 flex-shrink-0">
              {format(new Date(ride.scheduled_pickup_time), "h:mm a")}
            </span>
          </div>

          {/* Addresses */}
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
            <span className="text-xs text-gray-600 truncate">
              {formatAddress(ride.pickup_address)}
            </span>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
            <span className="text-xs text-gray-600 truncate">
              {formatAddress(ride.dropoff_address)}
            </span>
          </div>

          {/* Bottom row */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={ride.status} />
            {driverName && (
              <span className="text-xs text-gray-500">
                {driverName}
              </span>
            )}
            {ride.is_shared && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">
                <Users className="h-3 w-3" />
                Shared
              </span>
            )}
          </div>
        </div>

        {/* Time indicator */}
        <div className="flex items-center gap-1 text-gray-400 flex-shrink-0">
          <Clock className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                    */
/* ------------------------------------------------------------------ */

function DashboardSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Skeleton className="h-14 w-48 rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                     */
/* ------------------------------------------------------------------ */

export default function FacilityDashboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const organizationId = profile?.organization_id ?? "";
  const { rides: todayRides, loading: ridesLoading } = useTodayRides(
    organizationId || undefined
  );
  const { toast } = useToast();

  const [bookingOpen, setBookingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [upcomingRides, setUpcomingRides] = useState<Ride[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);

  // Fetch upcoming rides (after today)
  const fetchUpcoming = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data } = await supabase
      .from("rides")
      .select(
        "*, organization:organizations(*), driver:drivers(*, user:users(*))"
      )
      .eq("organization_id", organizationId)
      .gte("scheduled_pickup_time", tomorrow.toISOString())
      .in("status", ["requested", "assigned"])
      .order("scheduled_pickup_time", { ascending: true })
      .limit(20);

    setUpcomingRides((data as Ride[]) || []);
    setUpcomingLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchUpcoming();
  }, [fetchUpcoming]);

  // Real-time updates for upcoming rides
  const handleRealtimeChange = useCallback(() => {
    fetchUpcoming();
  }, [fetchUpcoming]);

  useRealtime(
    "rides",
    handleRealtimeChange,
    organizationId ? `organization_id=eq.${organizationId}` : undefined
  );

  async function handleCancelRide(rideId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("rides")
      .update({ status: "cancelled" })
      .eq("id", rideId);

    if (error) {
      toast("Failed to cancel ride.", "error");
    } else {
      toast("Ride cancelled.", "success");
      fetchUpcoming();
    }
  }

  function handleViewDetails(id: string) {
    window.location.href = `/rides/${id}`;
  }

  if (authLoading || (ridesLoading && !todayRides.length)) {
    return <DashboardSkeleton />;
  }

  const filteredTodayRides = filterRides(todayRides, activeTab);

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Header + Book a Ride */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <Button
          size="lg"
          className="bg-[#276EF1] hover:bg-[#1E54B7] min-h-[48px] px-6 shadow-lg shadow-blue-500/25"
          onClick={() => setBookingOpen(true)}
        >
          <Plus className="h-5 w-5 mr-2" />
          Book a Ride
        </Button>
      </div>

      {/* Booking Modal */}
      {profile && (
        <BookingModal
          isOpen={bookingOpen}
          onClose={() => setBookingOpen(false)}
          organizationId={organizationId}
          bookedBy={profile.id}
          onSuccess={fetchUpcoming}
        />
      )}

      {/* Today's Rides */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Today&apos;s Rides
          <span className="ml-2 text-sm font-normal text-gray-400">
            ({todayRides.length})
          </span>
        </h2>

        {/* Filter Tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-colors min-h-[36px] ${
                activeTab === tab.key
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Ride Cards */}
        {ridesLoading ? (
          <div className="space-y-3">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
        ) : filteredTodayRides.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-gray-500">
              {activeTab === "all"
                ? "No rides scheduled for today."
                : `No ${activeTab.replace("_", " ")} rides today.`}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredTodayRides.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Rides */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Upcoming Rides
          <span className="ml-2 text-sm font-normal text-gray-400">
            ({upcomingRides.length})
          </span>
        </h2>

        {upcomingLoading ? (
          <div className="space-y-3">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
        ) : upcomingRides.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-gray-500">
              No upcoming rides scheduled.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcomingRides.map((ride) => (
              <Card key={ride.id} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900">
                        {ride.patient_name}
                      </span>
                      <StatusBadge status={ride.status} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>
                        {format(
                          new Date(ride.scheduled_pickup_time),
                          "MMM d, h:mm a"
                        )}
                      </span>
                      <span className="truncate">
                        {formatAddress(ride.pickup_address)} &rarr;{" "}
                        {formatAddress(ride.dropoff_address)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-[36px]"
                      onClick={() => handleViewDetails(ride.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="min-h-[36px]"
                      onClick={() => handleCancelRide(ride.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
