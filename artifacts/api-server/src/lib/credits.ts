import {
  db,
  venuesTable,
  organizationsTable,
  consentRecordsTable,
  lookbooksTable,
  creditTransactionsTable,
  coupleSessionsTable,
} from "@workspace/db";
import { eq, and, sql, gte } from "drizzle-orm";
import { logger } from "./logger.js";

const CREDITS_STANDARD = 1;
export const VENUE_DAILY_SESSION_CAP = 50;
export const MIN_VENUE_PHOTOS = 1;

export function creditsForSession(): number {
  return CREDITS_STANDARD;
}

/** Couple-safe venue payload - no billing fields. */
export function toPublicVenue(
  venue: {
    id: number;
    name: string;
    slug: string;
    tagline: string | null;
    description: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    websiteUrl: string | null;
    bookingUrl: string | null;
    createdAt: Date;
    creditsBalance: number;
  },
  media: Array<{ coverage?: string | null }>,
) {
  return {
    id: venue.id,
    name: venue.name,
    slug: venue.slug,
    tagline: venue.tagline,
    description: venue.description,
    contactEmail: venue.contactEmail,
    contactPhone: venue.contactPhone,
    websiteUrl: venue.websiteUrl,
    bookingUrl: venue.bookingUrl,
    createdAt: venue.createdAt,
    media,
    isReady: media.length >= MIN_VENUE_PHOTOS,
  };
}

/**
 * Billing lives on the organization. A venue with an organizationId draws
 * from the org balance; a legacy venue (no org yet) still draws from its own
 * venue-level balance until an owner sign-in adopts it.
 */
async function resolveVenueOrgId(venueId: number): Promise<number | null> {
  const [row] = await db
    .select({ organizationId: venuesTable.organizationId })
    .from(venuesTable)
    .where(eq(venuesTable.id, venueId));
  return row?.organizationId ?? null;
}

async function getOrgCreditsBalance(orgId: number): Promise<number> {
  const [row] = await db
    .select({ creditsBalance: organizationsTable.creditsBalance })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));
  return row?.creditsBalance ?? 0;
}

/** Effective spendable balance for a venue (org balance when adopted). */
async function getVenueCreditsBalance(venueId: number): Promise<number> {
  const orgId = await resolveVenueOrgId(venueId);
  if (orgId != null) return getOrgCreditsBalance(orgId);
  const [row] = await db
    .select({ creditsBalance: venuesTable.creditsBalance })
    .from(venuesTable)
    .where(eq(venuesTable.id, venueId));
  return row?.creditsBalance ?? 0;
}

export async function refundCreditsForSession(sessionId: number, failureMessage?: string): Promise<boolean> {
  const refunded = await db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        venueId: coupleSessionsTable.venueId,
        creditsCharged: coupleSessionsTable.creditsCharged,
      })
      .from(coupleSessionsTable)
      .where(eq(coupleSessionsTable.id, sessionId));

    if (!session || session.creditsCharged <= 0) return null;

    const [cleared] = await tx
      .update(coupleSessionsTable)
      .set({ creditsCharged: 0, ...(failureMessage ? { status: "failed", errorMessage: failureMessage, completedAt: new Date() } : {}) })
      .where(
        and(
          eq(coupleSessionsTable.id, sessionId),
          eq(coupleSessionsTable.creditsCharged, session.creditsCharged),
        ),
      )
      .returning({ id: coupleSessionsTable.id });

    if (!cleared) return null;

    const [venueRow] = await tx
      .select({ organizationId: venuesTable.organizationId })
      .from(venuesTable)
      .where(eq(venuesTable.id, session.venueId));
    const [consent] = await tx.select({ lookbookId: consentRecordsTable.lookbookId })
      .from(consentRecordsTable).where(eq(consentRecordsTable.sessionId, sessionId)).limit(1);
    let orgId = venueRow?.organizationId ?? null;
    if (consent?.lookbookId) {
      const [book] = await tx.update(lookbooksTable)
        .set({ creditsUsed: sql`GREATEST(${lookbooksTable.creditsUsed} - 1, 0)` })
        .where(eq(lookbooksTable.id, consent.lookbookId)).returning({ organizationId: lookbooksTable.organizationId });
      orgId = book?.organizationId ?? orgId;
    }

    if (orgId != null) {
      await tx
        .update(organizationsTable)
        .set({ creditsBalance: sql`${organizationsTable.creditsBalance} + ${session.creditsCharged}` })
        .where(eq(organizationsTable.id, orgId));
    } else {
      await tx
        .update(venuesTable)
        .set({ creditsBalance: sql`${venuesTable.creditsBalance} + ${session.creditsCharged}` })
        .where(eq(venuesTable.id, session.venueId));
    }

    await tx.insert(creditTransactionsTable).values({
      organizationId: orgId,
      venueId: session.venueId,
      delta: session.creditsCharged,
      reason: "session_refund",
      sessionId,
    });

    return { amount: session.creditsCharged };
  });

  if (!refunded) {
    return false;
  }

  logger.info({ sessionId, amount: refunded.amount }, "Refunded session credits");
  return true;
}

export async function countVenueSessionsToday(venueId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(coupleSessionsTable)
    .where(
      and(
        eq(coupleSessionsTable.venueId, venueId),
        gte(coupleSessionsTable.createdAt, sql`date_trunc('day', now())`),
      ),
    );
  return row?.count ?? 0;
}

export async function hasSufficientCredits(
  venueId: number,
  amount: number,
): Promise<boolean> {
  const balance = await getVenueCreditsBalance(venueId);
  return balance >= amount;
}
