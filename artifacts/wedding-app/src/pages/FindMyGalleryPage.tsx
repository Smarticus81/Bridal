import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail } from "lucide-react";
import { requestRecoveryEmail } from "@/lib/savedSessions";
import { StudioPage } from "@/components/layout/StudioPage";

export default function FindMyGalleryPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const result = await requestRecoveryEmail(trimmed);
      if (result.error) {
        setError(result.error);
        setSubmitted(false);
      } else {
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <StudioPage section="Gallery recovery" image="evening">
      {submitted ? (
        <div className="space-y-6">
          <div>
            <p className="mono-label mb-4 text-emerald-800">Link sent</p>
            <h2 className="font-display text-3xl font-medium text-foreground mb-4">
              Check your inbox
            </h2>
            <p className="text-muted-foreground font-light leading-relaxed mb-6">
              If a wedding gallery exists for{" "}
              <span className="text-foreground font-medium">{email}</span>, we
              just sent you an email with one-tap links to your gallery. For
              your privacy we never confirm whether an email is on file.
            </p>
            <p className="text-xs text-muted-foreground font-light leading-relaxed">
              Didn't get it? Check spam. You can also try again in a few minutes
              - we rate-limit recovery requests to protect everyone's inbox.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setEmail("");
            }}
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            data-testid="find-gallery-reset"
          >
            Try another address
          </button>
        </div>
      ) : (
        <>
          <p className="mono-label mb-4 text-rose">For couples</p>
          <h1 className="font-display text-3xl font-medium tracking-tight text-foreground mb-4">
            Find my gallery
          </h1>

          <p className="text-muted-foreground font-light leading-relaxed mb-4 text-sm">
            Enter the email you used at the venue kiosk. We'll email you one-tap
            links to any wedding galleries we have on file.
          </p>
          <p className="text-xs text-muted-foreground font-light leading-relaxed mb-8">
            We never display a list of sessions in the browser; your galleries
            only appear in the email we send.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="email"
                aria-label="Email address"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-14 pl-12 rounded-none bg-background border-input text-base focus-visible:ring-ring"
                data-testid="find-gallery-email"
                required
                autoComplete="email"
              />
            </div>
            <Button
              type="submit"
              variant="rose"
              disabled={loading || !email.trim()}
              className="w-full h-14 rounded-none font-medium"
              data-testid="find-gallery-submit"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Send Me My Links"
              )}
            </Button>
          </form>

          {error && (
            <p
              className="mono-label mt-4 normal-case tracking-normal text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
        </>
      )}
    </StudioPage>
  );
}
