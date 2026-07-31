import { useState } from "react";
import { useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetLookbookByToken,
  useGenerateTryonLook,
  getGetLookbookByTokenQueryKey,
  type TryDress,
  type TryonLookResponse,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";

/**
 * The bride's remote entry: /try/:lookbookToken. No account, ever. A dark
 * surface (§8 — dark where you look at images) with the shop's curated dresses.
 * Tapping a dress opens the try-on: her photo, her email, her consent, then the
 * garment-fidelity–gated look, revealed with a drape animation. The
 * visualization disclaimer appears on every look surface (invariant 5).
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

function storageImageUrl(objectKey: string, shareToken?: string): string {
  const token = shareToken ? `?shareToken=${encodeURIComponent(shareToken)}` : "";
  return `/api/storage${objectKey}${token}`;
}

function dressLine(dress: TryDress): string {
  return [dress.designer, dress.silhouette, dress.neckline].filter(Boolean).join(" · ");
}

export default function TryLookbookPage() {
  const { lookbookToken } = useParams<{ lookbookToken: string }>();
  const token = lookbookToken || "";

  const query = useGetLookbookByToken(token, {
    query: {
      queryKey: getGetLookbookByTokenQueryKey(token),
      enabled: !!token,
    },
  });

  const [activeDress, setActiveDress] = useState<TryDress | null>(null);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl px-6 py-16">
        {query.isLoading && <p className="text-neutral-400">Loading your lookbook…</p>}

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

            <section className="grid grid-cols-1 gap-8 sm:grid-cols-2">
              {query.data.dresses.map((dress) => (
                <article key={dress.id} className="group">
                  <button
                    type="button"
                    disabled={!query.data.usable}
                    onClick={() => setActiveDress(dress)}
                    className="block w-full overflow-hidden rounded-lg bg-neutral-900 text-left ring-1 ring-neutral-800 transition hover:ring-neutral-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="aspect-[3/4] w-full overflow-hidden bg-neutral-900">
                      {dress.frontImageObjectKey ? (
                        <img
                          src={storageImageUrl(dress.frontImageObjectKey)}
                          alt={dress.styleName}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-neutral-600">
                          <span className="font-serif text-lg">{dress.styleName}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h2 className="font-serif text-xl">{dress.styleName}</h2>
                      <p className="mt-1 font-mono text-xs uppercase tracking-wider text-neutral-500">
                        {dressLine(dress) || " "}
                      </p>
                      {query.data.usable && (
                        <p className="mt-3 text-sm text-neutral-300 opacity-0 transition group-hover:opacity-100">
                          See it on you →
                        </p>
                      )}
                    </div>
                  </button>
                </article>
              ))}
              {query.data.dresses.length === 0 && (
                <p className="text-neutral-400">
                  Your shop hasn't added dresses to this lookbook yet.
                </p>
              )}
            </section>

            <footer className="mt-16 border-t border-neutral-800 pt-6">
              <p className="text-xs text-neutral-500">{VISUALIZATION_DISCLAIMER}</p>
            </footer>
          </>
        )}
      </div>

      <AnimatePresence>
        {activeDress && query.data && (
          <TryOnPanel
            key={activeDress.id}
            token={token}
            dress={activeDress}
            shopSlug={query.data.shopSlug}
            uploadToken={query.data.uploadToken}
            onClose={() => setActiveDress(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

type TryOnStep = "form" | "generating" | "done" | "error";

function TryOnPanel({
  token,
  dress,
  shopSlug,
  uploadToken,
  onClose,
}: {
  token: string;
  dress: TryDress;
  shopSlug: string;
  uploadToken: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<TryOnStep>("form");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<TryonLookResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const { uploadFile, isUploading } = useUpload({
    purpose: "couple",
    venueSlug: shopSlug,
    uploadToken,
  });
  const generate = useGenerateTryonLook();

  const formReady = !!file && !!email.trim() && consent;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !email.trim() || !consent) return;
    setStep("generating");
    setErrorMessage("");
    try {
      const uploaded = await uploadFile(file);
      if (!uploaded) throw new Error("We couldn't read that photo. Try a clear, full-length one.");
      const look = await generate.mutateAsync({
        lookbookToken: token,
        data: {
          dressId: dress.id,
          bridePhotoObjectKey: uploaded.objectPath,
          brideEmail: email.trim(),
          consent: true,
        },
      });
      setResult(look);
      setStep("done");
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err instanceof Error ? err.message : "We couldn't create this look. Please try again.");
      setErrorMessage(message);
      setStep("error");
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-neutral-900 p-6 ring-1 ring-neutral-800 sm:rounded-2xl"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="font-serif text-2xl">{dress.styleName}</h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-wider text-neutral-500">
              {dressLine(dress)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-neutral-400 hover:text-neutral-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {(step === "form" || step === "generating") && (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm text-neutral-300">Your photo</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={step === "generating"}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-neutral-400 file:mr-4 file:rounded-full file:border-0 file:bg-neutral-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-neutral-900 hover:file:bg-white"
              />
              <p className="mt-2 text-xs text-neutral-500">
                A clear, full-length photo of you facing forward works best.
              </p>
            </div>

            <div>
              <label htmlFor="bride-email" className="mb-2 block text-sm text-neutral-300">
                Your email
              </label>
              <input
                id="bride-email"
                type="email"
                required
                value={email}
                disabled={step === "generating"}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-400 focus:outline-none"
              />
            </div>

            <label className="flex items-start gap-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={consent}
                disabled={step === "generating"}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1"
              />
              <span>
                I consent to my photo being used to generate this try-on visualization. I understand
                it is a visualization only.
              </span>
            </label>

            <button
              type="submit"
              disabled={!formReady || step === "generating"}
              className="w-full rounded-full bg-neutral-100 py-3 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {step === "generating"
                ? isUploading
                  ? "Uploading your photo…"
                  : "Creating your look…"
                : "See it on you"}
            </button>

            <p className="text-center text-xs text-neutral-500">{VISUALIZATION_DISCLAIMER}</p>
          </form>
        )}

        {step === "done" && result && (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-lg bg-neutral-950">
              <img
                src={storageImageUrl(result.objectKey, result.shareToken)}
                alt={`${dress.styleName} on you`}
                className="w-full"
              />
              {/* Drape reveal — a soft curtain lifting off the finished look. */}
              <motion.div
                className="pointer-events-none absolute inset-0 bg-neutral-900"
                initial={{ y: 0 }}
                animate={{ y: "-100%" }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
              />
            </div>
            {result.consultantReview && (
              <p className="rounded-md bg-amber-950/60 px-3 py-2 text-sm text-amber-200">
                Your consultant is reviewing this look to make sure it's just right.
              </p>
            )}
            <p className="text-xs text-neutral-500">{result.disclaimer}</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full border border-neutral-700 py-3 text-sm text-neutral-200 hover:border-neutral-500"
            >
              Try another dress
            </button>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4">
            <p className="rounded-md bg-red-950/60 px-3 py-3 text-sm text-red-200">
              {errorMessage}
            </p>
            <p className="text-xs text-neutral-500">
              Your credit was not used. You can try again or pick another dress.
            </p>
            <button
              type="button"
              onClick={() => setStep("form")}
              className="w-full rounded-full bg-neutral-100 py-3 text-sm font-medium text-neutral-900 hover:bg-white"
            >
              Try again
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
