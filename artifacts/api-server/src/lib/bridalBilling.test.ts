import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { bridalBillingAction, bridalMetadata } from "./bridalBilling.js";

const prices = { starter: "price_starter", growth: "price_growth", credit_pack: "price_pack" };

function settle(type: string, object: Record<string, unknown>) {
  return bridalBillingAction({ type, data: { object } } as unknown as Stripe.Event, prices);
}

const pack = {
  id: "cs_pack", mode: "payment", payment_status: "paid",
  customer: "cus_bridal", metadata: bridalMetadata(7, "credit_pack"),
};
const line = {
  type: "subscription", price: { id: prices.starter }, proration: false, period: { end: 1783728000 },
};
const invoice = {
  id: "in_cycle", status: "paid", billing_reason: "subscription_cycle",
  customer: { id: "cus_bridal" }, subscription: "sub_bridal",
  subscription_details: { metadata: bridalMetadata(7, "starter") }, lines: { data: [line] },
};

test("Checkout metadata identifies Bridal exclusively on the shared account", () => {
  assert.deepEqual(pack.metadata, { application: "glimpse-bridal", bridalOrg: "7", bridalProduct: "credit_pack" });
  for (const metadata of [null, {}, { organizationId: "7", product: "credit_pack" },
    { ...pack.metadata, application: "other" }, { ...pack.metadata, bridalOrg: "0" }]) {
    assert.equal(settle("checkout.session.completed", { ...pack, metadata }), null);
  }
});

test("only a paid one-time checkout settles and retries share its fulfillment reference", () => {
  const paid = { kind: "pack", customer: "cus_bridal", organizationId: 7, reference: "bridal:checkout:cs_pack" };
  assert.deepEqual(settle("checkout.session.completed", pack), paid);
  assert.deepEqual(settle("checkout.session.async_payment_succeeded", pack), paid);
  assert.equal(settle("checkout.session.completed", { ...pack, payment_status: "unpaid" }), null);
  assert.equal(settle("checkout.session.async_payment_failed", pack), null);
  assert.equal(settle("checkout.session.completed", { ...pack, mode: "subscription" }), null);
});

test("initial payments and renewals use the billed non-prorated plan and its actual period", () => {
  for (const reason of ["subscription_create", "subscription_cycle"]) {
    const lines = { data: [{ ...line, price: { id: "other" } }, { ...line, proration: true },
      { ...line, price: { id: prices.growth } }] };
    assert.deepEqual(settle("invoice.paid", { ...invoice, billing_reason: reason, lines }), {
      kind: "renewal", customer: "cus_bridal", organizationId: 7, subscription: "sub_bridal",
      reference: "bridal:invoice:in_cycle", plan: "growth", periodEnd: new Date(line.period.end * 1000),
    });
  }
});

test("unrelated, prorated and unpaid invoices never refresh credits", () => {
  for (const diff of [{ billing_reason: "subscription_update" }, { status: "open" },
    { lines: { data: [{ ...line, proration: true }] } }, { lines: { data: [{ ...line, price: { id: "other" } }] } },
    { subscription_details: null }, { subscription_details: { metadata: { organizationId: "7" } } },
    { subscription_details: { metadata: pack.metadata } }]) {
    assert.equal(settle("invoice.paid", { ...invoice, ...diff }), null);
  }
});

test("only a Bridal subscription cancellation identifies a subscription to close", () => {
  const cancel = { id: "sub_bridal", customer: "cus_bridal", metadata: bridalMetadata(7, "growth") };
  assert.deepEqual(settle("customer.subscription.deleted", cancel), {
    kind: "cancel", organizationId: 7, customer: "cus_bridal", subscription: "sub_bridal",
  });
  assert.equal(settle("customer.subscription.deleted", { ...cancel, metadata: { organizationId: "7" } }), null);
});
