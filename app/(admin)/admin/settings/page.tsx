"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  DollarSign,
  Link2,
  Save,
  Webhook,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { VehicleType } from "@/types/database";

const VEHICLE_TYPES: { key: VehicleType; label: string }[] = [
  { key: "ambulatory", label: "Ambulatory" },
  { key: "wheelchair", label: "Wheelchair" },
  { key: "bariatric", label: "Bariatric" },
  { key: "stretcher", label: "Stretcher" },
];

interface SettingsState {
  base_rate: string;
  per_mile_rate: string;
  vehicle_multipliers: Record<VehicleType, string>;
  shared_ride_discount: string;
  round_trip_multiplier: string;
  gohighlevel_webhook_url: string;
}

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webhookSaving, setWebhookSaving] = useState(false);

  const [settings, setSettings] = useState<SettingsState>({
    base_rate: "25.00",
    per_mile_rate: "2.50",
    vehicle_multipliers: {
      ambulatory: "1.0",
      wheelchair: "1.25",
      bariatric: "1.5",
      stretcher: "2.0",
    },
    shared_ride_discount: "0.2",
    round_trip_multiplier: "1.8",
    gohighlevel_webhook_url: "",
  });

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data: pricingRow } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "pricing")
        .single();

      if (pricingRow?.value) {
        const v = pricingRow.value as Record<string, unknown>;
        setSettings((prev) => ({
          ...prev,
          base_rate: String(v.base_rate ?? "25.00"),
          per_mile_rate: String(v.per_mile_rate ?? "2.50"),
          vehicle_multipliers: {
            ambulatory: String(
              (v.vehicle_multipliers as Record<string, unknown>)?.ambulatory ?? "1.0"
            ),
            wheelchair: String(
              (v.vehicle_multipliers as Record<string, unknown>)?.wheelchair ?? "1.25"
            ),
            bariatric: String(
              (v.vehicle_multipliers as Record<string, unknown>)?.bariatric ?? "1.5"
            ),
            stretcher: String(
              (v.vehicle_multipliers as Record<string, unknown>)?.stretcher ?? "2.0"
            ),
          },
          shared_ride_discount: String(v.shared_ride_discount ?? "0.2"),
          round_trip_multiplier: String(v.round_trip_multiplier ?? "1.8"),
        }));
      }

      const { data: webhookRow } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "webhook_url")
        .single();

      if (webhookRow?.value) {
        setSettings((prev) => ({
          ...prev,
          gohighlevel_webhook_url:
            (webhookRow.value as Record<string, string>).url ?? "",
        }));
      }
    } catch {
      toast("Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSavePricing = async () => {
    setSaving(true);
    try {
      const pricingValue = {
        base_rate: parseFloat(settings.base_rate) || 25,
        per_mile_rate: parseFloat(settings.per_mile_rate) || 2.5,
        vehicle_multipliers: {
          ambulatory:
            parseFloat(settings.vehicle_multipliers.ambulatory) || 1,
          wheelchair:
            parseFloat(settings.vehicle_multipliers.wheelchair) || 1.25,
          bariatric:
            parseFloat(settings.vehicle_multipliers.bariatric) || 1.5,
          stretcher:
            parseFloat(settings.vehicle_multipliers.stretcher) || 2,
        },
        shared_ride_discount:
          parseFloat(settings.shared_ride_discount) || 0.2,
        round_trip_multiplier:
          parseFloat(settings.round_trip_multiplier) || 1.8,
      };

      const { error } = await supabase
        .from("app_settings")
        .upsert({
          key: "pricing",
          value: pricingValue,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        toast("Failed to save pricing settings: " + error.message, "error");
        return;
      }
      toast("Pricing settings saved successfully", "success");
    } catch {
      toast("Failed to save pricing settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWebhook = async () => {
    setWebhookSaving(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert({
          key: "webhook_url",
          value: { url: settings.gohighlevel_webhook_url },
          updated_at: new Date().toISOString(),
        });

      if (error) {
        toast("Failed to save webhook URL: " + error.message, "error");
        return;
      }
      toast("Webhook URL saved successfully", "success");
    } catch {
      toast("Failed to save webhook URL", "error");
    } finally {
      setWebhookSaving(false);
    }
  };

  const updateMultiplier = (key: VehicleType, value: string) => {
    setSettings((prev) => ({
      ...prev,
      vehicle_multipliers: {
        ...prev.vehicle_multipliers,
        [key]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <Skeleton variant="card" className="h-64" />
        <Skeleton variant="card" className="h-32" />
        <Skeleton variant="card" className="h-24" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Pricing Configuration */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-[#276EF1]" />
          <h2 className="text-lg font-semibold text-gray-900">
            Pricing Configuration
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Base Rate ($)"
            type="number"
            step="0.01"
            min="0"
            value={settings.base_rate}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                base_rate: e.target.value,
              }))
            }
          />
          <Input
            label="Per-Mile Rate ($)"
            type="number"
            step="0.01"
            min="0"
            value={settings.per_mile_rate}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                per_mile_rate: e.target.value,
              }))
            }
          />
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-gray-700">
            Vehicle Type Multipliers
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VEHICLE_TYPES.map(({ key, label }) => (
              <Input
                key={key}
                label={`${label} (x)`}
                type="number"
                step="0.05"
                min="0.5"
                value={settings.vehicle_multipliers[key]}
                onChange={(e) => updateMultiplier(key, e.target.value)}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Input
            label="Shared Ride Discount (0-1)"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={settings.shared_ride_discount}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                shared_ride_discount: e.target.value,
              }))
            }
          />
          <Input
            label="Round Trip Multiplier"
            type="number"
            step="0.01"
            min="1"
            value={settings.round_trip_multiplier}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                round_trip_multiplier: e.target.value,
              }))
            }
          />
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSavePricing} loading={saving}>
            <Save className="mr-2 h-4 w-4" />
            Save Pricing
          </Button>
        </div>
      </Card>

      {/* GoHighLevel Webhook */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Webhook className="h-5 w-5 text-[#276EF1]" />
          <h2 className="text-lg font-semibold text-gray-900">
            GoHighLevel Integration
          </h2>
        </div>
        <Input
          label="Webhook URL"
          type="url"
          placeholder="https://services.leadconnectorhq.com/hooks/..."
          value={settings.gohighlevel_webhook_url}
          onChange={(e) =>
            setSettings((prev) => ({
              ...prev,
              gohighlevel_webhook_url: e.target.value,
            }))
          }
        />
        <div className="mt-4 flex justify-end">
          <Button onClick={handleSaveWebhook} loading={webhookSaving}>
            <Save className="mr-2 h-4 w-4" />
            Save Webhook
          </Button>
        </div>
      </Card>

      {/* Stripe Connection */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Link2 className="h-5 w-5 text-[#276EF1]" />
          <h2 className="text-lg font-semibold text-gray-900">
            Stripe Connection
          </h2>
        </div>
        <p className="text-sm text-gray-500">
          Configure Stripe keys in environment variables
        </p>
      </Card>
    </div>
  );
}
