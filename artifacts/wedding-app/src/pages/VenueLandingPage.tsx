import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Check,
  ChevronRight,
  Inbox,
  Menu,
  Play,
  ScanFace,
  X,
} from "lucide-react";
import { AisleworkLogo } from "@/components/brand/AisleworkLogo";
import "./retail.css";

function SalesHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sales-header">
      <div className="aw-wrap header-inner">
        <AisleworkLogo />
        <nav
          className={open ? "sales-nav open" : "sales-nav"}
          id="sales-nav"
          aria-label="Product navigation"
          onClick={() => setOpen(false)}
        >
          <a href="#workflow">How it works</a>
          <a href="/demo">Product demo</a>
          <a href="#pricing">Pricing</a>
          <a className="mobile-signin" href="/login">
            Shop sign-in
          </a>
        </nav>
        <div className="header-actions">
          <a className="signin" href="/login">
            Sign in
          </a>
          <a className="top-action" href="/create-venue">
            Get workspace <ArrowUpRight size={15} />
          </a>
          <button
            className="menu-toggle"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="sales-nav"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}

const walkthroughSteps = [
  {
    at: 5.375,
    title: "Choose gowns",
    detail:
      "Click a gown to add it to Maya’s shortlist. Choose Build lookbook when the selection is ready.",
  },
  {
    at: 17.75,
    title: "Set limits and share",
    detail:
      "Choose how many days the link stays open and the maximum credits it can use. In the shop workspace, choose Send lookbook, then copy the private link into your message to the bride.",
  },
  {
    at: 37,
    title: "Preview a gown",
    detail:
      "Choose Open bride’s view in the demo. On a live link, the bride selects a style, adds a full-length photo and email, gives permission, and chooses See it on you. The demo provides an example photo and try-on.",
  },
  {
    at: 63.58,
    title: "Follow up on a fitting",
    detail:
      "The bride chooses Request a fitting. Open Fitting requests in your shop and use her email address to arrange an appointment.",
  },
];

function Walkthrough({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  function playStep(seconds: number) {
    const video = player.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play().catch(() => video.focus());
    video.scrollIntoView({ block: "nearest" });
  }
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="film-dialog"
      aria-label="Product walkthrough"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <div className="film-inner">
        <header>
          <span>Narrated walkthrough · 1:22</span>
          <button
            aria-label="Close walkthrough"
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            <X size={21} />
          </button>
        </header>
        <video
          ref={player}
          autoPlay
          controls
          playsInline
          preload="metadata"
          aria-label="An Aislework sample shop creates a lookbook and receives a fitting request"
          src="/aislework/shop-walkthrough.mp4?narrated=1"
        >
          <track
            kind="captions"
            src="/aislework/shop-walkthrough.en.vtt"
            srcLang="en"
            label="English"
          />
        </video>
        <details className="film-guide">
          <summary>Step-by-step instructions</summary>
          <ol>
            {walkthroughSteps.map(({ at, title, detail }) => (
              <li key={at}>
                <button
                  type="button"
                  aria-label={`Play from ${title.toLowerCase()}`}
                  onClick={() => playStep(at)}
                >
                  <span>
                    {Math.floor(at / 60)}:
                    {String(Math.floor(at % 60)).padStart(2, "0")}
                  </span>
                  {title}
                </button>
                <p>{detail}</p>
              </li>
            ))}
          </ol>
        </details>
        <a href="/demo">
          Try this workflow yourself <ArrowRight size={16} />
        </a>
      </div>
    </dialog>
  );
}

const stages = [
  {
    icon: Boxes,
    title: "Put your rack online",
    text: "Add the gowns your shop actually carries, with the photos and style details your stylists use.",
    art: "catalog",
  },
  {
    icon: BookOpen,
    title: "Give her a private edit",
    text: "Select styles for one bride. Send a private lookbook with its own expiry and try-on limit.",
    art: "edit",
  },
  {
    icon: ScanFace,
    title: "Let her try from home",
    text: "She can preview a gown on her own photo and share the look for a second opinion.",
    art: "preview",
  },
  {
    icon: Inbox,
    title: "Bring her into the shop",
    text: "Capture her fitting request so a stylist can follow up and plan an in-store appointment.",
    art: "lead",
  },
];

export default function VenueLandingPage() {
  const [brideView, setBrideView] = useState(false);
  const [film, setFilm] = useState(false);
  return (
    <div className="sales-site">
      <SalesHeader />
      <main>
        <section className="sales-hero">
          <div className="aw-wrap sales-hero-inner">
            <div className="hero-copy">
              <p className="aw-kicker">
                <span className="signal" aria-hidden="true" />
                Sales software for bridal shops
              </p>
              <h1>
                Turn interest
                <br />
                into <span>fittings.</span>
              </h1>
              <p className="hero-description">
                Put your gowns in front of brides before they visit. Share a
                private lookbook, offer virtual try-ons, and give your stylists
                a reason to follow up.
              </p>
              <div className="hero-actions">
                <a className="aw-btn lime" href="/demo">
                  Try the shop demo <ArrowUpRight size={18} />
                </a>
                <button className="film-btn" onClick={() => setFilm(true)}>
                  <Play size={14} fill="currentColor" /> Watch walkthrough
                </button>
              </div>
            </div>
            <div className="hero-visual">
              <div className="preview-frame">
                <div className="preview-toolbar">
                  <span>
                    <i />
                    Juniper Bridal
                  </span>
                  <span>Demo workspace</span>
                </div>
                <div className="preview-tabs" aria-label="Preview perspectives">
                  <button
                    aria-pressed={!brideView}
                    onClick={() => setBrideView(false)}
                  >
                    <Boxes size={14} /> Shop view
                  </button>
                  <button
                    aria-pressed={brideView}
                    onClick={() => setBrideView(true)}
                  >
                    <ScanFace size={14} /> Bride view
                  </button>
                </div>
                {brideView ? (
                  <div className="hero-fit">
                    <div>
                      <img
                        src="/aislework/maya.webp"
                        alt="Maya’s sample reference"
                      />
                      <span>Reference photo</span>
                    </div>
                    <div>
                      <img
                        src="/aislework/maya-faye.webp"
                        alt="Maya previewing the one-shoulder gown"
                      />
                      <span>Example try-on</span>
                    </div>
                  </div>
                ) : (
                  <div className="hero-shot">
                    <img
                      src="/aislework/shop-floor.webp"
                      alt="A bridal stylist and her client choosing gowns together on a tablet"
                      fetchPriority="high"
                    />
                  </div>
                )}
              </div>
              <a
                className="sample-request"
                href="/demo"
                aria-label="Explore this workflow in the shop demo"
              >
                <div className="sample-icon">
                  {brideView ? <BookOpen size={22} /> : <Inbox size={22} />}
                </div>
                <div>
                  <small>
                    {brideView ? "Private lookbook" : "Consultant inbox"}
                  </small>
                  <strong>
                    {brideView
                      ? "Maya’s fitting preview"
                      : "New fitting request"}
                  </strong>
                  <p>
                    {brideView
                      ? "Faye · JB-028"
                      : "Maya Patel · Private lookbook"}
                  </p>
                </div>
                <ArrowUpRight className="request-arrow" size={17} />
              </a>
            </div>
          </div>
        </section>
        <section className="workflow-section aw-wrap" id="workflow">
          <span id="sample" />
          <span id="collection" />
          <div className="section-intro">
            <div>
              <p className="aw-kicker violet">The sales workflow</p>
              <h2>
                From the rack to <br />
                the fitting room.
              </h2>
            </div>
            <a className="inline-link" href="/demo">
              Explore the product <ArrowUpRight size={17} />
            </a>
          </div>
          <div className="steps-grid">
            {stages.map(({ icon: Icon, title, text, art }, i) => (
              <article key={title} className="step-item">
                <div className={`step-art ${art}`} aria-hidden="true">
                  {i === 0 ? (
                    <div className="tiny-rack">
                      {["vale", "faye", "linden"].map((x) => (
                        <img
                          key={x}
                          loading="lazy"
                          src={`/aislework/${x}.webp`}
                          alt=""
                        />
                      ))}
                    </div>
                  ) : i === 1 ? (
                    <div className="mini-edit">
                      <BookOpen size={19} />
                      <b>Maya’s lookbook</b>
                      <span>
                        2 styles <i /> Private link
                      </span>
                    </div>
                  ) : i === 2 ? (
                    <div className="tiny-preview">
                      <img loading="lazy" src="/aislework/maya.webp" alt="" />
                      <ChevronRight size={14} />
                      <img
                        loading="lazy"
                        src="/aislework/maya-faye.webp"
                        alt=""
                      />
                    </div>
                  ) : (
                    <div className="mini-inbox">
                      <span>
                        <Inbox size={15} /> Fitting requests
                      </span>
                      <b>
                        <i>MP</i> Maya Patel <Check size={13} />
                      </b>
                    </div>
                  )}
                </div>
                <div className="step-title">
                  <Icon size={17} />
                  <h3>{title}</h3>
                </div>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="pricing" id="pricing">
          <div className="aw-wrap">
            <div className="section-intro">
              <div>
                <p className="aw-kicker violet">Shop pricing</p>
                <h2>Plan for your floor.</h2>
              </div>
              <p>
                One delivered fitting uses one credit.
                <br />
                Your locations share a balance.
              </p>
            </div>
            <div className="price-table">
              {[
                ["Starter", "25 credits per month", "149", "/ month"],
                ["Growth", "100 credits per month", "399", "/ month"],
                ["Credit pack", "10 additional credits", "49", "one time"],
              ].map(([name, detail, price, period]) => (
                <div className="price-row" key={name}>
                  <h3>{name}</h3>
                  <p>{detail}</p>
                  <div>
                    <strong>${price}</strong>
                    <span>{period}</span>
                  </div>
                </div>
              ))}
            </div>
            <small>All prices in USD.</small>
          </div>
        </section>
        <section className="demo-banner">
          <div className="aw-wrap">
            <ArrowDownRight className="banner-arrow" aria-hidden="true" />
            <div>
              <p className="aw-kicker">Inside the product</p>
              <h2>Run the shop demo.</h2>
            </div>
            <a className="aw-btn ink" href="/demo">
              Open demo workspace <ArrowRight size={18} />
            </a>
          </div>
        </section>
      </main>
      <footer className="sales-footer">
        <div className="aw-wrap">
          <AisleworkLogo />
          <nav aria-label="Footer">
            <a href="/login">Shop sign-in</a>
            <a href="/couple">Venue galleries</a>
          </nav>
        </div>
      </footer>
      {film && <Walkthrough onClose={() => setFilm(false)} />}
    </div>
  );
}
