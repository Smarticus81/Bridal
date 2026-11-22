import { StudioMasthead } from "@/components/layout/StudioPage";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetLookbookByToken,
  useStartTryonJob,
  useCreateLead,
  useGetSessionByToken,
  getGetSessionByTokenQueryKey,
  useForgetTryonLook,
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

  const storageKey = `bridal:job:${token}`;
  const [lastJob, setLastJob] = useState(() => { try { return sessionStorage.getItem(storageKey) || ""; } catch { return ""; } });
  const remember = (shareToken: string) => {
    setLastJob(shareToken);
    try { sessionStorage.setItem(storageKey, shareToken); } catch { /* Private browsing */ }
  };
  const [activeDress, setActiveDress] = useState<TryDress | null>(null);

  return (
    <main className="fitting-house min-h-screen bg-background text-foreground">
      <StudioMasthead section="Private fitting"/>
      <div className="mx-auto max-w-4xl px-6 py-16">
        {query.isLoading && <p className="text-muted-foreground">Loading your lookbook…</p>}

        {query.isError && (
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">This link isn't valid.</h1>
            <p className="text-muted-foreground">
              Double-check the link your shop sent, or ask them for a new one.
            </p>
          </div>
        )}

        {query.data && (
          <>
            <header className="invitation-heading"><div>
              <p className="text-sm uppercase tracking-widest text-muted-foreground">
                {query.data.shopName}
              </p>
              <h1 className="mt-3 font-display text-5xl leading-tight">Your private fitting.</h1>
              {query.data.usable ? (
                <p className="mt-2 text-muted-foreground">
                  {query.data.remainingCredits} tries left. Choose a dress to see it on you.
                </p>
              ) : (
                <p className="mt-2 text-amber-800">
                  {UNUSABLE_MESSAGE[query.data.reason ?? ""] ??
                    "This lookbook is no longer available."}
                </p>
              )}
              </div>
              <div className="invitation-count"><strong>{query.data.dresses.length}</strong><span>{query.data.dresses.length === 1 ? "selected gown" : "selected gowns"}</span></div>
            </header>

            {lastJob && <a className="mb-8 inline-block rounded-none border border-neutral-600 px-5 py-3 text-sm" href={`/look/${lastJob}`}>Open your latest fitting →</a>}
            <section className="invitation-rail grid grid-cols-1 gap-8 sm:grid-cols-2">
              {query.data.dresses.map((dress) => (
                <article key={dress.id} className="group">
                  <button
                    type="button"
                    disabled={!query.data.usable || !dress.frontImageObjectKey}
                    onClick={() => setActiveDress(dress)}
                    className="block w-full overflow-hidden rounded-sm bg-card text-left ring-1 ring-border transition hover:ring-neutral-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="aspect-[3/4] w-full overflow-hidden bg-card">
                      {dress.frontImageObjectKey ? (
                        <img
                          src={storageImageUrl(dress.frontImageObjectKey)}
                          alt={dress.styleName}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <span className="font-serif text-lg">{dress.styleName}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h2 className="font-serif text-xl">{dress.styleName}</h2>
                      <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        {dressLine(dress) || " "}
                      </p>
                      {query.data.usable && (
                        <p className="mt-3 text-sm text-muted-foreground transition group-hover:underline">
                          See it on you →
                        </p>
                      )}
                    </div>
                  </button>
                </article>
              ))}
              {query.data.dresses.length === 0 && (
                <p className="text-muted-foreground">
                  Your shop hasn't added dresses to this lookbook yet.
                </p>
              )}
            </section>

            <footer className="mt-16 border-t border-neutral-800 pt-6">
              <p className="text-xs text-muted-foreground">{VISUALIZATION_DISCLAIMER}</p>
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
            remember={remember}
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
  remember,
  onClose,
}: {
  token: string;
  dress: TryDress;
  shopSlug: string;
  uploadToken: string;
  remember: (token: string) => void;
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
  const startJob = useStartTryonJob();
  const [jobToken, setJobToken] = useState("");
  const queryClient = useQueryClient();
  const lead = useCreateLead();
  const busy = useRef(false);
  const job = useGetSessionByToken(jobToken, {
    query: {
      queryKey: getGetSessionByTokenQueryKey(jobToken), enabled: Boolean(jobToken),
      refetchInterval: q => ["ready", "failed"].includes(q.state.data?.status ?? "") ? false : 3000,
    },
  });
  useEffect(() => {
    const data = job.data;
    if (!data) return;
    if (data.status === "failed") {
      setErrorMessage(data.errorMessage || "Your look could not be delivered.");
      setStep("error");
    }
    if (data.status === "ready" && data.generatedAssets[0]) {
      setResult({ shareToken: jobToken, objectKey: data.generatedAssets[0].objectKey, disclaimer: VISUALIZATION_DISCLAIMER, consultantReview: false });
      setStep("done");
    }
  }, [job.data, jobToken]);
  const forget = useForgetTryonLook();
  const [forgotten, setForgotten] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const shareWithPeople = async () => {
    if (!result) return;
    const url = `${window.location.origin}/look/${result.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
    } catch {
      // Clipboard blocked — fall back to a prompt so the link is still reachable.
      window.prompt("Copy your share link:", url);
    }
  };

  const forgetLook = async () => {
    if (!result) return;
    try {
      await forget.mutateAsync({ shareToken: result.shareToken });
      setForgotten(true);
    } catch {
      // Non-fatal: leave the look on screen; the bride can retry the deletion.
    }
  };

  const formReady = !!file && !!email.trim() && consent;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !email.trim() || !consent || busy.current) return;
    busy.current = true;
    setJobToken("");
    setStep("generating");
    setErrorMessage("");
    try {
      const uploaded = await uploadFile(file);
      if (!uploaded) throw new Error("We couldn't read that photo. Try a clear, full-length one.");
      const accepted = await startJob.mutateAsync({
        lookbookToken: token,
        data: {
          dressId: dress.id,
          bridePhotoObjectKey: uploaded.objectPath,
          brideEmail: email.trim(),
          consent: true,
        },
      });
      remember(accepted.shareToken);
      setJobToken(accepted.shareToken);
      void queryClient.invalidateQueries({ queryKey: getGetLookbookByTokenQueryKey(token) });
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err instanceof Error ? err.message : "We couldn't create this look. Please try again.");
      setErrorMessage(message);
      setStep("error");
    } finally {
      busy.current = false;
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => { if (step !== "generating" || jobToken) onClose(); }}
    >
      <motion.div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-6 ring-1 ring-border sm:rounded-sm"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="font-serif text-2xl">{dress.styleName}</h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {dressLine(dress)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={step === "generating" && !jobToken}
            className="rounded-none p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {(step === "form" || step === "generating") && (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="bride-photo" className="mb-2 block text-sm text-muted-foreground">Your full-length photo</label>
              <input
                id="bride-photo" type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={step === "generating"}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-none file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Stand alone in even light, facing the camera with your arms clear of your waist. Include your head and feet.
              </p>
            </div>

            <div>
              <label htmlFor="bride-email" className="mb-2 block text-sm text-muted-foreground">
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
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-neutral-400 focus:outline-none"
              />
            </div>

            <label className="flex items-start gap-3 text-sm text-muted-foreground">
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
              className="w-full rounded-none bg-primary py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {step === "generating"
                ? isUploading
                  ? "Uploading your photo…"
                  : "Creating your look…"
                : "See it on you"}
            </button>

            {jobToken && <p role="status" className="text-sm text-muted-foreground">Your fitting is in progress. <a className="underline" href={`/look/${jobToken}`}>Open its private status page</a> to come back later.</p>}
            <p className="text-center text-xs text-muted-foreground">{VISUALIZATION_DISCLAIMER}</p>
          </form>
        )}

        {step === "done" && result && forgotten && (
          <div className="space-y-4 py-6 text-center">
            <p className="text-lg">Your try-on has been deleted.</p>
            <p className="text-sm text-muted-foreground">
              The fitting image and its source photo have been removed.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-none border border-input py-3 text-sm text-foreground hover:border-neutral-500"
            >
              Try another dress
            </button>
          </div>
        )}

        {step === "done" && result && !forgotten && (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-sm bg-background">
              <img
                src={storageImageUrl(result.objectKey, result.shareToken)}
                alt={`${dress.styleName} on you`}
                className="w-full"
              />
              {/* Drape reveal — a soft curtain lifting off the finished look. */}
              <motion.div
                className="pointer-events-none absolute inset-0 bg-card"
                initial={{ y: 0 }}
                animate={{ y: "-100%" }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
            <div className="rounded-sm border border-input p-4">
              <h3 className="font-display text-xl">Try it in the boutique</h3>
              <p className="mt-1 text-sm text-muted-foreground">Ask your stylist to email you about an in-person fitting.</p>
              <button type="button" disabled={lead.isPending || lead.isSuccess}
                onClick={() => lead.mutate({ data: { lookbookToken: token, email: email.trim() } })}
                className="mt-3 underline underline-offset-4">
                {lead.isSuccess ? "Fitting request sent" : lead.isPending ? "Sending…" : "Request a fitting"}
              </button>
              {lead.isError && <p role="alert" className="text-sm">Your request could not be sent. Please try again.</p>}
            </div>
            <button
              type="button"
              onClick={shareWithPeople}
              className="w-full rounded-none bg-primary py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              {shareCopied ? "Link copied — share it with your people" : "Share with your people"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-none border border-input py-3 text-sm text-foreground hover:border-neutral-500"
            >
              Try another dress
            </button>
            <button
              type="button"
              onClick={forgetLook}
              disabled={forget.isPending}
              className="w-full py-2 text-center text-xs text-muted-foreground underline hover:text-muted-foreground disabled:opacity-50"
            >
              {forget.isPending ? "Deleting…" : "Delete my try-on and photo"}
            </button>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4">
            <p className="rounded-md bg-red-100 px-3 py-3 text-sm text-red-900">
              {errorMessage}
            </p>
            <p className="text-xs text-muted-foreground">
              Check the message above before starting another fitting.
            </p>
            <button
              type="button"
              onClick={() => setStep("form")}
              className="w-full rounded-none bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
