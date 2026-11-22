import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronsLeftRight,
  Menu,
  Play,
  Plus,
  X,
} from "lucide-react";
import { GlimpseLogo } from "@/components/brand/GlimpseLogo";
import "./campaign.css";

const looks = [
  {
    name: "The sculpted ballgown",
    fabric: "Silk mikado",
    src: "mikado",
    alt: "Off-the-shoulder ivory ballgown with a sculpted bodice, photographed in profile",
    note: "Wide folds frame the shoulders. A fitted waist opens into a full skirt, giving the mikado room to hold its shape.",
  },
  {
    name: "The lace sheath",
    fabric: "Botanical lace",
    src: "lace",
    alt: "Long-sleeved floral lace gown on a seated model in a stone alcove",
    note: "Botanical lace follows the line of the body. Look closely at the sleeves, where the motif opens against the skin.",
  },
  {
    name: "The open-back column",
    fabric: "Silk satin",
    src: "column",
    alt: "An open-back silk column gown with a draped bow and long train",
    note: "A softly draped back leads into a sweeping train. The satin changes from ivory to gold as it moves through the light.",
  },
];
const fitting = [
  {
    name: "Portrait",
    src: "portrait",
    alt: "The sample client standing in a black top and jeans",
    note: "The starting portrait",
  },
  {
    name: "Gown",
    src: "dress",
    alt: "The ruched square-neck gown on a tailor’s form",
    note: "The boutique’s reference",
  },
  {
    name: "Fitting",
    src: "fitting",
    alt: "Illustrative fitting of the same client in the square-neck gown",
    note: "The illustrated look",
  },
];
const image = (name: string) => "/campaign/" + name + ".webp";
type Overlay = "film" | "look" | "sample" | "menu" | null;

export default function VenueLandingPage() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [look, setLook] = useState(0);
  const [sample, setSample] = useState<number | null>(null);
  const [reveal, setReveal] = useState(50);
  const dialog = useRef<HTMLDialogElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [railIndex, setRailIndex] = useState(0);
  const active = looks[look]!;
  const view = fitting[sample ?? 2]!;
  useEffect(() => {
    const section = window.location.hash.slice(1);
    if (section) document.getElementById(section)?.scrollIntoView();
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element || !overlay) return;
    const opener = document.activeElement;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previous;
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [overlay]);
  function moveRail(delta: number) {
    const index = Math.max(0, Math.min(looks.length - 1, railIndex + delta));
    const card = rail.current?.children[index] as HTMLElement | undefined;
    rail.current?.scrollTo({
      left: card ? card.offsetLeft - rail.current.offsetLeft : 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  const close = () => setOverlay(null);
  return (
    <div className="campaign">
      <a className="campaign-skip" href="#collection">
        Skip to the collection
      </a>
      <section className="cover" aria-labelledby="cover-title">
        <picture className="cover-image">
          <source media="(max-width: 660px)" srcSet={image("cover-mobile")} />
          <img
            src={image("cover")}
            alt="An ivory mikado gown and windblown veil in a sunlit limestone courtyard"
            fetchPriority="high"
            width="1672"
            height="941"
          />
        </picture>
        <header className="cover-nav">
          <GlimpseLogo />
          <nav aria-label="Main navigation">
            <a href="#collection">The collection</a>
            <a href="#sample">Virtual fitting</a>
            <a href="#boutiques">For boutiques</a>
          </nav>
          <a className="cover-access" href="/login">
            Studio sign in <ArrowUpRight size={15} />
          </a>
          <button
            className="cover-menu"
            aria-label="Open navigation"
            onClick={() => setOverlay("menu")}
          >
            <Menu size={23} />
          </button>
        </header>
        <div className="cover-copy">
          <p className="eyeline">
            <span />
            Virtual bridal atelier
          </p>
          <h1 id="cover-title">
            Before
            <br />
            <em>the aisle.</em>
          </h1>
          <p className="cover-intro">
            Discover the silhouette. See it on you.
            <br />A private bridal fitting, wherever you are.
          </p>
          <a className="campaign-cta pale" href="#collection">
            Explore the collection <ArrowDown size={16} />
          </a>
        </div>
        <button
          className="cover-film"
          onClick={() => setOverlay("film")}
          aria-label="Play Before the Aisle campaign film"
        >
          <span className="film-play">
            <Play size={14} fill="currentColor" strokeWidth={1} />
          </span>
          <span>
            <small>Campaign film</small>
            <strong>Watch the film</strong>
          </span>
          <span className="film-duration">0:11</span>
        </button>
      </section>
      <main>
        <section
          className="collection section-pad"
          id="collection"
          aria-labelledby="collection-title"
        >
          <div className="collection-heading">
            <div>
              <p className="eyeline">
                <span />
                The lookbook
              </p>
              <h2 id="collection-title">
                The silhouette <em>edit.</em>
              </h2>
            </div>
            <p>
              Three ways to wear ivory. Open a look for a closer study of its
              cut, cloth, and movement.
            </p>
          </div>
          <div
            className="look-rail"
            ref={rail}
            onScroll={(e) => {
              const target = e.currentTarget;
              const width =
                (target.children[1] as HTMLElement).offsetLeft -
                (target.children[0] as HTMLElement).offsetLeft;
              if (width)
                setRailIndex(
                  Math.min(
                    looks.length - 1,
                    Math.round(target.scrollLeft / width),
                  ),
                );
            }}
          >
            {looks.map((item, i) => (
              <button
                className="look-card"
                key={item.src}
                onClick={() => {
                  setLook(i);
                  setOverlay("look");
                }}
              >
                <span className="look-image">
                  <img
                    src={image(item.src)}
                    alt={item.alt}
                    width="590"
                    height="887"
                    loading="lazy"
                  />
                  <span className="look-open">
                    <Plus size={19} />
                  </span>
                </span>
                <span className="look-caption">
                  <small>{item.fabric}</small>
                  <strong>{item.name}</strong>
                </span>
              </button>
            ))}
          </div>
          <div className="rail-tools">
            <span>
              {railIndex + 1} / {looks.length}
            </span>
            <button
              aria-label="Previous silhouette"
              disabled={railIndex === 0}
              onClick={() => moveRail(-1)}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              aria-label="Next silhouette"
              disabled={railIndex === looks.length - 1}
              onClick={() => moveRail(1)}
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
        <section
          id="sample"
          className="sample-section section-pad"
          aria-labelledby="sample-title"
        >
          <div className="sample-copy">
            <p className="eyeline">
              <span />
              Private fitting room
            </p>
            <h2 id="sample-title">
              In your own
              <br />
              <em>reflection.</em>
            </h2>
            <p>
              See how a boutique’s gown translates from the dress form to a
              portrait. Slide across the portrait to reveal the fitted look, or
              inspect the gown on its own.
            </p>
            <div className="sample-controls" aria-label="Sample fitting views">
              <button
                aria-pressed={sample === null}
                onClick={() => setSample(null)}
              >
                Compare
              </button>
              {fitting.map((item, i) => (
                <button
                  key={item.src}
                  aria-pressed={sample === i}
                  onClick={() => setSample(i)}
                >
                  {item.name}
                </button>
              ))}
            </div>
            <small className="sample-note">
              Illustrative fitting using synthetic images. Your stylist confirms
              fit, fabric, and alterations in person.
            </small>
          </div>
          <figure className="sample-figure">
            {sample === null ? (
              <div className="comparison">
                <img
                  src={image("fitting")}
                  loading="lazy"
                  alt={fitting[2]!.alt}
                />
                <div
                  className="comparison-before"
                  style={{ clipPath: "inset(0 " + (100 - reveal) + "% 0 0)" }}
                >
                  <img
                    src={image("portrait")}
                    loading="lazy"
                    alt={fitting[0]!.alt}
                  />
                </div>
                <div className="comparison-labels" aria-hidden="true">
                  <span>Portrait</span>
                  <span>Fitting</span>
                </div>
                <div
                  className="comparison-line"
                  style={{ left: reveal + "%" }}
                  aria-hidden="true"
                >
                  <span>
                    <ChevronsLeftRight size={20} />
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={reveal}
                  aria-label="Compare portrait and fitting"
                  aria-valuetext={reveal + " percent portrait"}
                  onChange={(e) => setReveal(Number(e.target.value))}
                />
              </div>
            ) : (
              <button
                onClick={() => setOverlay("sample")}
                aria-label={
                  "Enlarge " + view.name.toLowerCase() + " photograph"
                }
              >
                <img
                  key={view.src}
                  loading="lazy"
                  src={image(view.src)}
                  alt={view.alt}
                  width="510"
                  height="1024"
                />
                <span className="look-open">
                  <Plus size={20} />
                </span>
              </button>
            )}
            <figcaption aria-live="polite">
              {sample === null ? "Portrait and illustrated fitting" : view.note}
            </figcaption>
          </figure>
        </section>
        <section id="boutiques" className="boutique-section section-pad">
          <p className="eyeline">
            <span />
            For boutiques
          </p>
          <div>
            <h2>
              Your rail.
              <br />
              <em>Her shortlist.</em>
            </h2>
            <p>
              Curate a private edit of your gowns, invite a bride to try her
              favorites, and bring her shortlist into the fitting room.
            </p>
            <a href="/create-venue" className="campaign-cta ink">
              Open your studio <ArrowUpRight size={17} />
            </a>
          </div>
        </section>
      </main>
      <footer className="campaign-footer">
        <GlimpseLogo />
        <nav aria-label="Footer">
          <a href="#collection">Collection</a>
          <a href="/couple">Venue galleries</a>
          <a href="/login">
            Studio sign in <ArrowUpRight size={13} />
          </a>
        </nav>
      </footer>
      {overlay && (
        <dialog
          ref={dialog}
          className={"campaign-modal mode-" + overlay}
          aria-label={
            overlay === "film"
              ? "Before the aisle campaign film"
              : overlay === "menu"
                ? "Site navigation"
                : overlay === "look"
                  ? active.name
                  : view.alt
          }
          onCancel={close}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="modal-inner">
            <button
              className="modal-close"
              onClick={close}
              autoFocus
              aria-label="Close dialog"
            >
              <X size={21} />
            </button>
            {overlay === "menu" && (
              <nav aria-label="Mobile navigation">
                {[
                  ["#collection", "The collection"],
                  ["#sample", "Virtual fitting"],
                  ["#boutiques", "For boutiques"],
                  ["/login", "Studio sign in"],
                ].map(([url, label]) => (
                  <a key={url} href={url} onClick={close}>
                    {label}
                    <ArrowUpRight size={22} />
                  </a>
                ))}
              </nav>
            )}
            {overlay === "film" && (
              <>
                <video
                  controls
                  autoPlay
                  muted
                  playsInline
                  preload="metadata"
                  poster={image("film")}
                  aria-label="Silent fashion film moving from an ivory gown to a mountain wedding altar"
                  src="/campaign/before-the-aisle.mp4"
                />
                <p className="film-credit">
                  Before the aisle{" "}
                  <span>Campaign film · 11 seconds · Silent</span>
                </p>
              </>
            )}
            {overlay === "look" && (
              <>
                <img src={image(active.src)} alt={active.alt} />
                <div className="modal-look-copy">
                  <p className="eyeline">
                    <span />
                    {active.fabric}
                  </p>
                  <h2>{active.name}</h2>
                  <p>{active.note}</p>
                  <div className="look-paging">
                    <button
                      aria-label="Previous look"
                      onClick={() =>
                        setLook((look + looks.length - 1) % looks.length)
                      }
                    >
                      <ArrowLeft />
                    </button>
                    <span aria-live="polite">
                      {look + 1} / {looks.length}
                    </span>
                    <button
                      aria-label="Next look"
                      onClick={() => setLook((look + 1) % looks.length)}
                    >
                      <ArrowRight />
                    </button>
                  </div>
                </div>
              </>
            )}
            {overlay === "sample" && (
              <img src={image(view.src)} alt={view.alt} />
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}
