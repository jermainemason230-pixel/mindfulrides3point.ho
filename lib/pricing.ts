import { VehicleType, PricingConfig } from "@/types/database";

export const DEFAULT_PRICING: PricingConfig = {
  base_rate: 25,
  per_mile_rate: 2.5,
  vehicle_multipliers: {
    ambulatory: 1.0,
    wheelchair: 1.3,
    bariatric: 1.5,
    stretcher: 2.0,
  },
  shared_ride_discount: 0.2,
  round_trip_multiplier: 1.8,
};

export function calculateRideCost(
  distanceMiles: number,
  vehicleType: VehicleType,
  isShared: boolean,
  isRoundTrip: boolean,
  pricing: PricingConfig = DEFAULT_PRICING
): number {
  let cost = pricing.base_rate + distanceMiles * pricing.per_mile_rate;
  cost *= pricing.vehicle_multipliers[vehicleType];

  if (isRoundTrip) {
    cost *= pricing.round_trip_multiplier;
  }

  if (isShared) {
    cost *= 1 - pricing.shared_ride_discount;
  }

  return Math.round(cost * 100) / 100;
}
