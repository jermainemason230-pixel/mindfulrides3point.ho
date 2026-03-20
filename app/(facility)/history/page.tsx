"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import {
  formatAddress,
  formatCurrency,
  RIDE_STATUS_CONFIG,
} from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/rides/StatusBadge";
import type { Ride, RideStatus } from "@/types/database";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  ...Object.entries(RIDE_STATUS_CONFIG).map(([value, config]) => ({
    value,
    label: config.label,
  })),
];

export default function RideHistoryPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const organizationId = profile?.organization_id ?? "";

  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);

    const supabase = createClient();
    let query = supabase
      .from("rides")
      .select(
        "*, organization:organizations(*), driver:drivers(*, user:users(*))"
      )
      .eq("organization_id", organizationId)
      .order("scheduled_pickup_time", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    if (dateFrom) {
      query = query.gte(
        "scheduled_pickup_time",
        new Date(dateFrom).toISOString()
      );
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      query = query.lte("scheduled_pickup_time", endDate.toISOString());
    }
    if (search.trim()) {
      query = query.ilike("patient_name", `%${search.trim()}%`);
    }

    const { data } = await query;
    const results = (data as Ride[]) || [];
    setRides(results);
    setHasMore(results.length > PAGE_SIZE);
    setLoading(false);
  }, [organizationId, page, dateFrom, dateTo, search, statusFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, dateFrom, dateTo, statusFilter]);

  if (authLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton variant="card" className="h-20" />
        <Skeleton variant="card" className="h-96" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Ride History</h1>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Input
                placeholder="Search by patient name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
              <Search className="absolute top-1/2 -translate-y-1/2 left-3 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Status Filter */}
            <div className="w-full sm:w-48">
              <Select
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-500 flex-shrink-0">Date:</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
            <span className="text-sm text-gray-400">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
          </div>
        </div>
      </Card>

      {/* Results Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                  Date
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                  Patient
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">
                  Route
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                  Status
                </th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                  Cost
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">
                  Driver
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-28" />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Skeleton className="h-4 w-40" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-16 ml-auto" />
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  </tr>
                ))
              ) : rides.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-sm text-gray-500 py-12"
                  >
                    No rides found.
                  </td>
                </tr>
              ) : (
                rides.slice(0, PAGE_SIZE).map((ride) => (
                  <tr
                    key={ride.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/rides/${ride.id}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {format(
                          new Date(ride.scheduled_pickup_time),
                          "MMM d, yyyy"
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">
                        {ride.patient_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-gray-600">
                        {formatAddress(ride.pickup_address)} &rarr;{" "}
                        {formatAddress(ride.dropoff_address)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ride.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(
                          ride.final_cost ?? ride.estimated_cost ?? 0
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-sm text-gray-600">
                        {ride.driver?.user?.full_name ?? "-"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && (rides.length > 0 || page > 0) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">Page {page + 1}</span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="min-h-[36px]"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
                className="min-h-[36px]"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
