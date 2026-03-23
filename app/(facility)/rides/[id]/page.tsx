"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  User,
  MapPin,
  Clock,
  Car,
  Phone,
  FileText,
  DollarSign,
  Edit2,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  formatAddress,
  formatCurrency,
  formatPhone,
  RIDE_STATUS_CONFIG,
} from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/rides/StatusBadge";
import { StatusTimeline } from "@/components/rides/StatusTimeline";
import type { Ride, RideStatus } from "@/types/database";

const VEHICLE_OPTIONS = [
  { value: "ambulatory", label: "Ambulatory" },
  { value: "wheelchair", label: "Wheelchair" },
  { value: "bariatric", label: "Bariatric" },
  { value: "stretcher", label: "Stretcher" },
];

export default function RideDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rideId = params.id as string;
  const { profile } = useAuth();

  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    patient_name: "",
    patient_phone: "",
    pickup_address: "",
    dropoff_address: "",
    vehicle_type_needed: "ambulatory",
    scheduled_pickup_time: "",
    special_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchRide() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("rides")
        .select(
          "*, organization:organizations(*), driver:drivers(*, user:users(*))"
        )
        .eq("id", rideId)
        .single();

      if (error || !data) {
        toast("Ride not found.", "error");
        router.push("/dashboard");
        return;
      }

      setRide(data as Ride);
      setLoading(false);
    }

    fetchRide();
  }, [rideId, router, toast]);

  function openEditModal() {
    if (!ride) return;
    setEditForm({
      patient_name: ride.patient_name,
      patient_phone: ride.patient_phone || "",
      pickup_address: ride.pickup_address,
      dropoff_address: ride.dropoff_address,
      vehicle_type_needed: ride.vehicle_type_needed,
      scheduled_pickup_time: ride.scheduled_pickup_time
        ? format(new Date(ride.scheduled_pickup_time), "yyyy-MM-dd'T'HH:mm")
        : "",
      special_notes: ride.special_notes || "",
    });
    setEditModalOpen(true);
  }

  async function handleSaveEdit() {
    if (!ride) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/rides/${ride.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: editForm.patient_name,
          patient_phone: editForm.patient_phone || null,
          pickup_address: editForm.pickup_address,
          dropoff_address: editForm.dropoff_address,
          vehicle_type_needed: editForm.vehicle_type_needed,
          scheduled_pickup_time: new Date(
            editForm.scheduled_pickup_time
          ).toISOString(),
          special_notes: editForm.special_notes || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to update ride");

      const updated = await res.json();
      setRide((prev) => (prev ? { ...prev, ...updated } : prev));
      toast("Ride updated successfully.", "success");
      setEditModalOpen(false);
    } catch {
      toast("Failed to update ride.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!ride) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/rides/${ride.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "cancelled",
          cancellation_reason: cancellationReason || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to cancel ride");

      toast("Ride cancelled.", "success");
      setRide({
        ...ride,
        status: "cancelled" as RideStatus,
        cancellation_reason: cancellationReason || null,
      });
      setShowCancelConfirm(false);
      setCancellationReason("");
    } catch {
      toast("Failed to cancel ride.", "error");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-5 w-20" />
        <div className="flex items-start justify-between">
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-56 mt-2" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton variant="card" className="h-24" />
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-32" />
        <Skeleton className="h-[300px] w-full rounded-lg" />
      </div>
    );
  }

  if (!ride) return null;

  const driverUser = ride.driver?.user;
  const isUpcoming =
    ride.status === "requested" || ride.status === "assigned";
  const canCancel =
    ride.status !== "completed" &&
    ride.status !== "cancelled" &&
    ride.status !== "no_show";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push("/dashboard")}
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ride Details</h1>
          <p className="text-sm text-gray-500 mt-1">
            Booked{" "}
            {format(new Date(ride.created_at), "MMM d, yyyy 'at' h:mm a")}
          </p>
        </div>
        <StatusBadge status={ride.status} />
      </div>

      {/* Patient Info Card */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Patient Information
        </h3>
        <div className="flex items-start gap-3">
          <User className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              {ride.patient_name}
            </p>
            {ride.patient_phone && (
              <div className="flex items-center gap-1 mt-1">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">
                  {formatPhone(ride.patient_phone)}
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Ride Details Card */}
      <Card className="p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-900">Ride Details</h3>

        {/* Pickup */}
        <div className="flex items-start gap-3">
          <MapPin className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Pickup
            </p>
            <p className="text-sm text-gray-900 mt-0.5">
              {ride.pickup_address}
            </p>
          </div>
        </div>

        {/* Dropoff */}
        <div className="flex items-start gap-3">
          <MapPin className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Dropoff
            </p>
            <p className="text-sm text-gray-900 mt-0.5">
              {ride.dropoff_address}
            </p>
          </div>
        </div>

        {/* Ride Type */}
        <div className="flex items-start gap-3">
          <Car className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Ride Type
            </p>
            <p className="text-sm text-gray-900 mt-0.5">
              {ride.ride_type === "round_trip" ? "Round Trip" : "One Way"}
            </p>
          </div>
        </div>

        {/* Vehicle Type */}
        <div className="flex items-start gap-3">
          <Car className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Vehicle Type
            </p>
            <p className="text-sm text-gray-900 mt-0.5 capitalize">
              {ride.vehicle_type_needed}
            </p>
          </div>
        </div>

        {/* Scheduled Time */}
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {ride.is_asap ? "Requested (ASAP)" : "Scheduled"}
            </p>
            <p className="text-sm text-gray-900 mt-0.5">
              {format(
                new Date(ride.scheduled_pickup_time),
                "EEEE, MMM d, yyyy 'at' h:mm a"
              )}
            </p>
          </div>
        </div>

        {/* Return Time (if round trip) */}
        {ride.ride_type === "round_trip" && ride.return_pickup_time && (
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Return Pickup
              </p>
              <p className="text-sm text-gray-900 mt-0.5">
                {format(
                  new Date(ride.return_pickup_time),
                  "EEEE, MMM d, yyyy 'at' h:mm a"
                )}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Status Timeline */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Ride Progress
        </h3>
        <StatusTimeline currentStatus={ride.status} />
      </Card>

      {/* Driver Info Card */}
      {ride.driver && (
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Driver Information
          </h3>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-[#276EF1]/10 flex items-center justify-center flex-shrink-0">
              <User className="h-6 w-6 text-[#276EF1]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {driverUser?.full_name ?? "Driver"}
              </p>
              {driverUser?.phone && (
                <div className="flex items-center gap-1 mt-1">
                  <Phone className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-500">
                    {formatPhone(driverUser.phone)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                {ride.driver.vehicle_make && ride.driver.vehicle_model && (
                  <span>
                    {ride.driver.vehicle_make} {ride.driver.vehicle_model}
                  </span>
                )}
                {ride.driver.vehicle_color && (
                  <span>({ride.driver.vehicle_color})</span>
                )}
                {ride.driver.license_plate && (
                  <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                    {ride.driver.license_plate}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Cost Card */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Cost</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">Estimated Cost</span>
            </div>
            <span className="text-sm font-medium text-gray-900">
              {ride.estimated_cost !== null
                ? formatCurrency(ride.estimated_cost)
                : "--"}
            </span>
          </div>
          {ride.final_cost !== null && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-sm font-semibold text-gray-900">
                  Final Cost
                </span>
              </div>
              <span className="text-sm font-semibold text-gray-900">
                {formatCurrency(ride.final_cost)}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Notes */}
      {ride.special_notes && (
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Special Notes
          </h3>
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-700">{ride.special_notes}</p>
          </div>
        </Card>
      )}

      {/* Map Placeholder */}
      <div className="bg-gray-100 rounded-lg flex items-center justify-center" style={{ height: 300 }}>
        <div className="text-center">
          <MapPin className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">
            Live tracking available when Mapbox is configured
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pb-6">
        {isUpcoming && (
          <Button
            variant="secondary"
            size="lg"
            className="flex-1 min-h-[48px]"
            onClick={openEditModal}
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Edit Ride
          </Button>
        )}
        {canCancel && (
          <Button
            variant="danger"
            size="lg"
            className="flex-1 min-h-[48px]"
            onClick={() => setShowCancelConfirm(true)}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancel Ride
          </Button>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={showCancelConfirm}
        onClose={() => {
          setShowCancelConfirm(false);
          setCancellationReason("");
        }}
        title="Cancel Ride"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to cancel this ride for{" "}
            <span className="font-medium text-gray-900">
              {ride.patient_name}
            </span>
            ? This action cannot be undone.
          </p>
          <Input
            label="Cancellation Reason"
            placeholder="Provide a reason for cancellation..."
            value={cancellationReason}
            onChange={(e) => setCancellationReason(e.target.value)}
          />
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setShowCancelConfirm(false);
                setCancellationReason("");
              }}
              disabled={cancelling}
            >
              Keep Ride
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={cancelling}
              onClick={handleCancel}
            >
              Cancel Ride
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Ride"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Patient Name"
            required
            value={editForm.patient_name}
            onChange={(e) =>
              setEditForm((prev) => ({
                ...prev,
                patient_name: e.target.value,
              }))
            }
          />
          <Input
            label="Patient Phone"
            type="tel"
            value={editForm.patient_phone}
            onChange={(e) =>
              setEditForm((prev) => ({
                ...prev,
                patient_phone: e.target.value,
              }))
            }
          />
          <Input
            label="Pickup Address"
            required
            value={editForm.pickup_address}
            onChange={(e) =>
              setEditForm((prev) => ({
                ...prev,
                pickup_address: e.target.value,
              }))
            }
          />
          <Input
            label="Dropoff Address"
            required
            value={editForm.dropoff_address}
            onChange={(e) =>
              setEditForm((prev) => ({
                ...prev,
                dropoff_address: e.target.value,
              }))
            }
          />
          <Select
            label="Vehicle Type"
            options={VEHICLE_OPTIONS}
            value={editForm.vehicle_type_needed}
            onChange={(e) =>
              setEditForm((prev) => ({
                ...prev,
                vehicle_type_needed: e.target.value,
              }))
            }
          />
          <Input
            label="Scheduled Pickup Time"
            type="datetime-local"
            required
            value={editForm.scheduled_pickup_time}
            onChange={(e) =>
              setEditForm((prev) => ({
                ...prev,
                scheduled_pickup_time: e.target.value,
              }))
            }
          />
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Special Notes
            </label>
            <textarea
              placeholder="Any special requirements or instructions..."
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              value={editForm.special_notes}
              onChange={(e) =>
                setEditForm((prev) => ({
                  ...prev,
                  special_notes: e.target.value,
                }))
              }
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setEditModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={saving}
              onClick={handleSaveEdit}
              disabled={
                !editForm.patient_name.trim() ||
                !editForm.pickup_address.trim() ||
                !editForm.dropoff_address.trim()
              }
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
