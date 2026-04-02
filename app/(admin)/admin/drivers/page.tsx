"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Car,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/hooks/useRealtime";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Driver, DriverStatus, Ride, VehicleType } from "@/types/database";

const VEHICLE_TYPE_OPTIONS = [
  { value: "ambulatory", label: "Ambulatory" },
  { value: "wheelchair", label: "Wheelchair" },
  { value: "bariatric", label: "Bariatric" },
  { value: "stretcher", label: "Stretcher" },
];

const STATUS_BADGE: Record<DriverStatus, { variant: "green" | "blue" | "gray"; label: string }> = {
  available: { variant: "green", label: "Available" },
  on_ride: { variant: "blue", label: "On Ride" },
  off_duty: { variant: "gray", label: "Off Duty" },
};

export default function DriversPage() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [driverRides, setDriverRides] = useState<Ride[]>([]);
  const [ridesLoading, setRidesLoading] = useState(false);

  // Schedule modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleDriver, setScheduleDriver] = useState<Driver | null>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    scheduled_date: "",
    start_time: "",
    end_time: "",
    notes: "",
  });

  // Form state
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    vehicle_type: "ambulatory" as VehicleType,
    vehicle_make: "",
    vehicle_model: "",
    vehicle_year: "",
    vehicle_color: "",
    license_plate: "",
    max_passengers: "3",
  });

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("drivers")
      .select("*, user:users(*)")
      .order("created_at", { ascending: false });
    if (data) setDrivers(data as unknown as Driver[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const handleRealtimeChange = useCallback(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  useRealtime("drivers", handleRealtimeChange);

  const handleExpand = useCallback(
    async (driverId: string) => {
      if (expandedId === driverId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(driverId);
      setRidesLoading(true);
      const { data } = await supabase
        .from("rides")
        .select("*")
        .eq("driver_id", driverId)
        .order("scheduled_pickup_time", { ascending: false })
        .limit(10);
      if (data) setDriverRides(data as unknown as Ride[]);
      setRidesLoading(false);
    },
    [expandedId, supabase]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          phone: form.phone,
          vehicle_type: form.vehicle_type,
          vehicle_make: form.vehicle_make,
          vehicle_model: form.vehicle_model,
          vehicle_year: form.vehicle_year ? parseInt(form.vehicle_year) : null,
          vehicle_color: form.vehicle_color,
          license_plate: form.license_plate,
          max_passengers: parseInt(form.max_passengers) || 3,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast("Driver added successfully.", "success");
        setModalOpen(false);
        setForm({
          full_name: "",
          email: "",
          phone: "",
          vehicle_type: "ambulatory",
          vehicle_make: "",
          vehicle_model: "",
          vehicle_year: "",
          vehicle_color: "",
          license_plate: "",
          max_passengers: "3",
        });
        fetchDrivers();
      } else {
        toast(json.error ?? "Failed to add driver.", "error");
      }
    } catch {
      toast("An unexpected error occurred.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (driver: Driver) => {
    await supabase
      .from("drivers")
      .update({ is_active: !driver.is_active })
      .eq("id", driver.id);
    fetchDrivers();
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openScheduleModal = async (driver: Driver) => {
    setScheduleDriver(driver);
    setScheduleModalOpen(true);
    setSchedulesLoading(true);
    const res = await fetch(`/api/drivers/schedules?driver_id=${driver.id}`);
    const json = await res.json();
    setSchedules(json.schedules ?? []);
    setSchedulesLoading(false);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleDriver) return;

    if (scheduleForm.start_time >= scheduleForm.end_time) {
      toast("End time must be after start time.", "error");
      return;
    }

    setScheduleSubmitting(true);
    try {
      const res = await fetch("/api/drivers/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: scheduleDriver.id, ...scheduleForm }),
      });
      const json = await res.json();
      if (res.ok) {
        setSchedules((prev) => [...prev, json.schedule]);
        setScheduleForm({ scheduled_date: "", start_time: "", end_time: "", notes: "" });
        toast("Shift scheduled.", "success");
      } else {
        toast(json.error ?? "Failed to schedule shift.", "error");
      }
    } finally {
      setScheduleSubmitting(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    const res = await fetch(`/api/drivers/schedules?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      toast("Shift removed.", "success");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Driver Management</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} variant="card" className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Driver Management</h1>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Driver
        </Button>
      </div>

      {/* Driver Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {drivers.map((driver) => {
          const statusInfo = STATUS_BADGE[driver.status];
          const isExpanded = expandedId === driver.id;

          return (
            <Card key={driver.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                    <UserIcon className="h-5 w-5 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {driver.user?.full_name ?? "Unknown"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {driver.user?.email}
                    </p>
                  </div>
                </div>
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              </div>

              <div className="mt-4 space-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-gray-400" />
                  <span>
                    {driver.vehicle_color} {driver.vehicle_year}{" "}
                    {driver.vehicle_make} {driver.vehicle_model}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {driver.vehicle_type} | Plate: {driver.license_plate ?? "—"} |
                  Max: {driver.max_passengers} passengers
                </p>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => toggleActive(driver)}
                >
                  {driver.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openScheduleModal(driver)}
                >
                  <Calendar className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleExpand(driver.id)}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Expanded Section */}
              {isExpanded && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <h4 className="mb-2 text-sm font-medium text-gray-700">
                    Recent Ride History
                  </h4>
                  {ridesLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  ) : driverRides.length === 0 ? (
                    <p className="text-sm text-gray-400">No ride history.</p>
                  ) : (
                    <ul className="space-y-2">
                      {driverRides.map((ride) => (
                        <li
                          key={ride.id}
                          className="text-xs text-gray-600"
                        >
                          <span className="font-medium">
                            {ride.patient_name}
                          </span>{" "}
                          —{" "}
                          {new Date(
                            ride.scheduled_pickup_time
                          ).toLocaleDateString()}{" "}
                          <Badge
                            variant={
                              ride.status === "completed"
                                ? "emerald"
                                : ride.status === "cancelled"
                                ? "red"
                                : "gray"
                            }
                          >
                            {ride.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          );
        })}

        {drivers.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400">
            No drivers found. Add your first driver.
          </div>
        )}
      </div>

      {/* Add Driver Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Driver"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full Name"
              required
              value={form.full_name}
              onChange={(e) => updateField("full_name", e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              required
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
            />
            <Input
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
            />
            <Select
              label="Vehicle Type"
              required
              options={VEHICLE_TYPE_OPTIONS}
              value={form.vehicle_type}
              onChange={(e) => updateField("vehicle_type", e.target.value)}
            />
            <Input
              label="Vehicle Make"
              value={form.vehicle_make}
              onChange={(e) => updateField("vehicle_make", e.target.value)}
            />
            <Input
              label="Vehicle Model"
              value={form.vehicle_model}
              onChange={(e) => updateField("vehicle_model", e.target.value)}
            />
            <Input
              label="Vehicle Year"
              type="number"
              value={form.vehicle_year}
              onChange={(e) => updateField("vehicle_year", e.target.value)}
            />
            <Input
              label="Vehicle Color"
              value={form.vehicle_color}
              onChange={(e) => updateField("vehicle_color", e.target.value)}
            />
            <Input
              label="License Plate"
              value={form.license_plate}
              onChange={(e) => updateField("license_plate", e.target.value)}
            />
            <Input
              label="Max Passengers"
              type="number"
              min={1}
              max={10}
              value={form.max_passengers}
              onChange={(e) => updateField("max_passengers", e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Add Driver
            </Button>
          </div>
        </form>
      </Modal>

      {/* Schedule Modal */}
      <Modal
        isOpen={scheduleModalOpen}
        onClose={() => { setScheduleModalOpen(false); setScheduleDriver(null); }}
        title={`Schedule — ${scheduleDriver?.user?.full_name ?? "Driver"}`}
        size="lg"
      >
        <div className="space-y-6">
          {/* Add Shift Form */}
          <form onSubmit={handleScheduleSubmit} className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-700">Add Shift</h4>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Date"
                type="date"
                required
                value={scheduleForm.scheduled_date}
                onChange={(e) => setScheduleForm((p) => ({ ...p, scheduled_date: e.target.value }))}
              />
              <Input
                label="Start Time"
                type="time"
                required
                value={scheduleForm.start_time}
                onChange={(e) => setScheduleForm((p) => ({ ...p, start_time: e.target.value }))}
              />
              <Input
                label="End Time"
                type="time"
                required
                value={scheduleForm.end_time}
                onChange={(e) => setScheduleForm((p) => ({ ...p, end_time: e.target.value }))}
              />
            </div>
            <Input
              label="Notes (optional)"
              value={scheduleForm.notes}
              onChange={(e) => setScheduleForm((p) => ({ ...p, notes: e.target.value }))}
            />
            <div className="flex justify-end">
              <Button type="submit" loading={scheduleSubmitting}>
                <Plus className="mr-1 h-4 w-4" /> Add Shift
              </Button>
            </div>
          </form>

          {/* Upcoming Shifts */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-gray-700">Upcoming Shifts</h4>
            {schedulesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : schedules.length === 0 ? (
              <p className="text-sm text-gray-400">No shifts scheduled yet.</p>
            ) : (
              <ul className="space-y-2">
                {schedules.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 text-sm">
                    <div>
                      <span className="font-medium text-gray-900">
                        {new Date(s.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                      <span className="ml-3 text-gray-500">
                        {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                      </span>
                      {s.notes && <span className="ml-3 text-gray-400 italic">{s.notes}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={s.status === "confirmed" ? "green" : s.status === "cancelled" ? "red" : "gray"}>
                        {s.status}
                      </Badge>
                      <button
                        onClick={() => handleDeleteSchedule(s.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
