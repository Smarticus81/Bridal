import { useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Maximize2, X } from "lucide-react";
import "./atelier.css";

const study = [
  { label: "Bride", image: "study-subject", alt: "Full-length reference of a woman wearing a navy tee and jeans", caption: "A full-length portrait with the face, shoulders and waist in view." },
  { label: "Gown", image: "study-gown", alt: "Ivory square-neck satin gown on a dress form", caption: "The catalog front shows the square neckline, wide straps and lace sweeping down one hip." },
  { label: "Try-on", image: "study-look", alt: "Illustrative try-on of the same woman in the ivory satin gown", caption: "Compare the neckline, waist appliqué and drape with the catalog reference." },
] as const;

export default function VenueLandingPage() {
  const [selected, setSelected] = useState(2);
  const dialog = useRef<HTMLDialogElement>(null);
  const view = study[selected]!;
  return (
    <main className="atelier">
      <header className="atelier-head">
        <a className="atelier-mark" href="/" aria-label="Glimpse Bridal Studio home">glimpse<span>Bridal studio</span></a>
        <nav aria-label="Main navigation">
          <a className="atelier-nav-study" href="#sample">Sample fitting</a>
          <a href="/login">Sign in</a>
          <a className="atelier-nav-cta" href="/create-venue">For boutiques <ArrowUpRight size={15} /></a>
        </nav>
      </header>

      <section className="atelier-hero" aria-labelledby="atelier-title">
        <div className="atelier-intro">
          <p className="atelier-kicker">Virtual bridal fittings</p>
          <h1 id="atelier-title">Her dress,<br /><em>in focus.</em></h1>
          <p className="atelier-deck">Let her see herself in the gowns on your rails. Build a private lookbook around her shortlist, then bring her in for the fitting.</p>
          <a className="atelier-button" href="#sample">Explore a sample fitting <ArrowDown size={17}/></a>
        </div>
        <figure className="atelier-hero-photo">
          <img src="/brand/atelier-mikado.webp" alt="Off-the-shoulder ivory mikado gown in a sunlit atelier" width="512" height="1024" fetchPriority="high" />
          <figcaption>Mikado <i>/</i> The ballgown</figcaption>
        </figure>
        <aside className="atelier-aside">
          <img src="/brand/atelier-lace.webp" alt="Close view of floral lace at the neckline and shoulder" width="512" height="1024" />
          <span>Fabric study</span><p>Floral lace</p>
        </aside>
      </section>

      <section id="sample" className="atelier-study" aria-labelledby="study-title">
        <div className="atelier-study-copy">
          <p className="atelier-kicker">The sample fitting</p>
          <h2 id="study-title">A portrait. <br />A gown.<br /><em>One look.</em></h2>
          <p>Inspect the source photos alongside an illustrative try-on. Follow the lace from the waist to the hip and see how the satin falls.</p>
          <div className="atelier-switch" aria-label="Sample fitting views">
            {study.map((item, index) =>
              <button key={item.image} type="button" aria-pressed={index === selected} onClick={() => setSelected(index)}>
                {item.label}
              </button>)}
          </div>
          <p className="atelier-study-note">Synthetic editorial example. A fitting with your stylist confirms size, fabric and alterations.</p>
        </div>
        <figure className="atelier-view">
          <button type="button" className="atelier-enlarge" onClick={() => dialog.current?.showModal()} aria-label={`Enlarge ${view.label.toLowerCase()} photograph`}>
            <img src={`/brand/${view.image}.webp`} alt={view.alt} width="768" height="1024" loading="lazy" />
            <span><Maximize2 size={18} /></span>
          </button>
          <figcaption aria-live="polite">{view.caption}</figcaption>
        </figure>
        <dialog ref={dialog} className="atelier-lightbox" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }} aria-label={view.alt}>
          <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Close enlarged photograph"><X /></button>
          <img src={`/brand/${view.image}.webp`} alt={view.alt}/>
        </dialog>
      </section>

      <section className="atelier-boutique" aria-labelledby="boutique-title">
        <img src="/brand/atelier-column.webp" width="512" height="1024" loading="lazy" alt="Back drape of a silk column gown with a chapel train"/>
        <div>
          <p className="atelier-kicker">For bridal boutiques</p>
          <h2 id="boutique-title">From shortlist<br />to <em>fitting room.</em></h2>
          <dl>
            <dt>Curate the rail</dt><dd>Add your own gowns, with front, back and detail photography.</dd>
            <dt>Set the invitation</dt><dd>Choose the dresses, the number of try-ons and the expiry for each private lookbook.</dd>
            <dt>Arrange the fitting</dt><dd>Brides can share a favorite and ask your team to follow up about an appointment.</dd>
          </dl>
          <a href="/create-venue" className="atelier-button">Set up your boutique <ArrowRight size={17}/></a>
        </div>
      </section>
      <footer className="atelier-footer"><a href="/" className="atelier-mark">glimpse</a><nav aria-label="Footer"><a href="/couple">Venue galleries</a><a href="/login">Boutique sign in</a></nav></footer>
    </main>
  );
}
