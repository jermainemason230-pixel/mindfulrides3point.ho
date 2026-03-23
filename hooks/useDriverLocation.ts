"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const UPDATE_INTERVAL = 10000; // 10 seconds

export function useDriverLocation(driverId: string | null, isOnDuty: boolean) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!driverId || !isOnDuty) {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      return;
    }

    const supabase = createClient();

    async function updateLocation(lat: number, lng: number) {
      setPosition({ lat, lng });
      await supabase
        .from("drivers")
        .update({
          current_lat: lat,
          current_lng: lng,
          last_location_update: new Date().toISOString(),
        })
        .eq("id", driverId!);
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        updateLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    // Also send periodic updates
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude),
        () => {}
      );
    }, UPDATE_INTERVAL);

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [driverId, isOnDuty]);

  return { position, error };
}
