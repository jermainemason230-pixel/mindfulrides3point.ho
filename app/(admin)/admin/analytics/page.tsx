"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  Car,
  CheckCircle2,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils";
import type { Ride, Organization } from "@/types/database";

const PIE_COLORS = ["#276EF1", "#05944F", "#FFC043", "#E11900", "#545454"];

interface DailyData {
  date: string;
  rides: number;
}

interface FacilityRevenue {
  name: string;
  value: number;
}

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

export default function AnalyticsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rides, setRides] = useState<Ride[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [facilityRevenue, setFacilityRevenue] = useState<FacilityRevenue[]>(
    []
  );

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const [ridesRes, orgsRes] = await Promise.all([
        supabase
          .from("rides")
          .select("*")
          .order("created_at", { ascending: true }),
        supabase.from("organizations").select("*"),
      ]);

      if (ridesRes.error) {
        toast("Failed to load rides data", "error");
        setLoading(false);
        return;
      }

      const allRides = (ridesRes.data ?? []) as unknown as Ride[];
      const orgs = (orgsRes.data ?? []) as unknown as Organization[];

      setRides(allRides);
      setOrganizations(orgs);

      // Build daily ride counts for last 30 days
      const thirtyDaysAgo = subDays(new Date(), 30);
      const recentRides = allRides.filter(
        (r) => new Date(r.created_at) >= thirtyDaysAgo
      );

      const dailyMap = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const d = subDays(new Date(), 29 - i);
        const key = format(d, "yyyy-MM-dd");
        dailyMap.set(key, 0);
      }
      recentRides.forEach((r) => {
        const day = r.created_at?.split("T")[0];
        if (day && dailyMap.has(day)) {
          dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
        }
      });
      setDailyData(
        Array.from(dailyMap.entries()).map(([date, count]) => ({
          date: format(new Date(date), "MMM d"),
          rides: count,
        }))
      );

      // Revenue per facility
      const orgMap = new Map<string, string>();
      orgs.forEach((o) => orgMap.set(o.id, o.name));

      const revenueMap = new Map<string, number>();
      allRides.forEach((r) => {
        const cost = r.final_cost ?? r.estimated_cost ?? 0;
        const name = orgMap.get(r.organization_id) ?? "Unknown";
        revenueMap.set(name, (revenueMap.get(name) ?? 0) + cost);
      });
      setFacilityRevenue(
        Array.from(revenueMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      );
    } catch {
      toast("Failed to load analytics data", "error");
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Compute stats from all rides
  const totalRides = rides.length;
  const completedRides = rides.filter((r) => r.status === "completed").length;
  const totalRevenue = rides.reduce(
    (sum, r) => sum + (r.final_cost ?? r.estimated_cost ?? 0),
    0
  );
  const completedRidesWithCost = rides.filter(
    (r) =>
      r.status === "completed" &&
      (r.final_cost ?? r.estimated_cost ?? 0) > 0
  );
  const avgRideCost =
    completedRidesWithCost.length > 0
      ? completedRidesWithCost.reduce(
          (sum, r) => sum + (r.final_cost ?? r.estimated_cost ?? 0),
          0
        ) / completedRidesWithCost.length
      : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} variant="card" className="h-24" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton variant="card" className="h-80" />
          <Skeleton variant="card" className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Car className="h-6 w-6" />}
          label="Total Rides"
          value={totalRides}
          color="#276EF1"
        />
        <StatCard
          icon={<CheckCircle2 className="h-6 w-6" />}
          label="Completed Rides"
          value={completedRides}
          color="#05944F"
        />
        <StatCard
          icon={<DollarSign className="h-6 w-6" />}
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          color="#FFC043"
        />
        <StatCard
          icon={<TrendingUp className="h-6 w-6" />}
          label="Avg Ride Cost"
          value={formatCurrency(avgRideCost)}
          color="#E11900"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rides per Day - Bar Chart */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Rides per Day (Last 30 Days)
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="rides" fill="#276EF1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Revenue by Facility - Pie Chart */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Revenue by Facility
          </h2>
          {facilityRevenue.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-gray-400">
              No revenue data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={facilityRevenue}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, value }) =>
                    `${name}: ${formatCurrency(value)}`
                  }
                >
                  {facilityRevenue.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => formatCurrency(Number(value))}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
