import { getRouteDistance } from "@/lib/mapbox/geocoding";

// A combined ride may add at most 30% to any individual's trip time…
export const SHARE_MAX_EXTRA_PERCENT = 0.30;
// …and never more than 20 absolute minutes.
export const SHARE_MAX_EXTRA_MINUTES = 20;
// Maximum pickup-time spread for rides to be eligible to share.
export const SHARE_WINDOW_MINUTES = 30;

export interface SharingCandidate {
  id: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  estimated_duration_minutes: number | null;
  scheduled_pickup_time: string;
  appointment_time: string | null;
  passenger_count: number;
}

export interface SharingEvaluation {
  viable: boolean;
  /** Id of the ride that takes the detour (first pickup / last dropoff) */
  detourRideId: string;
  /** Approximate extra minutes added to the detour rider's trip */
  extraMinutes: number;
}

/**
 * Evaluate whether two rides can be combined.
 *
 * direction = 'to_appointment':  both riders are picked up from their homes
 *   and dropped at the same facility.  Detour = extra time for whoever is
 *   picked up first.
 *
 * direction = 'from_appointment': both riders leave from the same facility
 *   and are dropped at their respective homes.  Detour = extra time for
 *   whoever is dropped last.
 */
export async function evaluateSharing(
  newRide: SharingCandidate & { id: string },
  candidate: SharingCandidate,
  direction: "to_appointment" | "from_appointment"
): Promise<SharingEvaluation> {
  const notViable: SharingEvaluation = { viable: false, detourRideId: newRide.id, extraMinutes: 0 };

  const newDirect = newRide.estimated_duration_minutes ?? 60;
  const candDirect = candidate.estimated_duration_minutes ?? 60;

  // ── Coordinates for the leg between the two "diverging" stops ──────────
  let fromLat: number, fromLng: number, toLat: number, toLng: number;

  if (direction === "to_appointment") {
    // Detour leg = between the two pickup locations
    if (
      newRide.pickup_lat == null || newRide.pickup_lng == null ||
      candidate.pickup_lat == null || candidate.pickup_lng == null
    ) return notViable;
    fromLat = newRide.pickup_lat;  fromLng = newRide.pickup_lng;
    toLat   = candidate.pickup_lat; toLng   = candidate.pickup_lng;
  } else {
    // Detour leg = between the two dropoff locations
    if (
      newRide.dropoff_lat == null || newRide.dropoff_lng == null ||
      candidate.dropoff_lat == null || candidate.dropoff_lng == null
    ) return notViable;
    fromLat = newRide.dropoff_lat;  fromLng = newRide.dropoff_lng;
    toLat   = candidate.dropoff_lat; toLng   = candidate.dropoff_lng;
  }

  const detourRoute = await getRouteDistance(fromLat, fromLng, toLat, toLng);
  if (!detourRoute) return notViable;
  const detourTime = detourRoute.durationMinutes;

  // ── Calculate extra time for each ordering ────────────────────────────
  // For "to_appointment":
  //   Option A — new picked up first:
  //     new's route: new_pickup → cand_pickup → facility
  //     extra_new = detourTime + candDirect − newDirect   (≥ 0 when cand is not on the way)
  //     extra_cand = 0
  //   Option B — candidate picked up first:
  //     cand's route: cand_pickup → new_pickup → facility
  //     extra_cand = detourTime + newDirect − candDirect
  //     extra_new = 0
  //
  // For "from_appointment": symmetric (replace "pickup" with "dropoff",
  //   "first" with "last dropped").

  const extraA_new  = Math.max(0, detourTime + candDirect - newDirect);
  const extraA_cand = 0;
  const extraB_new  = 0;
  const extraB_cand = Math.max(0, detourTime + newDirect - candDirect);

  function withinLimits(extra: number, direct: number) {
    return extra <= SHARE_MAX_EXTRA_MINUTES && extra <= SHARE_MAX_EXTRA_PERCENT * direct;
  }

  // ── Appointment-time safety check (to_appointment only) ───────────────
  function appointmentSafe(
    rideId: string,
    scheduledPickup: string,
    appointmentTime: string | null,
    extraMin: number
  ): boolean {
    if (!appointmentTime) return true; // no constraint recorded
    const arrival = new Date(scheduledPickup).getTime() + (extraMin * 60_000);
    const apptMs  = new Date(appointmentTime).getTime();
    if (isNaN(apptMs)) return true;
    return arrival <= apptMs;
  }

  // Try Option A first (new detours), then Option B (candidate detours)
  const optionA_ok =
    withinLimits(extraA_new, newDirect) &&
    withinLimits(extraA_cand, candDirect) &&
    (direction !== "to_appointment" ||
      appointmentSafe(newRide.id, newRide.scheduled_pickup_time, newRide.appointment_time, extraA_new));

  if (optionA_ok) {
    return { viable: true, detourRideId: newRide.id, extraMinutes: Math.round(extraA_new) };
  }

  const optionB_ok =
    withinLimits(extraB_new, newDirect) &&
    withinLimits(extraB_cand, candDirect) &&
    (direction !== "to_appointment" ||
      appointmentSafe(candidate.id, candidate.scheduled_pickup_time, candidate.appointment_time, extraB_cand));

  if (optionB_ok) {
    return { viable: true, detourRideId: candidate.id, extraMinutes: Math.round(extraB_cand) };
  }

  return notViable;
}
