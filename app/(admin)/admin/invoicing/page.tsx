"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  Download,
  FileText,
  Plus,
} from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils";
import type { Invoice, InvoiceStatus, Organization } from "@/types/database";

const STATUS_BADGE: Record<
  InvoiceStatus,
  "gray" | "yellow" | "green" | "red"
> = {
  draft: "gray",
  pending: "yellow",
  paid: "green",
  overdue: "red",
  cancelled: "gray",
};

export default function InvoicingPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [facilities, setFacilities] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Generate invoice form
  const [selectedFacility, setSelectedFacility] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [invoicesRes, facilitiesRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("*, organization:organizations(*)")
          .order("created_at", { ascending: false }),
        supabase.from("organizations").select("*").order("name"),
      ]);
      if (invoicesRes.error) {
        toast("Failed to load invoices", "error");
      }
      if (invoicesRes.data)
        setInvoices(invoicesRes.data as unknown as Invoice[]);
      if (facilitiesRes.data)
        setFacilities(facilitiesRes.data as unknown as Organization[]);
    } catch {
      toast("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const facilityOptions = [
    { value: "", label: "Select Facility" },
    ...facilities.map((f) => ({ value: f.id, label: f.name })),
  ];

  const handleGenerate = async () => {
    if (!selectedFacility || !periodStart || !periodEnd) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: selectedFacility,
          period_start: periodStart,
          period_end: periodEnd,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Failed to generate invoice", "error");
        return;
      }
      toast("Invoice generated successfully", "success");
      setSelectedFacility("");
      setPeriodStart("");
      setPeriodEnd("");
      fetchData();
    } catch {
      toast("Failed to generate invoice", "error");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Invoicing</h1>
        <Skeleton variant="card" className="h-32" />
        <Skeleton variant="card" className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Invoicing</h1>

      {/* Generate Invoice */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Generate Invoice
        </h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <Select
            label="Facility"
            options={facilityOptions}
            value={selectedFacility}
            onChange={(e) => setSelectedFacility(e.target.value)}
          />
          <Input
            label="Period Start"
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
          <Input
            label="Period End"
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
          <div className="flex items-end">
            <Button
              onClick={handleGenerate}
              loading={generating}
              disabled={!selectedFacility || !periodStart || !periodEnd}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Generate Invoice
            </Button>
          </div>
        </div>
      </Card>

      {/* Invoice Table */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          All Invoices
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-3 pr-4 font-medium">ID</th>
                <th className="pb-3 pr-4 font-medium">Facility</th>
                <th className="pb-3 pr-4 font-medium">Amount</th>
                <th className="pb-3 pr-4 font-medium">Period</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b border-gray-100"
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="font-mono text-xs">
                        {invoice.id.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-gray-700">
                    {invoice.organization?.name ?? "—"}
                  </td>
                  <td className="py-3 pr-4 font-medium text-gray-900">
                    {formatCurrency(invoice.amount_cents / 100)}
                  </td>
                  <td className="py-3 pr-4 text-gray-600">
                    {format(new Date(invoice.period_start), "MMM d, yyyy")}{" "}
                    –{" "}
                    {format(new Date(invoice.period_end), "MMM d, yyyy")}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant={STATUS_BADGE[invoice.status]}>
                      {invoice.status.charAt(0).toUpperCase() +
                        invoice.status.slice(1)}
                    </Badge>
                  </td>
                  <td className="py-3 text-gray-600">
                    {format(new Date(invoice.created_at), "MMM d, yyyy")}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-gray-400"
                  >
                    No invoices yet. Generate your first invoice above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
