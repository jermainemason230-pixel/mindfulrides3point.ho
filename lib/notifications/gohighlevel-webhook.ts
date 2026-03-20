import { Ride, User } from "@/types/database";

interface WebhookPayload {
  event: string;
  ride_id: string;
  patient_name: string;
  pickup_address: string;
  dropoff_address: string;
  scheduled_time: string;
  driver_name?: string;
  driver_phone?: string;
  facility_name?: string;
  recipients: Array<{
    type: string;
    email?: string;
    phone?: string;
  }>;
}

export async function sendWebhook(payload: WebhookPayload): Promise<boolean> {
  const webhookUrl = process.env.GOHIGHLEVEL_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("GoHighLevel webhook URL not configured");
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    console.error("Failed to send GoHighLevel webhook:", error);
    return false;
  }
}

export function buildRideWebhookPayload(
  event: string,
  ride: Ride,
  driverUser?: User,
  facilityName?: string,
  recipients: Array<{ type: string; email?: string; phone?: string }> = []
): WebhookPayload {
  return {
    event,
    ride_id: ride.id,
    patient_name: ride.patient_name,
    pickup_address: ride.pickup_address,
    dropoff_address: ride.dropoff_address,
    scheduled_time: ride.scheduled_pickup_time,
    driver_name: driverUser?.full_name,
    driver_phone: driverUser?.phone || undefined,
    facility_name: facilityName,
    recipients,
  };
}
