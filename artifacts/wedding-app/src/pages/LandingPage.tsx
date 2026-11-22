import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import { StudioPage } from "@/components/layout/StudioPage";
import { toVenueSlug } from "@/lib/venueSlug";

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const [venueCode, setVenueCode] = useState("");
  const slug = toVenueSlug(venueCode);
  return (
    <StudioPage section="Venue galleries" image="evening">
      <p className="studio-label">For couples</p>
      <h1>
        A place of <em>your own.</em>
      </h1>
      <p>
        Enter the code from your venue’s invitation or QR card to begin your
        private wedding gallery.
      </p>
      <form
        className="studio-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (slug) setLocation("/preview/" + slug);
        }}
      >
        <label htmlFor="venue-code">Venue code</label>
        <input
          id="venue-code"
          value={venueCode}
          onChange={(e) => setVenueCode(e.target.value)}
          placeholder="e.g. oak-ridge-estate"
          data-testid="couple-venue-code"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className="studio-action"
          disabled={!slug}
          data-testid="couple-venue-go"
        >
          Open venue <ArrowRight size={17} />
        </button>
      </form>
      <a
        className="studio-text-link"
        href="/find-my-gallery"
        data-testid="couple-find-gallery-home"
      >
        Find an existing gallery
      </a>
    </StudioPage>
  );
}
