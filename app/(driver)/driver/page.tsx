"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDriverLocation } from "@/hooks/useDriverLocation";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/rides/StatusBadge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { MapPin, Navigation, Clock, Users, AlertTriangle } from "lucide-react";
import { format, isToday, isFuture } from "date-fns";
import type { Driver, Ride, DriverStatus, RideStatus } from "@/types/database";

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
  const [togglingDuty, setTogglingDuty] = useState(false);

  const isOnDuty = driver?.status !== "off_duty";

  // Track GPS when on duty
  useDriverLocation(driver?.id ?? null, isOnDuty);

  // Fetch driver record
  useEffect(() => {
    if (!profile) return;

    const supabase = createClient();

    async function fetchDriver() {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .eq("user_id", profile!.id)
        .single();

      if (error) {
        console.error("Failed to fetch driver:", error);
        return;
      }
      setDriver(data);
    }

    fetchDriver();
  }, [profile]);

  // Fetch assigned rides
  const fetchRides = useCallback(async () => {
    if (!driver) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("rides")
      .select("*")
      .eq("driver_id", driver.id)
      .in("status", [
        "assigned",
        "driver_en_route",
        "arrived_at_pickup",
        "in_transit",
        "arrived_at_dropoff",
      ])
      .order("scheduled_pickup_time", { ascending: true });

    if (error) {
      console.error("Failed to fetch rides:", error);
      return;
    }
    setRides(data || []);
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
  const toggleDutyStatus = async () => {
    if (!driver) return;
    setTogglingDuty(true);

    const newStatus: DriverStatus = isOnDuty ? "off_duty" : "available";
    const supabase = createClient();

    // Optimistic update
    setDriver((prev) => (prev ? { ...prev, status: newStatus } : prev));

    const { error } = await supabase
      .from("drivers")
      .update({ status: newStatus })
      .eq("id", driver.id);

    if (error) {
      // Revert on error
      setDriver((prev) =>
        prev ? { ...prev, status: isOnDuty ? "available" : "off_duty" } : prev
      );
      toast("Failed to update status", "error");
    } else {
      toast(
        newStatus === "available" ? "You are now available" : "You are now off duty",
        "success"
      );
    }
    setTogglingDuty(false);
  };

  // Update ride status
  const updateRideStatus = async (rideId: string, newStatus: RideStatus) => {
    setUpdatingStatus(rideId);

    // Optimistic update
    setRides((prev) =>
      prev.map((r) => (r.id === rideId ? { ...r, status: newStatus } : r))
    );

    try {
      const res = await fetch(`/api/rides/${rideId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update ride");
      }

      const { ride } = await res.json();

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

  return (
    <div className="max-w-lg mx-auto">
      {/* Status Toggle - Sticky below header */}
      <div className="sticky top-[52px] z-40 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Your Status</p>
            <p className={`text-lg font-bold ${isOnDuty ? "text-green-600" : "text-gray-400"}`}>
              {isOnDuty ? "Available" : "Off Duty"}
            </p>
          </div>
          <button
            onClick={toggleDutyStatus}
            disabled={togglingDuty}
            className={`relative w-16 h-9 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${
              isOnDuty ? "bg-green-500" : "bg-gray-300"
            } ${togglingDuty ? "opacity-50 cursor-wait" : ""}`}
            aria-label={isOnDuty ? "Go off duty" : "Go available"}
          >
            <span
              className={`absolute top-1 left-1 w-7 h-7 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                isOnDuty ? "translate-x-7" : "translate-x-0"
              }`}
            />
          </button>
        </div>
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
            Toggle the switch above to go available
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
  onStatusUpdate: (rideId: string, status: RideStatus) => void;
}) {
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

      {/* Vehicle type & shared indicator */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-full capitalize">
          {ride.vehicle_type_needed}
        </span>
        {ride.is_shared && (
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
            <Users size={12} />
            Shared Ride
          </span>
        )}
      </div>

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

          {/* No Show button when arrived at pickup */}
          {ride.status === "arrived_at_pickup" && (
            <button
              onClick={() => onStatusUpdate(ride.id, "no_show")}
              disabled={isUpdating}
              className="w-full min-h-[56px] rounded-xl font-semibold text-base bg-red-600 hover:bg-red-700 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-wait"
            >
              {isUpdating ? "Updating..." : "No Show"}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
