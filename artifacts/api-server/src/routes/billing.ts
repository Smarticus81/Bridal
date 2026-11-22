import { Router, type IRouter, type Request, type Response } from "express";
import { Webhook } from "svix";
import Stripe from "stripe";
import { bridalMetadata, bridalBillingAction } from "../lib/bridalBilling.js";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  organizationsTable,
  venuesTable,
  creditTransactionsTable,
  STARTER_MONTHLY_CREDITS,
  GROWTH_MONTHLY_CREDITS,
  CREDIT_PACK_AMOUNT,
  type Organization,
} from "@workspace/db";
import {
  requireStripe,
  isStripeConfigured,
  STRIPE_PRICES,
  getAppBaseUrl,
  type BillingProduct,
} from "../lib/stripe.js";
import {
  requireOrg,
  requireOwnerMutationOrigin,
  ensureOrganizationByClerkId,
  fetchClerkUserEmail,
} from "../lib/orgAuth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/* ————— Org summary (dashboard) ————— */

// GET /org — the caller's organization: plan, credits, and its venues.
router.get("/org", async (req, res): Promise<void> => {
  const ctx = await requireOrg(req, res);
  if (!ctx) return;

  const venues = await db
    .select({
      id: venuesTable.id,
      name: venuesTable.name,
      slug: venuesTable.slug,
      tagline: venuesTable.tagline,
      createdAt: venuesTable.createdAt,
    })
    .from(venuesTable)
    .where(eq(venuesTable.organizationId, ctx.org.id))
    .orderBy(venuesTable.createdAt);

  res.json({
    organization: {
      id: ctx.org.id,
      name: ctx.org.name,
      plan: ctx.org.plan,
      creditsBalance: ctx.org.creditsBalance,
      billingPeriodEnd: ctx.org.billingPeriodEnd,
      clerkOrgId: ctx.org.clerkOrgId,
      role: ctx.orgRole,
      billingConfigured: isStripeConfigured(),
    },
    venues,
  });
});

// GET /org/credit-history — recent ledger rows for the caller's organization.
router.get("/org/credit-history", async (req, res): Promise<void> => {
  const ctx = await requireOrg(req, res);
  if (!ctx) return;

  const rows = await db
    .select({
      id: creditTransactionsTable.id,
      delta: creditTransactionsTable.delta,
      reason: creditTransactionsTable.reason,
      venueId: creditTransactionsTable.venueId,
      sessionId: creditTransactionsTable.sessionId,
      createdAt: creditTransactionsTable.createdAt,
    })
    .from(creditTransactionsTable)
    .where(eq(creditTransactionsTable.organizationId, ctx.org.id))
    .orderBy(desc(creditTransactionsTable.createdAt))
    .limit(50);

  res.json({ transactions: rows });
});

/* ————— Stripe billing (organization-scoped) ————— */

async function ensureStripeCustomer(org: Organization, clerkUserId: string): Promise<string> {
  const stripe = requireStripe();
  if (org.stripeCustomerId) return org.stripeCustomerId;

  // Only hit Clerk for the billing email on first-time customer creation.
  const billingEmail = await fetchClerkUserEmail(clerkUserId);
  const customer = await stripe.customers.create({
    email: billingEmail ?? undefined,
    name: org.name,
    metadata: { application: "glimpse-bridal", bridalOrg: String(org.id) },
  }, { idempotencyKey: `glimpse-bridal-customer-${org.clerkOrgId}` });

  await db
    .update(organizationsTable)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizationsTable.id, org.id));

  return customer.id;
}

// POST /org/billing/checkout — start Stripe Checkout for the caller's org.
router.post("/org/billing/checkout", async (req, res): Promise<void> => {
  if (!requireOwnerMutationOrigin(req, res)) return;
  if (!isStripeConfigured()) {
    res.status(503).json({ error: "Billing is not configured on this server." });
    return;
  }

  const ctx = await requireOrg(req, res);
  if (!ctx) return;

  const product = req.body?.product as BillingProduct;
  if (!product || !Object.hasOwn(STRIPE_PRICES, product)) {
    res.status(400).json({ error: "product must be starter, growth, or credit_pack" });
    return;
  }

  if (product !== "credit_pack" && ctx.org.stripeSubscriptionId) {
    res.status(409).json({ error: "Your boutique already has a subscription. Use Manage billing to change it." });
    return;
  }
  const priceId = STRIPE_PRICES[product];
  if (!priceId) {
    res.status(503).json({ error: "Price not configured for this product" });
    return;
  }

  try {
    const stripe = requireStripe();
    const customerId = await ensureStripeCustomer(ctx.org, ctx.clerkUserId);
    const base = getAppBaseUrl();

    const isSubscription = product === "starter" || product === "growth";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: isSubscription ? "subscription" : "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/dashboard?billing=success`,
      cancel_url: `${base}/dashboard?billing=cancel`,
      metadata: bridalMetadata(ctx.org.id, product),
      subscription_data: isSubscription
        ? { metadata: bridalMetadata(ctx.org.id, product) }
        : undefined,
    });

    if (!session.url) {
      res.status(500).json({ error: "Failed to create checkout session" });
      return;
    }

    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err, orgId: ctx.org.id, product }, "Stripe checkout failed");
    res.status(500).json({ error: "Could not start checkout" });
  }
});

// POST /org/billing/portal — open the Stripe customer portal for the org.
router.post("/org/billing/portal", async (req, res): Promise<void> => {
  if (!requireOwnerMutationOrigin(req, res)) return;
  if (!isStripeConfigured()) {
    res.status(503).json({ error: "Billing is not configured on this server." });
    return;
  }

  const ctx = await requireOrg(req, res);
  if (!ctx) return;


  try {
    const stripe = requireStripe();
    const customerId = await ensureStripeCustomer(ctx.org, ctx.clerkUserId);
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getAppBaseUrl()}/dashboard`,
    });
    res.json({ url: portal.url });
  } catch (err) {
    logger.error({ err, orgId: ctx.org.id }, "Stripe portal failed");
    res.status(500).json({ error: "Could not open billing portal" });
  }
});

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(503).send("Webhook secret not configured");
    return;
  }

  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    res.status(400).send("Missing stripe-signature");
    return;
  }

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch {
    logger.warn("Stripe webhook signature verification failed");
    res.status(400).send("Invalid signature");
    return;
  }

  try {
    const action = bridalBillingAction(event, STRIPE_PRICES);
    if (!action) {
      res.json({ received: true });
      return;
    }
    if (!process.env.DATABASE_URL) {
      res.status(503).send("Billing ledger temporarily unavailable");
      return;
    }

    // Concurrent notifications for a boutique settle in one ledger transaction.
    await db.transaction(async tx => {
      const [org] = await tx.select().from(organizationsTable).where(and(
        eq(organizationsTable.id, action.organizationId),
        eq(organizationsTable.stripeCustomerId, action.customer),
      )).for("update");
      if (!org) throw new Error("Bridal billing customer mapping is unavailable");

      if (action.kind === "cancel") {
        await tx.insert(creditTransactionsTable).values({
          organizationId: org.id, delta: 0, reason: "subscription_canceled",
          stripeEventId: `bridal:cancel:${action.subscription}`,
        }).onConflictDoNothing();
        if (org.stripeSubscriptionId === action.subscription) {
          await tx.update(organizationsTable)
            .set({ plan: "none", stripeSubscriptionId: null, billingPeriodEnd: null })
            .where(eq(organizationsTable.id, org.id));
        }
        return;
      }

      if (action.kind === "renewal") {
        const [canceled] = await tx.select({ id: creditTransactionsTable.id })
          .from(creditTransactionsTable)
          .where(eq(creditTransactionsTable.stripeEventId, `bridal:cancel:${action.subscription}`));
        if (canceled || (org.billingPeriodEnd && org.billingPeriodEnd >= action.periodEnd)) return;
      }

      const nextBalance = action.kind === "pack"
        ? org.creditsBalance + CREDIT_PACK_AMOUNT
        : action.plan === "growth" ? GROWTH_MONTHLY_CREDITS : STARTER_MONTHLY_CREDITS;
      const entry = await tx.insert(creditTransactionsTable).values({
        organizationId: org.id,
        delta: nextBalance - org.creditsBalance,
        reason: action.kind === "pack" ? "pack_purchase" : "subscription_grant",
        stripeEventId: action.reference,
      }).onConflictDoNothing().returning({ id: creditTransactionsTable.id });
      if (!entry.length) return;

      const subscription = action.kind === "renewal"
        ? { plan: action.plan, stripeSubscriptionId: action.subscription, billingPeriodEnd: action.periodEnd }
        : {};
      await tx.update(organizationsTable).set({ ...subscription, creditsBalance: nextBalance })
        .where(eq(organizationsTable.id, org.id));
    });
  } catch (err) {
    logger.error({ err, type: event.type }, "Stripe webhook handler error");
    res.status(500).send("Webhook handler failed");
    return;
  }

  res.json({ received: true });
}

/* ————— Clerk webhook (organization sync only — billing is Stripe) ————— */

type ClerkWebhookEvent = {
  type: string;
  data: { id?: string; name?: string };
};

export async function handleClerkWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    res.status(503).send("Clerk webhook secret not configured");
    return;
  }

  const svixId = req.headers["svix-id"];
  const svixTimestamp = req.headers["svix-timestamp"];
  const svixSignature = req.headers["svix-signature"];
  if (
    typeof svixId !== "string" ||
    typeof svixTimestamp !== "string" ||
    typeof svixSignature !== "string"
  ) {
    res.status(400).send("Missing svix headers");
    return;
  }

  const payload = req.body instanceof Buffer ? req.body.toString("utf8") : "";
  let event: ClerkWebhookEvent;
  try {
    const webhook = new Webhook(secret);
    event = webhook.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    logger.warn({ err }, "Clerk webhook signature verification failed");
    res.status(400).send("Invalid signature");
    return;
  }

  try {
    if (event.type === "organization.created" || event.type === "organization.updated") {
      const clerkOrgId = event.data.id;
      const name = event.data.name;
      if (clerkOrgId) {
        const org = await ensureOrganizationByClerkId(clerkOrgId, name);
        if (name && name !== org.name) {
          await db
            .update(organizationsTable)
            .set({ name })
            .where(eq(organizationsTable.id, org.id));
        }
      }
    }
  } catch (err) {
    logger.error({ err, type: event.type }, "Clerk webhook handler error");
    res.status(500).send("Webhook handler failed");
    return;
  }

  res.json({ received: true });
}

export default router;
