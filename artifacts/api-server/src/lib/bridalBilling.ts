import type Stripe from "stripe";
import type { BillingProduct } from "./stripe.js";

export function bridalMetadata(organizationId: number, product: BillingProduct) {
  return {
    application: "glimpse-bridal",
    bridalOrg: String(organizationId),
    bridalProduct: product,
  };
}

function identity(metadata?: Stripe.Metadata | null) {
  if (metadata?.application !== "glimpse-bridal") return null;
  const organizationId = Number(metadata.bridalOrg);
  const product = metadata.bridalProduct;
  if (!Number.isSafeInteger(organizationId) || organizationId < 1) return null;
  if (product !== "credit_pack" && product !== "starter" && product !== "growth") return null;
  return { organizationId, product };
}

function id(object: string | { id: string } | null | undefined) {
  return typeof object === "string" ? object : object?.id;
}

/** Interpret snapshots from the Bridal webhook's pinned Stripe API version. */
export function bridalBillingAction(event: Stripe.Event, prices: Record<BillingProduct, string>) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const owner = identity(session.metadata);
      const customer = id(session.customer);
      if (!customer || owner?.product !== "credit_pack" || session.mode !== "payment" || session.payment_status !== "paid") return null;
      return { kind: "pack" as const, customer, organizationId: owner.organizationId, reference: `bridal:checkout:${session.id}` };
    }
    case "invoice.paid": {
      const invoice = event.data.object;
      const owner = identity(invoice.subscription_details?.metadata);
      const customer = id(invoice.customer);
      const subscription = id(invoice.subscription);
      if (!owner || owner.product === "credit_pack" || !customer || !subscription || invoice.status !== "paid") return null;
      if (invoice.billing_reason !== "subscription_create" && invoice.billing_reason !== "subscription_cycle") return null;
      const line = invoice.lines?.data.find(item => item.type === "subscription" && !item.proration &&
        item.price?.id && (item.price.id === prices.starter || item.price.id === prices.growth));
      if (!line?.price || !line.period?.end) return null;
      const plan = line.price.id === prices.growth ? "growth" as const : "starter" as const;
      return { kind: "renewal" as const, customer, subscription, organizationId: owner.organizationId,
        plan, periodEnd: new Date(line.period.end * 1000), reference: `bridal:invoice:${invoice.id}` };
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const owner = identity(sub.metadata);
      const customer = id(sub.customer);
      if (!owner || owner.product === "credit_pack" || !customer) return null;
      return { kind: "cancel" as const, customer, organizationId: owner.organizationId, subscription: sub.id };
    }
    default:
      return null;
  }
}
