import { useMemo, useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSessionByToken,
  useGetSessionReactions,
  useCreateReaction,
  getGetSessionByTokenQueryKey,
  getGetSessionReactionsQueryKey,
  ReactionKind,
  type ReactionKind as ReactionKindType,
  type LookTallyItem,
} from "@workspace/api-client-react";

/**
 * Share-to-party votes (spec §6.4). The bride sends this link to her people;
 * they see her look and vote — no account, ever. Enough "love" votes surfaces a
 * gentle "book a fitting" nudge. A dark surface (§8), the visualization
 * disclaimer on every look surface (invariant 5).
 */

const VISUALIZATION_DISCLAIMER =
  "Visualization only — not a representation of fit, size, or exact fabric.";

const VOTES: Array<{ kind: ReactionKindType; label: string; emoji: string }> = [
  { kind: ReactionKind.love, label: "Love it", emoji: "♥" },
  { kind: ReactionKind.maybe, label: "Maybe", emoji: "◐" },
  { kind: ReactionKind.pass, label: "Pass", emoji: "○" },
];

function storageImageUrl(objectKey: string, shareToken: string): string {
  return `/api/storage${objectKey}?shareToken=${encodeURIComponent(shareToken)}`;
}

// A stable anonymous per-viewer token, minted once and kept in localStorage, so
// a viewer's repeat vote updates their existing one instead of stacking.
function useVoterToken(): string {
  return useMemo(() => {
    const key = "veil.voterToken";
    try {
      const existing = localStorage.getItem(key);
      if (existing && existing.length >= 8) return existing;
      const minted = `v_${crypto.randomUUID().replace(/-/g, "")}`;
      localStorage.setItem(key, minted);
      return minted;
    } catch {
      // Storage unavailable (private mode) — a per-session token still works.
      return `v_${crypto.randomUUID().replace(/-/g, "")}`;
    }
  }, []);
}

export default function LookSharePage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const token = shareToken || "";
  const voterToken = useVoterToken();
  const queryClient = useQueryClient();

  const sessionQuery = useGetSessionByToken(token, {
    query: { queryKey: getGetSessionByTokenQueryKey(token), enabled: !!token },
  });
  const reactionsQuery = useGetSessionReactions(token, {
    query: { queryKey: getGetSessionReactionsQueryKey(token), enabled: !!token },
  });
  const createReaction = useCreateReaction();

  const [myVote, setMyVote] = useState<ReactionKindType | null>(null);

  const look = sessionQuery.data?.generatedAssets?.find((asset) => asset.assetType === "image");
  const tally: LookTallyItem | undefined = reactionsQuery.data?.looks?.find(
    (item) => item.generatedAssetId === look?.id,
  );

  const vote = (kind: ReactionKindType) => {
    if (!look) return;
    setMyVote(kind);
    createReaction.mutate(
      { data: { generatedAssetId: look.id, voterToken, kind } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSessionReactionsQueryKey(token) });
        },
      },
    );
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-2xl px-6 py-14">
        {sessionQuery.isLoading && <p className="text-neutral-400">Loading…</p>}

        {(sessionQuery.isError || (sessionQuery.data && !look)) && (
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">This look isn't available.</h1>
            <p className="text-neutral-400">The link may have expired, or the look was deleted.</p>
          </div>
        )}

        {look && (
          <>
            <header className="mb-8 text-center">
              <p className="text-sm uppercase tracking-widest text-neutral-500">Help her choose</p>
              <h1 className="mt-2 text-3xl font-semibold">What do you think?</h1>
            </header>

            <div className="overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-neutral-800">
              <img src={storageImageUrl(look.objectKey, token)} alt="Her look" className="w-full" />
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {VOTES.map((option) => {
                const active = myVote === option.kind;
                return (
                  <button
                    key={option.kind}
                    type="button"
                    onClick={() => vote(option.kind)}
                    disabled={createReaction.isPending}
                    className={`flex flex-col items-center gap-1 rounded-lg py-4 text-sm ring-1 transition disabled:opacity-60 ${
                      active
                        ? "bg-neutral-100 text-neutral-900 ring-neutral-100"
                        : "bg-neutral-900 text-neutral-200 ring-neutral-700 hover:ring-neutral-500"
                    }`}
                  >
                    <span className="text-xl" aria-hidden>
                      {option.emoji}
                    </span>
                    {option.label}
                  </button>
                );
              })}
            </div>

            {tally && tally.total > 0 && (
              <p className="mt-5 text-center text-sm text-neutral-400">
                {tally.total} {tally.total === 1 ? "vote" : "votes"} so far
                {typeof tally.byKind.love === "number" && tally.byKind.love > 0
                  ? ` · ${tally.byKind.love} love ${tally.byKind.love === 1 ? "it" : "it"}`
                  : ""}
              </p>
            )}

            {tally?.bookFitting && (
              <div className="mt-6 rounded-lg bg-emerald-950/60 px-4 py-3 text-center text-sm text-emerald-200">
                Her people love this one. Time to book a fitting.
              </div>
            )}

            <p className="mt-10 text-center text-xs text-neutral-500">{VISUALIZATION_DISCLAIMER}</p>
          </>
        )}
      </div>
    </main>
  );
}
