import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { SignedIn, SignedOut, SignUp, useUser } from "@clerk/clerk-react";
import { ArrowRight, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { toVenueSlug } from "@/lib/venueSlug";
import { StudioPage } from "@/components/layout/StudioPage";
import { ClerkSetupNotice, ClerkWidgetFrame, OrgGate } from "@/components/auth/OrgGate";
import { clerkConfigured, studioAppearance } from "@/lib/clerk";

/**
 * Onboarding: sign up (Clerk profile) → name the organization (billing
 * tenant, handled by OrgGate) → add the first venue. Existing members land
 * straight on the venue form and can add more venues to the same org.
 */
export default function CreateVenuePage() {
  if (!clerkConfigured) return <ClerkSetupNotice />;

  return (
    <StudioPage section="Boutique registration">
        <ClerkWidgetFrame>
          <SignedOut>
            <div className="relative z-10 mt-10 flex flex-col items-center gap-6">
              <div className="text-center max-w-md">
                <p className="mono-label mb-3 text-rose">For boutiques</p>
                <h1 className="font-display text-3xl font-medium tracking-tight">
                  Create your profile
                </h1>
                <p className="mt-2 text-muted-foreground font-light">
                  Then name your organization — it owns billing, credits, and every
                  boutique you add.
                </p>
              </div>
              <SignUp
                appearance={studioAppearance}
                routing="hash"
                signInUrl="/login"
                forceRedirectUrl="/create-venue"
              />
            </div>
          </SignedOut>

          <SignedIn>
            <OrgGate>
              <VenueForm />
            </OrgGate>
          </SignedIn>
        </ClerkWidgetFrame>
    </StudioPage>
  );
}

function VenueForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    bookingUrl: "",
  });

  const ownerEmail =
    user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ?? "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = toVenueSlug(formData.name);

    if (!slug) {
      toast({ title: "Boutique name required", variant: "destructive" });
      return;
    }
    if (!ownerEmail) {
      toast({ title: "Your profile has no email address", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          slug,
          ownerEmail,
          contactEmail: ownerEmail,
          bookingUrl: formData.bookingUrl.trim() || undefined,
          tagline: "Explore your bridal shortlist before your fitting.",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create venue.");
      toast({
        title: "Boutique created",
        description: "Your gown catalog is ready.",
      });
      setLocation("/catalog");
    } catch (err) {
      toast({
        title: "Creation failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md mt-10"
    >
      <div className="relative bg-card p-8">


        <div className="mb-8">
          <p className="mono-label mb-4 text-rose">For boutiques</p>
          <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">
            Add a venue
          </h1>
          <p className="mt-2 text-muted-foreground font-light">
            It joins your organization — billing and credits stay shared across
            your boutique locations.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="venue-name" className="mono-label text-muted-foreground">Boutique name</Label>
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="venue-name"
                required
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="h-12 pl-11 rounded-none border-input bg-background focus-visible:ring-ring"
                placeholder="The Willow House"
                data-testid="venue-name-input"
                autoComplete="organization"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="booking-url" className="mono-label text-muted-foreground">Fitting booking link <span className="text-muted-foreground font-normal normal-case">(optional)</span></Label>
            <Input
              id="booking-url"
              value={formData.bookingUrl}
              onChange={(e) => setFormData((prev) => ({ ...prev, bookingUrl: e.target.value }))}
              className="h-12 rounded-none border-input bg-background focus-visible:ring-ring"
              placeholder="https://yourboutique.com/fittings"
              data-testid="venue-booking-url-input"
              autoComplete="url"
            />
          </div>

          <div className="border-l-2 border-rose/40 pl-4 text-sm font-light leading-relaxed text-muted-foreground">
            Notifications and inquiry replies go to{" "}
            <span className="text-foreground">{ownerEmail || "your profile email"}</span>.
            You can change the public contact email later in the dashboard.
          </div>

          <Button
            type="submit"
            variant="rose"
            disabled={isSubmitting}
            className="w-full h-12 rounded-none font-medium mt-4"
            data-testid="create-venue-submit"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enter dashboard <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => setLocation("/dashboard")}
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            data-testid="venue-existing-login"
          >
            Back to your dashboard
          </button>
        </div>
      </div>
    </motion.div>
  );
}
