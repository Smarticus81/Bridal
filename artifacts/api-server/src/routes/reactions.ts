import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, reactionsTable, generatedAssetsTable, coupleSessionsTable } from "@workspace/db";
import { CreateReactionBody } from "@workspace/api-zod";
import {
  shouldSurfaceBookFitting,
  tallyLookVotes,
  type ReactionRow,
} from "../lib/engagementMetrics.js";

const router: IRouter = Router();

async function tallyForAssets(assetIds: number[]) {
  if (assetIds.length === 0) return [];
  const rows = await db
    .select({
      generatedAssetId: reactionsTable.generatedAssetId,
      voterToken: reactionsTable.voterToken,
      kind: reactionsTable.kind,
    })
    .from(reactionsTable)
    .where(inArray(reactionsTable.generatedAssetId, assetIds));
  return tallyLookVotes(rows as ReactionRow[]);
}

// POST /reactions — cast/update a viewer's reaction on a look. Public, no account.
router.post("/reactions", async (req, res): Promise<void> => {
  const parsed = CreateReactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { generatedAssetId, voterToken, kind, voterEmail } = parsed.data;

  const [asset] = await db
    .select({ id: generatedAssetsTable.id, sessionId: generatedAssetsTable.sessionId })
    .from(generatedAssetsTable)
    .where(eq(generatedAssetsTable.id, generatedAssetId))
    .limit(1);
  if (!asset) {
    res.status(404).json({ error: "That look no longer exists." });
    return;
  }

  // One reaction per viewer per look: a repeat vote updates the existing row.
  await db
    .insert(reactionsTable)
    .values({
      sessionId: asset.sessionId,
      generatedAssetId,
      voterToken,
      kind,
      voterEmail: voterEmail ?? null,
    })
    .onConflictDoUpdate({
      target: [reactionsTable.generatedAssetId, reactionsTable.voterToken],
      set: { kind, voterEmail: voterEmail ?? null },
    });

  const [tally] = await tallyForAssets([generatedAssetId]);
  const total = tally?.total ?? 0;
  res.json({
    generatedAssetId,
    kind,
    total,
    byKind: tally?.byKind ?? {},
    bookFitting: shouldSurfaceBookFitting(total),
  });
});

// GET /sessions/by-token/:shareToken/reactions — live per-look tally for the share page.
router.get("/sessions/by-token/:shareToken/reactions", async (req, res): Promise<void> => {
  const shareToken = req.params.shareToken;
  if (!shareToken || shareToken.length < 16) {
    res.status(404).json({ error: "No such share." });
    return;
  }

  const [session] = await db
    .select({ id: coupleSessionsTable.id })
    .from(coupleSessionsTable)
    .where(eq(coupleSessionsTable.shareToken, shareToken))
    .limit(1);
  if (!session) {
    res.status(404).json({ error: "No such share." });
    return;
  }

  const assets = await db
    .select({ id: generatedAssetsTable.id })
    .from(generatedAssetsTable)
    .where(and(eq(generatedAssetsTable.sessionId, session.id), eq(generatedAssetsTable.assetType, "image")));

  const tally = await tallyForAssets(assets.map((a) => a.id));
  res.json({
    looks: tally.map((item) => ({
      generatedAssetId: item.generatedAssetId,
      total: item.total,
      byKind: item.byKind,
      bookFitting: shouldSurfaceBookFitting(item.total),
    })),
  });
});

export default router;
