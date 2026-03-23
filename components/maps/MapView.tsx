"use client";

import { useEffect, useRef, useState } from "react";

interface MapViewProps {
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  markers?: Array<{
    id: string;
    lng: number;
    lat: number;
    color?: string;
    label?: string;
  }>;
  className?: string;
  showRoute?: boolean;
  routeStart?: [number, number];
  routeEnd?: [number, number];
}

export default function MapView({
  center = [-95.7129, 37.0902], // US center
  zoom = 4,
  markers = [],
  className = "",
  showRoute = false,
  routeStart,
  routeEnd,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [noToken, setNoToken] = useState(false);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || token === "your_mapbox_token") {
      setNoToken(true);
      return;
    }

    if (map.current || !mapContainer.current) return;

    const initMap = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      // @ts-ignore - CSS import for mapbox
      await import("mapbox-gl/dist/mapbox-gl.css");

      mapboxgl.accessToken = token;

      map.current = new mapboxgl.Map({
        container: mapContainer.current!,
        style: "mapbox://styles/mapbox/light-v11",
        center,
        zoom,
      });

      map.current.on("load", () => {
        setMapLoaded(true);
      });

      map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    };

    initMap();

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update markers when they change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const initMarkers = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;

      // Remove existing markers
      const existingMarkers = document.querySelectorAll(".mapboxgl-marker");
      existingMarkers.forEach((m) => m.remove());

      markers.forEach((marker) => {
        const el = document.createElement("div");
        el.className = "w-4 h-4 rounded-full border-2 border-white shadow-lg";
        el.style.backgroundColor = marker.color || "#276EF1";

        new mapboxgl.Marker(el)
          .setLngLat([marker.lng, marker.lat])
          .setPopup(
            marker.label
              ? new mapboxgl.Popup({ offset: 25 }).setText(marker.label)
              : undefined
          )
          .addTo(map.current);
      });

      // Fit bounds if multiple markers
      if (markers.length > 1) {
        const bounds = new mapboxgl.LngLatBounds();
        markers.forEach((m) => bounds.extend([m.lng, m.lat]));
        map.current.fitBounds(bounds, { padding: 50 });
      }
    };

    initMarkers();
  }, [markers, mapLoaded]);

  if (noToken) {
    return (
      <div
        className={`bg-gray-100 rounded-card flex items-center justify-center ${className}`}
        style={{ minHeight: "300px" }}
      >
        <div className="text-center text-gray-400">
          <p className="text-lg font-medium">Map</p>
          <p className="text-sm mt-1">
            Configure your Mapbox token to see the live map
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={mapContainer}
      className={`rounded-card overflow-hidden ${className}`}
      style={{ minHeight: "300px" }}
    />
  );
}
