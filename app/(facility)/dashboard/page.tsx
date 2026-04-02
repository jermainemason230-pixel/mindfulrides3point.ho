"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Plus, MapPin, Clock, User, Users, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTodayRides } from "@/hooks/useRides";
import { useRealtime } from "@/hooks/useRealtime";
import { createClient } from "@/lib/supabase/client";
import { formatAddress, formatCurrency } from "@/lib/utils";
import { geocodeAddress, getRouteDistance } from "@/lib/mapbox/geocoding";
import { calculateRideCost } from "@/lib/pricing";
import { BUFFERS, totalBlockedMinutes, formatDuration } from "@/lib/ride-buffers";
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

type ServiceLevel = "curb_to_curb" | "door_to_door" | "door_through_door";
type RideDirection = "to_appointment" | "from_appointment" | "other";

interface BookingForm {
  patient_name: string;
  patient_phone: string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type_needed: VehicleType;
  ride_type: RideType;
  service_level: ServiceLevel;
  passenger_count: number;
  is_asap: boolean;
  scheduled_pickup_time: string;
  special_notes: string;
  ride_direction: RideDirection;
  allow_shared_ride: boolean;
  appointment_time: string;
}

const INITIAL_FORM: BookingForm = {
  patient_name: "",
  patient_phone: "",
  pickup_address: "",
  dropoff_address: "",
  vehicle_type_needed: "ambulatory",
  ride_type: "one_way",
  service_level: "curb_to_curb",
  passenger_count: 1,
  is_asap: true,
  scheduled_pickup_time: "",
  special_notes: "",
  ride_direction: "other",
  allow_shared_ride: true,
  appointment_time: "",
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
  isAdmin,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  bookedBy: string;
  isAdmin: boolean;
  onSuccess: () => void;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<BookingForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [addressErrors, setAddressErrors] = useState<{ pickup?: string; dropoff?: string }>({});
  const [validatingAddresses, setValidatingAddresses] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState(organizationId);
  const { toast } = useToast();

  // Fetch orgs for admin users
  useEffect(() => {
    if (!isAdmin || !isOpen) return;
    fetch("/api/facilities")
      .then((r) => r.json())
      .then(({ facilities }) => {
        if (facilities && facilities.length > 0) {
          setOrganizations(facilities);
          setSelectedOrgId(facilities[0].id);
        }
      });
  }, [isAdmin, isOpen]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setForm(INITIAL_FORM);
      setEstimatedCost(null);
      setEstimatedMiles(null);
      setEstimatedDuration(null);
      setAvailability(null);
      setAddressErrors({});
      setAsapEta(null);
      setSelectedOrgId(organizationId);
    }
  }, [isOpen, organizationId]);

  const [estimatedMiles, setEstimatedMiles] = useState<number | null>(null);
  const [estimatedDuration, setEstimatedDuration] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [asapEta, setAsapEta] = useState<{ time: string; isNext: boolean } | null>(null);
  const [asapEtaLoading, setAsapEtaLoading] = useState(false);
  const [availability, setAvailability] = useState<{ available: boolean; driver_count: number; total_scheduled: number; conflict: boolean; conflict_count?: number; alternatives?: string[] } | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  // Fetch soonest available time when ASAP is selected on step 2
  useEffect(() => {
    if (step !== 2 || !form.is_asap) { setAsapEta(null); return; }
    setAsapEtaLoading(true);
    const now = new Date();
    const lpad = (n: number) => String(n).padStart(2, "0");
    const localDate = `${now.getFullYear()}-${lpad(now.getMonth()+1)}-${lpad(now.getDate())}`;
    const localTime = `${lpad(now.getHours())}:${lpad(now.getMinutes())}:00`;
    const params = new URLSearchParams({
      datetime: now.toISOString(),
      local_date: localDate,
      local_time: localTime,
      vehicle_type: form.vehicle_type_needed,
      passenger_count: String(form.passenger_count),
    });
    fetch(`/api/drivers/availability?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.available) {
          // Driver available now — pickup buffer applied
          const eta = new Date(now.getTime() + BUFFERS.asapDispatchMinutes * 60 * 1000);
          setAsapEta({ time: format(eta, "h:mm a"), isNext: false });
        } else if (data.alternatives && data.alternatives.length > 0) {
          // No driver now — show next available slot
          setAsapEta({ time: format(new Date(data.alternatives[0]), "h:mm a 'on' MMM d"), isNext: true });
        } else {
          setAsapEta(null);
        }
      })
      .catch(() => setAsapEta(null))
      .finally(() => setAsapEtaLoading(false));
  }, [step, form.is_asap, form.vehicle_type_needed, form.passenger_count]);

  // Check driver availability when reaching confirm step
  useEffect(() => {
    if (step !== 3) return;
    const datetime = form.is_asap ? new Date().toISOString() : new Date(form.scheduled_pickup_time).toISOString();
    if (!datetime) return;

    // Derive local date/time in the browser's timezone — matches how admins enter shift times
    const localRef = form.is_asap ? new Date() : new Date(form.scheduled_pickup_time);
    const lpad = (n: number) => String(n).padStart(2, "0");
    const localDate = `${localRef.getFullYear()}-${lpad(localRef.getMonth()+1)}-${lpad(localRef.getDate())}`;
    const localTime = `${lpad(localRef.getHours())}:${lpad(localRef.getMinutes())}:00`;

    setAvailabilityLoading(true);
    const params = new URLSearchParams({ datetime, local_date: localDate, local_time: localTime });
    if (estimatedDuration) params.set("duration_minutes", String(Math.round(estimatedDuration)));
    params.set("vehicle_type", form.vehicle_type_needed);
    params.set("passenger_count", String(form.passenger_count));
    fetch(`/api/drivers/availability?${params}`)
      .then((r) => r.json())
      .then((data) => setAvailability(data))
      .finally(() => setAvailabilityLoading(false));
  }, [step, form.is_asap, form.scheduled_pickup_time, estimatedDuration, form.vehicle_type_needed, form.passenger_count]);

  // Calculate real cost using Mapbox when reaching confirm step
  useEffect(() => {
    if (step !== 3 || !form.pickup_address || !form.dropoff_address) return;

    setCostLoading(true);
    (async () => {
      try {
        const [pickup, dropoff] = await Promise.all([
          geocodeAddress(form.pickup_address),
          geocodeAddress(form.dropoff_address),
        ]);

        if (pickup && dropoff) {
          const route = await getRouteDistance(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
          if (route) {
            setEstimatedMiles(Math.round(route.distanceMiles * 10) / 10);
            // Store total blocked time (pickup buffer + buffered ride + drop-off buffer)
            setEstimatedDuration(totalBlockedMinutes(Math.round(route.durationMinutes)));
            setEstimatedCost(
              calculateRideCost(
                route.distanceMiles,
                form.vehicle_type_needed,
                false,
                form.ride_type === "round_trip"
              )
            );
            return;
          }
        }
        // Fallback: flat estimate if geocoding fails
        setEstimatedCost(calculateRideCost(0, form.vehicle_type_needed, false, form.ride_type === "round_trip"));
      } finally {
        setCostLoading(false);
      }
    })();
  }, [step, form.pickup_address, form.dropoff_address, form.vehicle_type_needed, form.ride_type]);

  function update(field: keyof BookingForm, value: string | boolean | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "pickup_address") setAddressErrors((e) => ({ ...e, pickup: undefined }));
    if (field === "dropoff_address") setAddressErrors((e) => ({ ...e, dropoff: undefined }));
  }

  async function validateAndAdvance() {
    if (step !== 1) { setStep(step + 1); return; }
    setValidatingAddresses(true);
    setAddressErrors({});
    try {
      const [pickup, dropoff] = await Promise.all([
        geocodeAddress(form.pickup_address),
        geocodeAddress(form.dropoff_address),
      ]);
      const errors: { pickup?: string; dropoff?: string } = {};
      if (!pickup) errors.pickup = "Address not found. Please enter a valid address.";
      if (!dropoff) errors.dropoff = "Address not found. Please enter a valid address.";
      if (errors.pickup || errors.dropoff) {
        setAddressErrors(errors);
      } else {
        setStep(step + 1);
      }
    } catch {
      toast("Could not validate addresses. Please check your connection.", "error");
    } finally {
      setValidatingAddresses(false);
    }
  }

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return form.patient_name.trim().length > 0 && (!isAdmin || selectedOrgId.length > 0);
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
    if (!selectedOrgId) {
      toast("No organization assigned to your account. Please contact your administrator.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const pickupRef = form.is_asap ? new Date() : new Date(form.scheduled_pickup_time);
      const lpad = (n: number) => String(n).padStart(2, "0");
      const localDate = `${pickupRef.getFullYear()}-${lpad(pickupRef.getMonth()+1)}-${lpad(pickupRef.getDate())}`;
      const localTime = `${lpad(pickupRef.getHours())}:${lpad(pickupRef.getMinutes())}:00`;

      const payload = {
        organization_id: selectedOrgId,
        booked_by: bookedBy,
        patient_name: form.patient_name,
        patient_phone: form.patient_phone || null,
        pickup_address: form.pickup_address,
        dropoff_address: form.dropoff_address,
        vehicle_type_needed: form.vehicle_type_needed,
        ride_type: form.ride_type,
        service_level: form.service_level,
        passenger_count: form.passenger_count,
        local_date: localDate,
        local_time: localTime,
        is_asap: form.is_asap,
        scheduled_pickup_time: form.is_asap
          ? new Date().toISOString()
          : new Date(form.scheduled_pickup_time).toISOString(),
        special_notes: form.special_notes || null,
        ride_direction: form.ride_direction,
        allow_shared_ride: form.allow_shared_ride,
        appointment_time: form.appointment_time
          ? new Date(form.appointment_time).toISOString()
          : null,
        estimated_cost: estimatedCost,
      };

      const res = await fetch("/api/rides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast(errData.error ?? "Failed to book ride. Please try again.", "error");
        return;
      }

      toast("Ride booked successfully!", "success");
      onSuccess();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to book ride. Please try again.", "error");
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
          {isAdmin && (
            <Select
              label="Organization"
              required
              options={organizations.map((o) => ({ value: o.id, label: o.name }))}
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
            />
          )}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Total Passengers <span className="text-gray-400 font-normal">(including rider)</span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => update("passenger_count", Math.max(1, form.passenger_count - 1))}
                className="h-10 w-10 rounded-lg border border-gray-300 flex items-center justify-center text-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                disabled={form.passenger_count <= 1}
              >
                −
              </button>
              <span className="w-8 text-center text-lg font-semibold text-gray-900">
                {form.passenger_count}
              </span>
              <button
                type="button"
                onClick={() => update("passenger_count", Math.min(10, form.passenger_count + 1))}
                className="h-10 w-10 rounded-lg border border-gray-300 flex items-center justify-center text-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                disabled={form.passenger_count >= 10}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Addresses */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Input
              label="Pickup Address"
              placeholder="Enter pickup address"
              required
              value={form.pickup_address}
              onChange={(e) => update("pickup_address", e.target.value)}
            />
            {addressErrors.pickup && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <span>⚠</span> {addressErrors.pickup}
              </p>
            )}
          </div>
          <div>
            <Input
              label="Dropoff Address"
              placeholder="Enter dropoff address"
              required
              value={form.dropoff_address}
              onChange={(e) => update("dropoff_address", e.target.value)}
            />
            {addressErrors.dropoff && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <span>⚠</span> {addressErrors.dropoff}
              </p>
            )}
          </div>
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

          {/* Service Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Service Level
            </label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(
                [
                  { value: "curb_to_curb", label: "Curb-to-Curb" },
                  { value: "door_to_door", label: "Door-to-Door" },
                  { value: "door_through_door", label: "Door-Through-Door" },
                ] as { value: ServiceLevel; label: string }[]
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update("service_level", value)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    form.service_level === value
                      ? "bg-black text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {form.service_level === "curb_to_curb" && "Driver waits at the curb — patient walks to/from vehicle."}
              {form.service_level === "door_to_door" && "Driver assists patient to/from the building entrance."}
              {form.service_level === "door_through_door" && "Driver escorts patient inside the building and to their destination."}
            </p>
          </div>

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

            {/* ASAP ETA banner */}
            {form.is_asap && (
              <div className="mt-2 rounded-lg px-3 py-2.5 text-sm">
                {asapEtaLoading ? (
                  <p className="text-gray-400 animate-pulse">Checking driver availability...</p>
                ) : asapEta ? (
                  <div className={`rounded-lg px-3 py-2 ${asapEta.isNext ? "bg-yellow-50 border border-yellow-200 text-yellow-800" : "bg-green-50 border border-green-200 text-green-800"}`}>
                    {asapEta.isNext ? (
                      <>No drivers available right now. <span className="font-semibold">Next available: {asapEta.time}</span></>
                    ) : (
                      <>A driver can be there by approximately <span className="font-semibold">{asapEta.time}</span>.</>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg px-3 py-2 bg-red-50 border border-red-200 text-red-800">
                    No drivers available. Please schedule for a later time.
                  </div>
                )}
              </div>
            )}
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

          {/* Ride Direction */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ride Direction
            </label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(
                [
                  { value: "to_appointment", label: "To Appointment" },
                  { value: "from_appointment", label: "From Appointment" },
                  { value: "other", label: "Other" },
                ] as { value: RideDirection; label: string }[]
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { update("ride_direction", value); update("appointment_time", ""); }}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    form.ride_direction === value
                      ? "bg-black text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Appointment Time — only when direction is known */}
          {form.ride_direction !== "other" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {form.ride_direction === "to_appointment"
                  ? "Appointment Time (rider must arrive by)"
                  : "Appointment End Time (rider may leave after)"}
              </label>
              <input
                type="datetime-local"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                value={form.appointment_time}
                onChange={(e) => update("appointment_time", e.target.value)}
              />
            </div>
          )}

          {/* Shared Ride Preference */}
          <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Allow shared ride</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Another rider from this facility may share the vehicle if the detour adds
                no more than 20 min or 30% to either trip.
              </p>
            </div>
            <button
              type="button"
              onClick={() => update("allow_shared_ride", !form.allow_shared_ride)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                form.allow_shared_ride ? "bg-black" : "bg-gray-200"
              }`}
              role="switch"
              aria-checked={form.allow_shared_ride}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  form.allow_shared_ride ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

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
          {/* Availability Banner */}
          {availabilityLoading ? (
            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500 animate-pulse">
              Checking driver availability...
            </div>
          ) : availability ? (
            <div className={`rounded-lg px-4 py-3 text-sm ${
              availability.available
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}>
              <p className="font-medium">
                {availability.available ? (
                  <>{availability.driver_count} driver{availability.driver_count !== 1 ? "s" : ""} available for this time slot.</>
                ) : availability.conflict ? (
                  <>All scheduled drivers are already on rides during this window.</>
                ) : availability.total_scheduled > 0 ? (
                  <>Drivers are scheduled but unavailable during this window.</>
                ) : (
                  <>No drivers are scheduled for this time slot.</>
                )}
              </p>
              {!availability.available && availability.alternatives && availability.alternatives.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-red-700 mb-2">Available times nearby — click to select:</p>
                  <div className="flex flex-wrap gap-2">
                    {availability.alternatives.map((iso) => (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => {
                          const d = new Date(iso);
                          const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                          update("scheduled_pickup_time", local);
                          update("is_asap", false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-800 text-xs font-semibold hover:bg-red-50 transition-colors"
                      >
                        {format(new Date(iso), "MMM d, h:mm a")}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!availability.available && (!availability.alternatives || availability.alternatives.length === 0) && (
                <p className="mt-1 text-xs text-red-600">No available times found within 2 hours. Please contact your administrator.</p>
              )}
            </div>
          ) : null}

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
              <span className="text-sm text-gray-500">Passengers</span>
              <span className="text-sm font-medium text-gray-900">{form.passenger_count}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500">Vehicle</span>
              <span className="text-sm font-medium text-gray-900 capitalize">
                {form.vehicle_type_needed}
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500">Service Level</span>
              <span className="text-sm font-medium text-gray-900">
                {form.service_level === "curb_to_curb" && "Curb-to-Curb"}
                {form.service_level === "door_to_door" && "Door-to-Door"}
                {form.service_level === "door_through_door" && "Door-Through-Door"}
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500">Direction</span>
              <span className="text-sm font-medium text-gray-900">
                {form.ride_direction === "to_appointment" && "To Appointment"}
                {form.ride_direction === "from_appointment" && "From Appointment"}
                {form.ride_direction === "other" && "Other"}
              </span>
            </div>
            {form.ride_direction !== "other" && form.appointment_time && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-sm text-gray-500">
                  {form.ride_direction === "to_appointment" ? "Appt. Time" : "Appt. Ends"}
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {format(new Date(form.appointment_time), "MMM d, h:mm a")}
                </span>
              </div>
            )}
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500">Shared Ride</span>
              <span className="text-sm font-medium text-gray-900">
                {form.allow_shared_ride ? "Allowed" : "Ride alone"}
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
            {estimatedMiles !== null && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-sm text-gray-500">Distance</span>
                <span className="text-sm font-medium text-gray-900">
                  {estimatedMiles} mi
                </span>
              </div>
            )}
            {estimatedDuration !== null && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-sm text-gray-500">Est. Total Time</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatDuration(estimatedDuration)}
                  <span className="ml-1 text-xs text-gray-400">(incl. buffers)</span>
                </span>
              </div>
            )}
            <div className="flex justify-between px-4 py-3 bg-gray-50 rounded-b-lg">
              <span className="text-sm font-semibold text-gray-900">
                Estimated Cost
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {costLoading
                  ? "Calculating..."
                  : estimatedCost !== null
                  ? formatCurrency(estimatedCost)
                  : "—"}
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
            onClick={validateAndAdvance}
            disabled={!canProceed() || validatingAddresses}
            loading={validatingAddresses}
          >
            {validatingAddresses ? "Validating..." : "Continue"}
          </Button>
        ) : (
          <Button
            className="bg-[#276EF1] hover:bg-[#1E54B7] min-w-[120px] min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
            loading={submitting}
            disabled={availability !== null && !availability.available}
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
            {ride.ride_direction !== "other" && ride.ride_direction && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                ride.ride_direction === "to_appointment"
                  ? "bg-purple-50 text-purple-700"
                  : "bg-orange-50 text-orange-700"
              }`}>
                {ride.ride_direction === "to_appointment" ? "→ Appt" : "← Appt"}
              </span>
            )}
            {driverName && (
              <span className="text-xs text-gray-500">{driverName}</span>
            )}
            {ride.is_shared && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">
                <Users className="h-3 w-3" />
                Shared
              </span>
            )}
            {!ride.allow_shared_ride && (
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                Alone
              </span>
            )}
          </div>

          {/* No-show / cancellation notes */}
          {(ride.status === "no_show" || ride.status === "cancelled") && ride.cancellation_reason && (
            <div className="mt-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
              <p className="text-xs font-semibold text-red-600 mb-0.5">Driver Note</p>
              <p className="text-xs text-red-800">{ride.cancellation_reason}</p>
            </div>
          )}
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
  const isAdminUser = profile?.role === "admin";
  const organizationId = profile?.organization_id ?? "";
  const { rides: todayRides, loading: ridesLoading } = useTodayRides(
    isAdminUser ? undefined : (organizationId || undefined)
  );
  const { toast } = useToast();

  const [bookingOpen, setBookingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [upcomingRides, setUpcomingRides] = useState<Ride[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);

  // Fetch upcoming rides (after today)
  const fetchUpcoming = useCallback(async () => {
    if (!isAdminUser && !organizationId) return;
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const params = new URLSearchParams({
      date_from: tomorrow.toISOString(),
      limit: "20",
    });
    if (!isAdminUser && organizationId) params.set("organization_id", organizationId);

    const res = await fetch(`/api/rides?${params}`);
    const json = await res.json();
    setUpcomingRides((json.rides as Ride[]) || []);
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

  // Ride search (all rides)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Ride[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const isSearching = searchQuery.trim().length > 0;

  useEffect(() => {
    if (!isSearching) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({ limit: "100" });
        if (!isAdminUser && organizationId) params.set("organization_id", organizationId);
        const res = await fetch(`/api/rides?${params}`);
        const json = await res.json();
        const q = searchQuery.toLowerCase();
        const filtered = ((json.rides as Ride[]) || []).filter(
          (r) =>
            r.patient_name?.toLowerCase().includes(q) ||
            r.pickup_address?.toLowerCase().includes(q) ||
            r.dropoff_address?.toLowerCase().includes(q)
        );
        setSearchResults(filtered);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, organizationId, isAdminUser, isSearching]);

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
          organizationId={isAdminUser ? "" : organizationId}
          bookedBy={profile.id}
          isAdmin={isAdminUser}
          onSuccess={fetchUpcoming}
        />
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search all rides by patient name or address..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-10 py-3 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
        />
        {isSearching && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search Results */}
      {isSearching ? (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Search Results
            {!searchLoading && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({searchResults.length})
              </span>
            )}
          </h2>
          {searchLoading ? (
            <div className="space-y-3">
              <Skeleton variant="card" />
              <Skeleton variant="card" />
              <Skeleton variant="card" />
            </div>
          ) : searchResults.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-gray-500">No rides found matching &ldquo;{searchQuery}&rdquo;.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {searchResults.map((ride) => (
                <Card key={ride.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleViewDetails(ride.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{ride.patient_name}</span>
                        <StatusBadge status={ride.status} />
                        <span className="text-xs text-gray-400">
                          {format(new Date(ride.scheduled_pickup_time), "MMM d, yyyy h:mm a")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <MapPin className="h-3 w-3 text-green-500 shrink-0" />
                        <span className="text-xs text-gray-600 truncate">{formatAddress(ride.pickup_address)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <MapPin className="h-3 w-3 text-red-500 shrink-0" />
                        <span className="text-xs text-gray-600 truncate">{formatAddress(ride.dropoff_address)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                        {ride.driver?.user?.full_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {ride.driver.user.full_name}
                          </span>
                        )}
                        {ride.estimated_cost != null && (
                          <span>{formatCurrency(ride.estimated_cost)}</span>
                        )}
                      </div>
                      {(ride.status === "no_show" || ride.status === "cancelled") && ride.cancellation_reason && (
                        <div className="mt-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                          <p className="text-xs font-semibold text-red-600 mb-0.5">Driver Note</p>
                          <p className="text-xs text-red-800">{ride.cancellation_reason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
