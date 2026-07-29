import { useParams } from "wouter";
import {
  useGetLookbookByToken,
  getGetLookbookByTokenQueryKey,
} from "@workspace/api-client-react";

/**
 * The bride's remote entry: /try/:lookbookToken. No account, ever. A dark
 * surface (§8 — dark where you look at images) with the shop's curated dresses
 * sitting directly on the ground, metadata small beneath. Renders the
 * visualization disclaimer, which must appear on every look surface (invariant 5).
 */

// Kept as a literal so the exact required string ships in the bundle and is
// assertable by smoke:security.
const VISUALIZATION_DISCLAIMER =
  "Visualization only — not a representation of fit, size, or exact fabric.";

const UNUSABLE_MESSAGE: Record<string, string> = {
  expired: "This lookbook has expired. Ask your shop for a fresh link.",
  revoked: "This lookbook is no longer available.",
  exhausted: "You've used all the tries on this lookbook. Ask your shop for more.",
};

export default function TryLookbookPage() {
  const { lookbookToken } = useParams<{ lookbookToken: string }>();
  const token = lookbookToken || "";

  const query = useGetLookbookByToken(token, {
    query: {
      queryKey: getGetLookbookByTokenQueryKey(token),
      enabled: !!token,
    },
  });

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl px-6 py-16">
        {query.isLoading && (
          <p className="text-neutral-400">Loading your lookbook…</p>
        )}

        {query.isError && (
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">This link isn't valid.</h1>
            <p className="text-neutral-400">
              Double-check the link your shop sent, or ask them for a new one.
            </p>
          </div>
        )}

        {query.data && (
          <>
            <header className="mb-12">
              <p className="text-sm uppercase tracking-widest text-neutral-500">
                {query.data.shopName}
              </p>
              <h1 className="mt-2 text-3xl font-semibold">Your lookbook</h1>
              {query.data.usable ? (
                <p className="mt-2 text-neutral-400">
                  {query.data.remainingCredits} tries left. Choose a dress to see it on you.
                </p>
              ) : (
                <p className="mt-2 text-amber-300">
                  {UNUSABLE_MESSAGE[query.data.reason ?? ""] ??
                    "This lookbook is no longer available."}
                </p>
              )}
            </header>

            <section className="space-y-10">
              {query.data.dresses.map((dress) => (
                <article key={dress.id} className="border-b border-neutral-800 pb-8">
                  <h2 className="font-serif text-2xl">{dress.styleName}</h2>
                  <p className="mt-1 font-mono text-xs uppercase tracking-wider text-neutral-500">
                    {[dress.designer, dress.silhouette, dress.neckline]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </article>
              ))}
              {query.data.dresses.length === 0 && (
                <p className="text-neutral-400">Your shop hasn't added dresses to this lookbook yet.</p>
              )}
            </section>

            <footer className="mt-16 border-t border-neutral-800 pt-6">
              <p className="text-xs text-neutral-500">{VISUALIZATION_DISCLAIMER}</p>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
