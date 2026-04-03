const MAPBOX_BASE_URL = "https://api.mapbox.com";

interface GeocodingResult {
  address: string;
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  try {
    const response = await fetch(
      `${MAPBOX_BASE_URL}/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1&types=address,poi`
    );
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      // Require a meaningful match — low relevance means Mapbox is guessing
      if ((feature.relevance ?? 0) < 0.5) return null;
      return {
        address: feature.place_name,
        lat: feature.center[1],
        lng: feature.center[0],
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getRouteDistance(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<{ distanceMiles: number; durationMinutes: number } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  try {
    const response = await fetch(
      `${MAPBOX_BASE_URL}/directions/v5/mapbox/driving/${fromLng},${fromLat};${toLng},${toLat}?access_token=${token}`
    );
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        distanceMiles: route.distance / 1609.34,
        durationMinutes: route.duration / 60,
      };
    }
    return null;
  } catch {
    return null;
  }
}
