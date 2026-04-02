"use client";

import { useState, useEffect, useCallback } from "react";
import { Ride } from "@/types/database";
import { useRealtime } from "./useRealtime";

export function useRides(organizationId?: string, driverId?: string) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRides = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    if (organizationId) params.set("organization_id", organizationId);
    if (driverId) params.set("driver_id", driverId);

    const res = await fetch(`/api/rides?${params}`);
    const json = await res.json();
    setRides((json.rides as Ride[]) || []);
    setLoading(false);
  }, [organizationId, driverId]);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  const handleRealtimeChange = useCallback(() => {
    fetchRides();
  }, [fetchRides]);

  useRealtime("rides", handleRealtimeChange);

  return { rides, loading, refetch: fetchRides };
}

export function useTodayRides(organizationId?: string, driverId?: string) {
  const { rides, loading, refetch } = useRides(organizationId, driverId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayRides = rides.filter((ride) => {
    const rideDate = new Date(ride.scheduled_pickup_time);
    return rideDate >= today && rideDate < tomorrow;
  });

  return { rides: todayRides, loading, refetch };
}
