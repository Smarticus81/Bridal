import { StudioPage } from "@/components/layout/StudioPage";
export default function NotFound() {
  return (
    <StudioPage section="Page not found" image="column">
      <p className="studio-label">404</p>
      <h1>
        A missing <em>page.</em>
      </h1>
      <p>
        This address may have changed. Return to the collection or find your
        private gallery.
      </p>
      <a className="studio-action" href="/" data-testid="notfound-home">
        Back to the collection ↗
      </a>
      <a
        className="studio-text-link"
        href="/find-my-gallery"
        data-testid="notfound-find-gallery"
      >
        Find my gallery
      </a>
      <a
        className="studio-text-link"
        href="/create-venue"
        data-testid="notfound-venues"
      >
        Boutique registration
      </a>
    </StudioPage>
  );
}
