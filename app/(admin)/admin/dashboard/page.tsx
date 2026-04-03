"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  Clock,
  DollarSign,
  MapPin,
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/hooks/useRealtime";
import MapView from "@/components/maps/MapView";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, RIDE_STATUS_CONFIG, formatAddress } from "@/lib/utils";
import type { Ride, Driver, Organization, RideStatus } from "@/types/database";

const PAGE_SIZE = 15;

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "requested", label: "Requested" },
  { value: "assigned", label: "Assigned" },
  { value: "driver_en_route", label: "En Route" },
  { value: "arrived_at_pickup", label: "At Pickup" },
  { value: "in_transit", label: "In Transit" },
  { value: "arrived_at_dropoff", label: "At Dropoff" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];

const STATUS_BADGE_MAP: Record<RideStatus, "gray" | "blue" | "yellow" | "green" | "purple" | "emerald" | "red" | "orange"> = {
  requested: "gray",
  assigned: "blue",
  driver_en_route: "yellow",
  arrived_at_pickup: "green",
  in_transit: "purple",
  arrived_at_dropoff: "emerald",
  completed: "emerald",
  cancelled: "red",
  no_show: "orange",
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [rides, setRides] = useState<Ride[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [facilities, setFacilities] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignRide, setAssignRide] = useState<Ride | null>(null);
  const [assignDriverId, setAssignDriverId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const { toast } = useToast();

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // Stats
  const todayStr = new Date().toISOString().split("T")[0];
  const todayRides = rides.filter(
    (r) => r.scheduled_pickup_time?.startsWith(todayStr)
  );
  const activeDrivers = drivers.filter((d) => d.status === "available" || d.status === "on_ride");
  const pendingRides = rides.filter((r) => r.status === "requested");
  const revenueToday = todayRides.reduce(
    (sum, r) => sum + (r.final_cost ?? r.estimated_cost ?? 0),
    0
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [ridesJson, driversJson, facilitiesJson] = await Promise.all([
      fetch("/api/rides?limit=200").then((r) => r.json()),
      fetch("/api/drivers").then((r) => r.json()),
      fetch("/api/facilities").then((r) => r.json()),
    ]);
    if (ridesJson.rides) setRides(ridesJson.rides as unknown as Ride[]);
    if (driversJson.drivers) setDrivers(driversJson.drivers as unknown as Driver[]);
    if (facilitiesJson.facilities) setFacilities(facilitiesJson.facilities as unknown as Organization[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRealtimeChange = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useRealtime("rides", handleRealtimeChange);
  useRealtime("drivers", handleRealtimeChange);

  // Filtered rides
  const filteredRides = useMemo(() => {
    let result = rides;

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.patient_name?.toLowerCase().includes(s) ||
          r.pickup_address?.toLowerCase().includes(s) ||
          r.dropoff_address?.toLowerCase().includes(s) ||
          r.id.toLowerCase().includes(s)
      );
    }
    if (statusFilter) {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (facilityFilter) {
      result = result.filter((r) => r.organization_id === facilityFilter);
    }
    if (driverFilter) {
      result = result.filter((r) => r.driver_id === driverFilter);
    }
    if (dateFrom) {
      result = result.filter(
        (r) => r.scheduled_pickup_time >= dateFrom
      );
    }
    if (dateTo) {
      result = result.filter(
        (r) => r.scheduled_pickup_time <= dateTo + "T23:59:59"
      );
    }
    return result;
  }, [rides, search, statusFilter, facilityFilter, driverFilter, dateFrom, dateTo]);

  const totalPages = Math.ceil(filteredRides.length / PAGE_SIZE);
  const pagedRides = filteredRides.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, facilityFilter, driverFilter, dateFrom, dateTo]);

  const facilityOptions = [
    { value: "", label: "All Facilities" },
    ...facilities.map((f) => ({ value: f.id, label: f.name })),
  ];

  const driverOptions = [
    { value: "", label: "All Drivers" },
    ...drivers.map((d) => ({
      value: d.id,
      label: d.user?.full_name ?? "Unknown",
    })),
  ];

  const assignableDriverOptions = [
    { value: "", label: "Select a driver..." },
    ...drivers
      .filter((d) => d.is_active)
      .map((d) => ({ value: d.id, label: d.user?.full_name ?? "Unknown" })),
  ];

  async function handleAssign() {
    if (!assignRide || !assignDriverId) return;
    setAssigning(true);
    try {
      const res = await fetch("/api/rides/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_id: assignRide.id, driver_id: assignDriverId }),
      });
      if (!res.ok) {
        const json = await res.json();
        toast(json.error ?? "Failed to assign driver", "error");
      } else {
        toast("Driver assigned successfully", "success");
        setAssignRide(null);
        setAssignDriverId("");
        fetchData();
      }
    } finally {
      setAssigning(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} variant="card" className="h-24" />
          ))}
        </div>
        <Skeleton variant="card" className="h-[400px]" />
        <Skeleton variant="card" className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Car className="h-6 w-6" />}
          label="Total Rides Today"
          value={todayRides.length}
          color="#276EF1"
        />
        <StatCard
          icon={<Users className="h-6 w-6" />}
          label="Active Drivers"
          value={activeDrivers.length}
          color="#05944F"
        />
        <StatCard
          icon={<Clock className="h-6 w-6" />}
          label="Pending Rides"
          value={pendingRides.length}
          color="#FFC043"
        />
        <StatCard
          icon={<DollarSign className="h-6 w-6" />}
          label="Revenue Today"
          value={formatCurrency(revenueToday)}
          color="#276EF1"
        />
      </div>

      {/* Live Map */}
      <Card className="overflow-hidden">
        <MapView className="h-[400px] w-full" zoom={4} />
      </Card>

      {/* Ride Management */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Ride Management
        </h2>

        {/* Filters */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search rides..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
          <Select
            options={facilityOptions}
            value={facilityFilter}
            onChange={(e) => setFacilityFilter(e.target.value)}
          />
          <Select
            options={driverOptions}
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="From"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="To"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-3 pr-4 font-medium">ID</th>
                <th className="pb-3 pr-4 font-medium">Patient</th>
                <th className="pb-3 pr-4 font-medium">Pickup → Dropoff</th>
                <th className="pb-3 pr-4 font-medium">Time</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Driver</th>
                <th className="pb-3 pr-4 font-medium">Facility</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedRides.map((ride) => {
                const statusConfig = RIDE_STATUS_CONFIG[ride.status];
                return (
                  <tr
                    key={ride.id}
                    className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    onClick={() => router.push(`/rides/${ride.id}`)}
                  >
                    <td className="py-3 pr-4 font-mono text-xs text-gray-500">
                      {ride.id.slice(0, 8)}...
                    </td>
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      {ride.patient_name}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      <span>{formatAddress(ride.pickup_address)}</span>
                      <span className="mx-1 text-gray-400">→</span>
                      <span>{formatAddress(ride.dropoff_address)}</span>
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {new Date(ride.scheduled_pickup_time).toLocaleString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={STATUS_BADGE_MAP[ride.status]}>
                        {statusConfig.label}
                      </Badge>
                      {(ride.status === "no_show" || ride.status === "cancelled") && ride.cancellation_reason && (
                        <p className="mt-1 text-xs text-red-600 max-w-[160px] truncate" title={ride.cancellation_reason}>
                          {ride.cancellation_reason}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {ride.driver?.user?.full_name ?? "Unassigned"}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {ride.organization?.name ?? "—"}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        {ride.status === "requested" && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssignRide(ride);
                              setAssignDriverId("");
                            }}
                          >
                            Assign
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/rides/${ride.id}`);
                          }}
                        >
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pagedRides.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-12 text-center text-gray-400"
                  >
                    No rides found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filteredRides.length)} of{" "}
              {filteredRides.length} rides
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Assign Driver Modal */}
      <Modal
        isOpen={!!assignRide}
        onClose={() => { setAssignRide(null); setAssignDriverId(""); }}
        title="Assign Driver"
      >
        {assignRide && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
              <p><span className="font-medium">Patient:</span> {assignRide.patient_name}</p>
              <p><span className="font-medium">Pickup:</span> {formatAddress(assignRide.pickup_address)}</p>
              <p><span className="font-medium">Time:</span> {new Date(assignRide.scheduled_pickup_time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
            </div>
            <Select
              options={assignableDriverOptions}
              value={assignDriverId}
              onChange={(e) => setAssignDriverId(e.target.value)}
              label="Driver"
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => { setAssignRide(null); setAssignDriverId(""); }}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!assignDriverId || assigning}
                onClick={handleAssign}
              >
                {assigning ? "Assigning…" : "Confirm Assignment"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
