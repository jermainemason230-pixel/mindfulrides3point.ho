/**
 * NEMT Ride Buffer Configuration
 *
 * Pickup buffer:         Driver arrives 12 min before scheduled pickup window
 * Ride time buffer:      17.5% on top of Mapbox ETA (mid-point of 15–20%)
 *                        Accounts for client loading/unloading
 * Drop-off buffer:       Client arrives 15 min before appointment start
 * Return trip buffer:    45 min after scheduled appointment end
 *                        Medical appointments almost never run on time
 */

export const BUFFERS = {
  pickupMinutes: 12,          // arrive at facility before scheduled window
  rideTimeMultiplier: 1.175,  // 17.5% on top of Mapbox ETA
  dropoffMinutes: 15,         // arrive at destination before appointment
  returnPaddingMinutes: 30,   // padding after appointment end for return trip
  asapDispatchMinutes: 12,    // time from booking to driver at door (ASAP)
} as const;

/**
 * Apply the ride-time buffer to a raw Mapbox duration.
 * Returns the total driver-blocked minutes including loading/unloading time.
 */
export function bufferedDuration(mapboxMinutes: number): number {
  return Math.round(mapboxMinutes * BUFFERS.rideTimeMultiplier);
}

/**
 * Full driver time block for conflict detection:
 *   pickup buffer  +  buffered ride time  +  drop-off buffer
 */
export function totalBlockedMinutes(mapboxMinutes: number): number {
  return BUFFERS.pickupMinutes + bufferedDuration(mapboxMinutes) + BUFFERS.dropoffMinutes;
}

/**
 * The time the driver should leave for pickup so the client
 * arrives at their appointment on time.
 *
 * appointmentTime  =  departureTime  +  bufferedDuration  +  dropoffBuffer
 * => departureTime =  appointmentTime  -  bufferedDuration  -  dropoffBuffer
 * => arrivalAtPickup (driver) = departureTime - pickupBuffer
 */
export function scheduledPickupFromAppointment(
  appointmentTime: Date,
  mapboxMinutes: number
): Date {
  const totalBack =
    BUFFERS.dropoffMinutes + bufferedDuration(mapboxMinutes) + BUFFERS.pickupMinutes;
  return new Date(appointmentTime.getTime() - totalBack * 60 * 1000);
}

/**
 * Suggested return pickup time = appointment end + return padding.
 */
export function returnPickupTime(appointmentEndTime: Date): Date {
  return new Date(appointmentEndTime.getTime() + BUFFERS.returnPaddingMinutes * 60 * 1000);
}

/**
 * Format minutes as a human-readable duration string.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
