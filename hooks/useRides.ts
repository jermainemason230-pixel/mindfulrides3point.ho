"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Ride } from "@/types/database";
import { useRealtime } from "./useRealtime";

export function useRides(organizationId?: string, driverId?: string) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRides = useCallback(async () => {
    const supabase = createClient();
    let query = supabase
      .from("rides")
      .select("*, organization:organizations(*), driver:drivers(*, user:users(*))")
      .order("scheduled_pickup_time", { ascending: true });

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    if (driverId) {
      query = query.eq("driver_id", driverId);
    }

    const { data } = await query;
    setRides((data as Ride[]) || []);
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
