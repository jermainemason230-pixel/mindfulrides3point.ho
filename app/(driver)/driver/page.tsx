"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDriverLocation } from "@/hooks/useDriverLocation";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/rides/StatusBadge";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { MapPin, Navigation, Clock, Users, AlertTriangle } from "lucide-react";
import { format, isToday, isFuture } from "date-fns";
import type { Driver, Ride, RideStatus } from "@/types/database";

const STATUS_TRANSITIONS: Record<RideStatus, { next: RideStatus; label: string; color: string }> = {
  assigned: {
    next: "driver_en_route",
    label: "Start \u2014 Heading to Pickup",
    color: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  driver_en_route: {
    next: "arrived_at_pickup",
    label: "Arrived at Pickup",
    color: "bg-yellow-500 hover:bg-yellow-600 text-black",
  },
  arrived_at_pickup: {
    next: "in_transit",
    label: "Patient Picked Up",
    color: "bg-green-600 hover:bg-green-700 text-white",
  },
  in_transit: {
    next: "completed",
    label: "Ride Complete",
    color: "bg-green-800 hover:bg-green-900 text-white",
  },
  requested: { next: "requested", label: "", color: "" },
  arrived_at_dropoff: { next: "completed", label: "Ride Complete", color: "bg-green-800 hover:bg-green-900 text-white" },
  completed: { next: "completed", label: "", color: "" },
  cancelled: { next: "cancelled", label: "", color: "" },
  no_show: { next: "no_show", label: "", color: "" },
};

export default function DriverPage() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [driver, setDriver] = useState<Driver | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [loadingRides, setLoadingRides] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const isOnDuty = driver?.status !== "off_duty";

  // Track GPS when on duty
  useDriverLocation(driver?.id ?? null, isOnDuty);

  // Fetch driver record
  useEffect(() => {
    if (!profile) return;

    async function fetchDriver() {
      const res = await fetch("/api/drivers");
      const json = await res.json();
      const found = (json.drivers ?? []).find((d: any) => d.user_id === profile!.id);
      if (found) setDriver(found);
      else console.error("Driver record not found for user", profile!.id);
    }

    fetchDriver();
  }, [profile]);

  // Fetch assigned rides
  const fetchRides = useCallback(async () => {
    if (!driver) return;

    const res = await fetch(`/api/rides?driver_id=${driver.id}`);
    const json = await res.json();
    if (json.rides) {
      const active = json.rides.filter((r: any) =>
        ["assigned", "driver_en_route", "arrived_at_pickup", "in_transit", "arrived_at_dropoff"].includes(r.status)
      );
      setRides(active);
    }
    setLoadingRides(false);
  }, [driver]);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  // Listen for realtime ride updates
  const handleRealtimeUpdate = useCallback(() => {
    fetchRides();
  }, [fetchRides]);

  useRealtime(
    "rides",
    handleRealtimeUpdate,
    driver ? `driver_id=eq.${driver.id}` : undefined
  );

  // Toggle duty status

  // Update ride status
  const updateRideStatus = async (rideId: string, newStatus: RideStatus, notes?: string) => {
    setUpdatingStatus(rideId);

    // Optimistic update
    setRides((prev) =>
      prev.map((r) => (r.id === rideId ? { ...r, status: newStatus } : r))
    );

    try {
      const body: Record<string, unknown> = { status: newStatus };
      if (notes) body.cancellation_reason = notes;

      const res = await fetch(`/api/rides/${rideId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error("Failed to update ride");
      }

      await res.json();

      // If completed, remove from list
      if (newStatus === "completed" || newStatus === "no_show") {
        setRides((prev) => prev.filter((r) => r.id !== rideId));

        // Set driver back to available
        if (driver) {
          const supabase = createClient();
          await supabase
            .from("drivers")
            .update({ status: "available" })
            .eq("id", driver.id);
          setDriver((prev) => (prev ? { ...prev, status: "available" } : prev));
        }
      }

      toast(
        newStatus === "no_show"
          ? "Ride marked as no show"
          : "Ride status updated",
        "success"
      );
    } catch {
      // Revert on error
      fetchRides();
      toast("Failed to update ride status", "error");
    }

    setUpdatingStatus(null);
  };

  // Separate rides into today and upcoming
  const todayRides = rides.filter((r) =>
    isToday(new Date(r.scheduled_pickup_time))
  );
  const upcomingRides = rides.filter((r) =>
    isFuture(new Date(r.scheduled_pickup_time)) &&
    !isToday(new Date(r.scheduled_pickup_time))
  );

  if (!driver) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-yellow-500" />
        <p className="font-semibold text-gray-800">Driver profile not found</p>
        <p className="mt-1 text-sm text-gray-500">Your account exists but has no driver record. Please contact your administrator.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Status Display - Sticky below header */}
      <div className="sticky top-[52px] z-40 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Your Status</p>
            <p className={`text-lg font-bold ${isOnDuty ? "text-green-600" : "text-gray-400"}`}>
              {isOnDuty ? "Available" : "Off Duty"}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            isOnDuty ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}>
            {isOnDuty ? "On Shift" : "No Active Shift"}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-400">Your status is managed by your schedule</p>
      </div>

      {/* Today's Schedule */}
      <section className="px-4 pt-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Today&apos;s Schedule
        </h2>

        {loadingRides ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse bg-gray-100 rounded-lg h-40" />
            ))}
          </div>
        ) : todayRides.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-gray-400">No rides scheduled for today</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {todayRides.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                updatingStatus={updatingStatus}
                onStatusUpdate={updateRideStatus}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Rides */}
      {upcomingRides.length > 0 && (
        <section className="px-4 pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Upcoming Rides
          </h2>
          <div className="space-y-3">
            {upcomingRides.map((ride) => (
              <Card key={ride.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-base font-semibold text-gray-900">
                    {ride.patient_name}
                  </p>
                  <StatusBadge status={ride.status} />
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Clock size={14} />
                  <span>
                    {format(new Date(ride.scheduled_pickup_time), "EEE, MMM d 'at' h:mm a")}
                  </span>
                </div>
                <div className="flex items-start gap-1.5 text-sm text-gray-500 mt-1">
                  <MapPin size={14} className="mt-0.5 shrink-0" />
                  <span className="line-clamp-1">{ride.pickup_address}</span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Empty state when off duty and no rides */}
      {!isOnDuty && rides.length === 0 && !loadingRides && (
        <div className="px-4 pt-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <Navigation size={28} className="text-gray-400" />
          </div>
          <p className="text-gray-500 text-base">You are currently off duty</p>
          <p className="text-gray-400 text-sm mt-1">
            Your status will update automatically when your shift starts
          </p>
        </div>
      )}
    </div>
  );
}

// ---------- Ride Card Component ----------

function RideCard({
  ride,
  updatingStatus,
  onStatusUpdate,
}: {
  ride: Ride;
  updatingStatus: string | null;
  onStatusUpdate: (rideId: string, status: RideStatus, notes?: string) => void;
}) {
  const [showNoShowForm, setShowNoShowForm] = useState(false);
  const [noShowNotes, setNoShowNotes] = useState("");
  const transition = STATUS_TRANSITIONS[ride.status];
  const isUpdating = updatingStatus === ride.id;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ride.pickup_address)}`;

  return (
    <Card className="p-4">
      {/* Patient name & status */}
      <div className="flex items-start justify-between mb-3">
        <p className="text-lg font-semibold text-gray-900">{ride.patient_name}</p>
        <StatusBadge status={ride.status} />
      </div>

      {/* Scheduled time */}
      <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-2">
        <Clock size={14} className="shrink-0" />
        <span>{format(new Date(ride.scheduled_pickup_time), "h:mm a")}</span>
      </div>

      {/* Pickup address with maps link */}
      <div className="flex items-start gap-1.5 mb-1.5">
        <MapPin size={14} className="mt-0.5 shrink-0 text-green-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 leading-none mb-0.5">Pickup</p>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 underline underline-offset-2 break-words"
          >
            {ride.pickup_address}
          </a>
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-2 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          aria-label="Open in Google Maps"
        >
          <Navigation size={16} className="text-blue-600" />
        </a>
      </div>

      {/* Dropoff address */}
      <div className="flex items-start gap-1.5 mb-3">
        <MapPin size={14} className="mt-0.5 shrink-0 text-red-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 leading-none mb-0.5">Drop-off</p>
          <p className="text-sm text-gray-900 break-words">{ride.dropoff_address}</p>
        </div>
      </div>

      {/* Vehicle type, service level & shared indicator */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-full capitalize">
          {ride.vehicle_type_needed}
        </span>
        {ride.passenger_count > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
            <Users size={11} />
            {ride.passenger_count} passenger{ride.passenger_count !== 1 ? "s" : ""}
          </span>
        )}
        {ride.service_level && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
            ride.service_level === "door_through_door"
              ? "bg-orange-100 text-orange-700"
              : ride.service_level === "door_to_door"
              ? "bg-blue-100 text-blue-700"
              : "bg-gray-100 text-gray-600"
          }`}>
            {ride.service_level === "curb_to_curb" && "Curb-to-Curb"}
            {ride.service_level === "door_to_door" && "Door-to-Door"}
            {ride.service_level === "door_through_door" && "Door-Through-Door"}
          </span>
        )}
        {ride.is_shared && (
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
            <Users size={12} />
            Shared Ride
          </span>
        )}
        {ride.ride_direction && ride.ride_direction !== "other" && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
            ride.ride_direction === "to_appointment"
              ? "bg-purple-50 text-purple-700"
              : "bg-orange-50 text-orange-700"
          }`}>
            {ride.ride_direction === "to_appointment" ? "→ To Appointment" : "← From Appointment"}
          </span>
        )}
      </div>

      {/* Appointment time alert */}
      {ride.ride_direction === "to_appointment" && ride.appointment_time && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-purple-50 border border-purple-200 px-3 py-2">
          <Clock size={13} className="shrink-0 text-purple-600" />
          <p className="text-xs text-purple-800 font-medium">
            Appointment at {format(new Date(ride.appointment_time), "h:mm a")} — rider must arrive on time
          </p>
        </div>
      )}
      {ride.ride_direction === "from_appointment" && ride.appointment_time && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
          <Clock size={13} className="shrink-0 text-orange-600" />
          <p className="text-xs text-orange-800 font-medium">
            Appointment ends {format(new Date(ride.appointment_time), "h:mm a")} — do not pick up before then
          </p>
        </div>
      )}

      {/* Special notes */}
      {ride.special_notes && (
        <div className="flex items-start gap-1.5 mb-3 p-2 bg-yellow-50 rounded-lg">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-yellow-600" />
          <p className="text-sm text-yellow-800">{ride.special_notes}</p>
        </div>
      )}

      {/* Action Buttons */}
      {transition.label && (
        <div className="space-y-2 pt-1">
          <button
            onClick={() => onStatusUpdate(ride.id, transition.next)}
            disabled={isUpdating}
            className={`w-full min-h-[56px] rounded-xl font-semibold text-base transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 disabled:cursor-wait ${transition.color}`}
          >
            {isUpdating ? "Updating..." : transition.label}
          </button>

          {/* No Show button / form when arrived at pickup */}
          {ride.status === "arrived_at_pickup" && (
            showNoShowForm ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-3">
                <p className="text-sm font-semibold text-red-700">No Show — Add Notes</p>
                <textarea
                  className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  rows={3}
                  placeholder="Describe the situation (e.g. patient didn't answer door, called and no response...)"
                  value={noShowNotes}
                  onChange={(e) => setNoShowNotes(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowNoShowForm(false); setNoShowNotes(""); }}
                    disabled={isUpdating}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onStatusUpdate(ride.id, "no_show", noShowNotes)}
                    disabled={isUpdating}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-wait"
                  >
                    {isUpdating ? "Submitting..." : "Confirm No Show"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNoShowForm(true)}
                disabled={isUpdating}
                className="w-full min-h-[56px] rounded-xl font-semibold text-base bg-red-600 hover:bg-red-700 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-wait"
              >
                No Show
              </button>
            )
          )}
        </div>
      )}
    </Card>
  );
}
