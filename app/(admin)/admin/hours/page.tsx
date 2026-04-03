"use client";

import { useState, useEffect, useCallback } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";
import { Clock, Car, TrendingUp, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

type RangePreset = "this_week" | "last_week" | "this_month" | "last_month" | "custom";

interface DriverHours {
  id: string;
  full_name: string;
  vehicle_type: string;
  scheduled_hours: number;
  ride_hours: number;
  ride_count: number;
}

function getPresetDates(preset: RangePreset): { from: string; to: string } {
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  const now = new Date();
  switch (preset) {
    case "this_week":
      return { from: fmt(startOfWeek(now, { weekStartsOn: 1 })), to: fmt(endOfWeek(now, { weekStartsOn: 1 })) };
    case "last_week": {
      const prev = subWeeks(now, 1);
      return { from: fmt(startOfWeek(prev, { weekStartsOn: 1 })), to: fmt(endOfWeek(prev, { weekStartsOn: 1 })) };
    }
    case "this_month":
      return { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) };
    case "last_month": {
      const prev = subMonths(now, 1);
      return { from: fmt(startOfMonth(prev)), to: fmt(endOfMonth(prev)) };
    }
    default:
      return { from: fmt(startOfWeek(now, { weekStartsOn: 1 })), to: fmt(endOfWeek(now, { weekStartsOn: 1 })) };
  }
}

function fmtHours(h: number) {
  if (h === 0) return "0h 0m";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export default function DriverHoursPage() {
  const [preset, setPreset] = useState<RangePreset>("this_week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [drivers, setDrivers] = useState<DriverHours[]>([]);
  const [loading, setLoading] = useState(true);

  const dates = preset === "custom"
    ? { from: customFrom, to: customTo }
    : getPresetDates(preset);

  const fetchHours = useCallback(async () => {
    if (!dates.from || !dates.to) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/drivers/hours?date_from=${dates.from}&date_to=${dates.to}`);
      const json = await res.json();
      setDrivers(json.drivers ?? []);
    } finally {
      setLoading(false);
    }
  }, [dates.from, dates.to]);

  useEffect(() => {
    fetchHours();
  }, [fetchHours]);

  const totalScheduled = drivers.reduce((s, d) => s + d.scheduled_hours, 0);
  const totalRide = drivers.reduce((s, d) => s + d.ride_hours, 0);
  const totalRides = drivers.reduce((s, d) => s + d.ride_count, 0);
  const activeDrivers = drivers.filter((d) => d.ride_count > 0).length;

  const PRESETS: { key: RangePreset; label: string }[] = [
    { key: "this_week", label: "This Week" },
    { key: "last_week", label: "Last Week" },
    { key: "this_month", label: "This Month" },
    { key: "last_month", label: "Last Month" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Driver Hours</h1>
        <p className="text-sm text-gray-500 mt-1">Scheduled shift hours and on-ride time per driver</p>
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              preset === p.key ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {p.label}
          </button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>
        )}
        {preset !== "custom" && (
          <span className="ml-2 text-sm text-gray-400">
            {format(new Date(dates.from), "MMM d")} – {format(new Date(dates.to), "MMM d, yyyy")}
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Clock, label: "Total Shift Hours", value: fmtHours(totalScheduled), color: "text-blue-600", bg: "bg-blue-50" },
          { icon: TrendingUp, label: "Total Ride Hours", value: fmtHours(totalRide), color: "text-green-600", bg: "bg-green-50" },
          { icon: Car, label: "Completed Rides", value: totalRides.toString(), color: "text-purple-600", bg: "bg-purple-50" },
          { icon: Users, label: "Active Drivers", value: `${activeDrivers} / ${drivers.length}`, color: "text-orange-600", bg: "bg-orange-50" },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <Card key={label} className="p-4">
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      {/* Driver table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Breakdown by Driver</h2>
        </div>

        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : drivers.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No driver data found for this period.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Table header */}
            <div className="grid grid-cols-5 px-5 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide bg-gray-50">
              <div className="col-span-2">Driver</div>
              <div className="text-right">Shift Hours</div>
              <div className="text-right">Ride Hours</div>
              <div className="text-right">Rides</div>
            </div>

            {drivers.map((driver) => {
              const utilization = driver.scheduled_hours > 0
                ? Math.min(100, Math.round((driver.ride_hours / driver.scheduled_hours) * 100))
                : null;

              return (
                <div key={driver.id} className="grid grid-cols-5 px-5 py-4 items-center hover:bg-gray-50 transition-colors">
                  {/* Name + vehicle */}
                  <div className="col-span-2">
                    <p className="text-sm font-semibold text-gray-900">{driver.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400 capitalize">{driver.vehicle_type}</span>
                      {utilization !== null && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          utilization >= 70 ? "bg-green-50 text-green-700"
                          : utilization >= 40 ? "bg-yellow-50 text-yellow-700"
                          : "bg-gray-100 text-gray-500"
                        }`}>
                          {utilization}% utilized
                        </span>
                      )}
                    </div>
                    {/* Utilization bar */}
                    {driver.scheduled_hours > 0 && (
                      <div className="mt-2 h-1.5 w-32 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            utilization! >= 70 ? "bg-green-500" : utilization! >= 40 ? "bg-yellow-400" : "bg-gray-400"
                          }`}
                          style={{ width: `${Math.min(100, utilization!)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Shift hours */}
                  <div className="text-right">
                    {driver.scheduled_hours > 0 ? (
                      <span className="text-sm font-medium text-gray-900">{fmtHours(driver.scheduled_hours)}</span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </div>

                  {/* Ride hours */}
                  <div className="text-right">
                    {driver.ride_hours > 0 ? (
                      <span className="text-sm font-medium text-gray-900">{fmtHours(driver.ride_hours)}</span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </div>

                  {/* Rides */}
                  <div className="text-right">
                    <span className={`text-sm font-medium ${driver.ride_count > 0 ? "text-gray-900" : "text-gray-400"}`}>
                      {driver.ride_count > 0 ? driver.ride_count : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <p className="text-xs text-gray-400">
        Shift hours come from driver schedules. Ride hours use actual pickup/dropoff timestamps when available, otherwise estimated duration.
      </p>
    </div>
  );
}
