"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { Organization } from "@/types/database";

interface FacilityWithCounts extends Organization {
  staff_count: number;
  active_rides_count: number;
}

export default function FacilitiesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useAuth();
  const { toast } = useToast();
  const [facilities, setFacilities] = useState<FacilityWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Facility modal
  const [facilityModalOpen, setFacilityModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [facilityForm, setFacilityForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    billing_email: "",
    notes: "",
  });

  // Edit Facility modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editingFacility, setEditingFacility] =
    useState<FacilityWithCounts | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    billing_email: "",
    notes: "",
  });

  // Add Staff modal
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [staffSubmitting, setStaffSubmitting] = useState(false);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(
    null
  );
  const [staffForm, setStaffForm] = useState({
    full_name: "",
    email: "",
    phone: "",
  });

  const fetchFacilities = useCallback(async () => {
    setLoading(true);
    try {
      const { data: orgs, error } = await supabase
        .from("organizations")
        .select("*")
        .order("name");

      if (error) {
        toast("Failed to load facilities", "error");
        setLoading(false);
        return;
      }

      if (!orgs) {
        setLoading(false);
        return;
      }

      const enriched: FacilityWithCounts[] = await Promise.all(
        orgs.map(async (org) => {
          const [staffRes, ridesRes] = await Promise.all([
            supabase
              .from("users")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org.id)
              .eq("role", "facility_staff"),
            supabase
              .from("rides")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org.id)
              .not("status", "in", '("completed","cancelled","no_show")'),
          ]);
          return {
            ...org,
            staff_count: staffRes.count ?? 0,
            active_rides_count: ridesRes.count ?? 0,
          } as FacilityWithCounts;
        })
      );

      setFacilities(enriched);
    } catch {
      toast("Failed to load facilities", "error");
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    fetchFacilities();
  }, [fetchFacilities]);

  // Add Facility
  const handleAddFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from("organizations").insert({
        name: facilityForm.name,
        address: facilityForm.address || null,
        phone: facilityForm.phone || null,
        email: facilityForm.email || null,
        billing_email: facilityForm.billing_email || null,
        notes: facilityForm.notes || null,
        is_active: true,
      });
      if (error) {
        toast("Failed to add facility: " + error.message, "error");
        return;
      }
      toast("Facility added successfully", "success");
      setFacilityModalOpen(false);
      setFacilityForm({
        name: "",
        address: "",
        phone: "",
        email: "",
        billing_email: "",
        notes: "",
      });
      fetchFacilities();
    } catch {
      toast("Failed to add facility", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Edit Facility
  const openEditModal = (facility: FacilityWithCounts) => {
    setEditingFacility(facility);
    setEditForm({
      name: facility.name,
      address: facility.address ?? "",
      phone: facility.phone ?? "",
      email: facility.email ?? "",
      billing_email: facility.billing_email ?? "",
      notes: facility.notes ?? "",
    });
    setEditModalOpen(true);
  };

  const handleEditFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFacility) return;
    setEditSubmitting(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: editForm.name,
          address: editForm.address || null,
          phone: editForm.phone || null,
          email: editForm.email || null,
          billing_email: editForm.billing_email || null,
          notes: editForm.notes || null,
        })
        .eq("id", editingFacility.id);
      if (error) {
        toast("Failed to update facility: " + error.message, "error");
        return;
      }
      toast("Facility updated successfully", "success");
      setEditModalOpen(false);
      setEditingFacility(null);
      fetchFacilities();
    } catch {
      toast("Failed to update facility", "error");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Add Staff
  const openStaffModal = (facilityId: string) => {
    setSelectedFacilityId(facilityId);
    setStaffModalOpen(true);
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId) return;
    setStaffSubmitting(true);
    try {
      const res = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: staffForm.email,
          full_name: staffForm.full_name,
          phone: staffForm.phone || null,
          role: "facility_staff",
          organization_id: selectedFacilityId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Failed to add staff member", "error");
        return;
      }
      toast("Staff member added successfully", "success");
      setStaffModalOpen(false);
      setStaffForm({ full_name: "", email: "", phone: "" });
      setSelectedFacilityId(null);
      fetchFacilities();
    } catch {
      toast("Failed to add staff member", "error");
    } finally {
      setStaffSubmitting(false);
    }
  };

  // Toggle active
  const toggleActive = async (facility: FacilityWithCounts) => {
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ is_active: !facility.is_active })
        .eq("id", facility.id);
      if (error) {
        toast("Failed to update facility status", "error");
        return;
      }
      toast(
        facility.is_active
          ? "Facility deactivated"
          : "Facility activated",
        "success"
      );
      fetchFacilities();
    } catch {
      toast("Failed to update facility status", "error");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Facilities</h1>
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
        <h1 className="text-2xl font-bold text-gray-900">Facilities</h1>
        <Button onClick={() => setFacilityModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Facility
        </Button>
      </div>

      {/* Facility Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {facilities.map((facility) => (
          <Card key={facility.id} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#276EF1]/10">
                  <Building2 className="h-5 w-5 text-[#276EF1]" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    {facility.name}
                  </p>
                  {facility.email && (
                    <p className="text-xs text-gray-500">{facility.email}</p>
                  )}
                </div>
              </div>
              <Badge variant={facility.is_active ? "green" : "gray"}>
                {facility.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>

            <div className="mt-4 space-y-1.5 text-sm text-gray-600">
              {facility.address && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>{facility.address}</span>
                </div>
              )}
              {facility.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>{facility.phone}</span>
                </div>
              )}
              {facility.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>{facility.email}</span>
                </div>
              )}
              <div className="flex items-center gap-4 pt-1">
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4 text-gray-400" />
                  <span className="text-xs">
                    {facility.staff_count} staff
                  </span>
                </div>
                <span className="text-xs text-gray-400">|</span>
                <span className="text-xs">
                  {facility.active_rides_count} active rides
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openStaffModal(facility.id)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Staff
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openEditModal(facility)}
              >
                <Pencil className="mr-1 h-3 w-3" />
                Edit
              </Button>
              <Button
                variant={facility.is_active ? "danger" : "secondary"}
                size="sm"
                onClick={() => toggleActive(facility)}
              >
                {facility.is_active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </Card>
        ))}

        {facilities.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400">
            No facilities found. Add your first facility.
          </div>
        )}
      </div>

      {/* Add Facility Modal */}
      <Modal
        isOpen={facilityModalOpen}
        onClose={() => setFacilityModalOpen(false)}
        title="Add Facility"
        size="lg"
      >
        <form onSubmit={handleAddFacility} className="space-y-4">
          <Input
            label="Facility Name"
            required
            value={facilityForm.name}
            onChange={(e) =>
              setFacilityForm((prev) => ({ ...prev, name: e.target.value }))
            }
          />
          <Input
            label="Address"
            value={facilityForm.address}
            onChange={(e) =>
              setFacilityForm((prev) => ({
                ...prev,
                address: e.target.value,
              }))
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Phone"
              type="tel"
              value={facilityForm.phone}
              onChange={(e) =>
                setFacilityForm((prev) => ({
                  ...prev,
                  phone: e.target.value,
                }))
              }
            />
            <Input
              label="Email"
              type="email"
              value={facilityForm.email}
              onChange={(e) =>
                setFacilityForm((prev) => ({
                  ...prev,
                  email: e.target.value,
                }))
              }
            />
          </div>
          <Input
            label="Billing Email"
            type="email"
            value={facilityForm.billing_email}
            onChange={(e) =>
              setFacilityForm((prev) => ({
                ...prev,
                billing_email: e.target.value,
              }))
            }
          />
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-black"
              rows={3}
              value={facilityForm.notes}
              onChange={(e) =>
                setFacilityForm((prev) => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => setFacilityModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Add Facility
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Facility Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingFacility(null);
        }}
        title="Edit Facility"
        size="lg"
      >
        <form onSubmit={handleEditFacility} className="space-y-4">
          <Input
            label="Facility Name"
            required
            value={editForm.name}
            onChange={(e) =>
              setEditForm((prev) => ({ ...prev, name: e.target.value }))
            }
          />
          <Input
            label="Address"
            value={editForm.address}
            onChange={(e) =>
              setEditForm((prev) => ({ ...prev, address: e.target.value }))
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Phone"
              type="tel"
              value={editForm.phone}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, phone: e.target.value }))
              }
            />
            <Input
              label="Email"
              type="email"
              value={editForm.email}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, email: e.target.value }))
              }
            />
          </div>
          <Input
            label="Billing Email"
            type="email"
            value={editForm.billing_email}
            onChange={(e) =>
              setEditForm((prev) => ({
                ...prev,
                billing_email: e.target.value,
              }))
            }
          />
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-black"
              rows={3}
              value={editForm.notes}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, notes: e.target.value }))
              }
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setEditModalOpen(false);
                setEditingFacility(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={editSubmitting}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Staff Modal */}
      <Modal
        isOpen={staffModalOpen}
        onClose={() => {
          setStaffModalOpen(false);
          setSelectedFacilityId(null);
        }}
        title="Add Staff Member"
      >
        <form onSubmit={handleAddStaff} className="space-y-4">
          <Input
            label="Full Name"
            required
            value={staffForm.full_name}
            onChange={(e) =>
              setStaffForm((prev) => ({
                ...prev,
                full_name: e.target.value,
              }))
            }
          />
          <Input
            label="Email"
            type="email"
            required
            value={staffForm.email}
            onChange={(e) =>
              setStaffForm((prev) => ({ ...prev, email: e.target.value }))
            }
          />
          <Input
            label="Phone"
            type="tel"
            value={staffForm.phone}
            onChange={(e) =>
              setStaffForm((prev) => ({ ...prev, phone: e.target.value }))
            }
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setStaffModalOpen(false);
                setSelectedFacilityId(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={staffSubmitting}>
              Add Staff
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
