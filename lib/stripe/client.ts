import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover",
    });
  }
  return _stripe;
}

export async function createInvoiceForOrganization(
  stripeCustomerId: string,
  lineItems: Array<{ description: string; amount: number }>,
  dueDate: Date
): Promise<Stripe.Invoice> {
  const invoice = await getStripe().invoices.create({
    customer: stripeCustomerId,
    collection_method: "send_invoice",
    days_until_due: Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  });

  for (const item of lineItems) {
    await getStripe().invoiceItems.create({
      customer: stripeCustomerId,
      invoice: invoice.id,
      description: item.description,
      amount: item.amount,
      currency: "usd",
    });
  }

  const finalizedInvoice = await getStripe().invoices.finalizeInvoice(invoice.id);
  await getStripe().invoices.sendInvoice(invoice.id);

  return finalizedInvoice;
}

export async function getOrCreateStripeCustomer(
  name: string,
  email: string,
  existingCustomerId?: string | null
): Promise<string> {
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const customer = await getStripe().customers.create({ name, email });
  return customer.id;
}
