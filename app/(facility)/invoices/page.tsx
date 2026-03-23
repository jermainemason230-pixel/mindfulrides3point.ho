"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { FileText, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Invoice, InvoiceStatus } from "@/types/database";

const statusVariant: Record<
  InvoiceStatus,
  "gray" | "yellow" | "green" | "red"
> = {
  draft: "gray",
  pending: "yellow",
  paid: "green",
  overdue: "red",
  cancelled: "gray",
};

const statusLabel: Record<InvoiceStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export default function InvoicesPage() {
  const { profile, loading: authLoading } = useAuth();
  const organizationId = profile?.organization_id ?? "";

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    setInvoices((data as Invoice[]) || []);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (authLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton variant="card" className="h-96" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="w-8 px-4 py-3" />
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                  Invoice #
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                  Period
                </th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                  Amount
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">
                  Due Date
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">
                  Paid Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-4" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-36" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-20 ml-auto" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No invoices yet</p>
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {
                  const isExpanded = expandedId === invoice.id;
                  return (
                    <InvoiceRow
                      key={invoice.id}
                      invoice={invoice}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpand(invoice.id)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function InvoiceRow({
  invoice,
  isExpanded,
  onToggle,
}: {
  invoice: Invoice;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </td>
        <td className="px-4 py-3">
          <span className="text-sm font-medium text-gray-900 font-mono">
            {invoice.id.slice(0, 8).toUpperCase()}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="text-sm text-gray-600">
            {format(new Date(invoice.period_start), "MMM d")} &mdash;{" "}
            {format(new Date(invoice.period_end), "MMM d, yyyy")}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <span className="text-sm font-semibold text-gray-900">
            {formatCurrency(invoice.amount_cents / 100)}
          </span>
        </td>
        <td className="px-4 py-3">
          <Badge variant={statusVariant[invoice.status]}>
            {statusLabel[invoice.status]}
          </Badge>
        </td>
        <td className="px-4 py-3 hidden sm:table-cell">
          <span className="text-sm text-gray-600">
            {format(new Date(invoice.due_date), "MMM d, yyyy")}
          </span>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <span className="text-sm text-gray-600">
            {invoice.paid_at
              ? format(new Date(invoice.paid_at), "MMM d, yyyy")
              : "-"}
          </span>
        </td>
      </tr>

      {/* Expanded line items */}
      {isExpanded && invoice.line_items && invoice.line_items.length > 0 && (
        <tr>
          <td colSpan={7} className="bg-gray-50 px-4 py-0">
            <div className="py-4 pl-8">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Line Items
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-left text-xs font-medium text-gray-400 pb-2 pr-4">
                        Date
                      </th>
                      <th className="text-left text-xs font-medium text-gray-400 pb-2 pr-4">
                        Patient
                      </th>
                      <th className="text-left text-xs font-medium text-gray-400 pb-2 pr-4 hidden sm:table-cell">
                        Pickup
                      </th>
                      <th className="text-left text-xs font-medium text-gray-400 pb-2 pr-4 hidden sm:table-cell">
                        Dropoff
                      </th>
                      <th className="text-right text-xs font-medium text-gray-400 pb-2">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoice.line_items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-2 pr-4">
                          <span className="text-xs text-gray-600">
                            {format(new Date(item.date), "MMM d, yyyy")}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          <span className="text-xs font-medium text-gray-900">
                            {item.patient_name}
                          </span>
                        </td>
                        <td className="py-2 pr-4 hidden sm:table-cell">
                          <span className="text-xs text-gray-600">
                            {item.pickup}
                          </span>
                        </td>
                        <td className="py-2 pr-4 hidden sm:table-cell">
                          <span className="text-xs text-gray-600">
                            {item.dropoff}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          <span className="text-xs font-medium text-gray-900">
                            {formatCurrency(item.amount_cents / 100)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* Expanded but no line items */}
      {isExpanded &&
        (!invoice.line_items || invoice.line_items.length === 0) && (
          <tr>
            <td colSpan={7} className="bg-gray-50 px-4 py-0">
              <div className="py-4 pl-8">
                <p className="text-xs text-gray-400">
                  No line item details available.
                </p>
              </div>
            </td>
          </tr>
        )}
    </>
  );
}
