import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckSquare,
  ChevronRight,
  Inbox,
  Layers3,
  LockKeyhole,
  PanelTop,
  RotateCcw,
  ScanFace,
  Square,
  Store,
} from "lucide-react";
import { AisleworkLogo } from "@/components/brand/AisleworkLogo";
import "./shop-demo.css";

const gowns = [
  {
    id: "vale",
    name: "Vale",
    sku: "JB-014",
    cut: "Box-pleat A-line",
    fabric: "Structured faille",
  },
  {
    id: "faye",
    name: "Faye",
    sku: "JB-028",
    cut: "One-shoulder column",
    fabric: "Soft crepe",
  },
] as const;
type GownId = (typeof gowns)[number]["id"];
const stations = [
  {
    title: "Gown catalog",
    icon: Layers3,
    heading: "Gown catalog",
    description:
      "Choose the styles you would pull for Maya’s first appointment.",
  },
  {
    title: "Lookbooks",
    icon: BookOpen,
    heading: "Maya’s lookbook",
    description:
      "Choose how long Maya’s private link stays open, then preview it as her.",
  },
  {
    title: "Bride’s view",
    icon: ScanFace,
    heading: "Your private fitting",
    description:
      "This is what Maya sees when she opens her boutique’s lookbook.",
  },
  {
    title: "Fitting requests",
    icon: Inbox,
    heading: "Fitting requests",
    description:
      "Back at the shop, Maya’s inquiry is ready for a stylist to follow up.",
  },
];
const picture = (id: string) => "/aislework/" + id + ".webp";

export default function ShopDemoPage() {
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [selected, setSelected] = useState<GownId[]>(["vale"]);
  const [fitting, setFitting] = useState<GownId>("vale");
  const [days, setDays] = useState("14");
  const [showOriginal, setShowOriginal] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const stage = stations[step];
  const edit = gowns.filter((g) => selected.includes(g.id));
  const sample = gowns.find((g) => g.id === fitting)!;
  function go(index: number) {
    setStep(index);
    setFurthest(Math.max(furthest, index));
  }
  useEffect(() => {
    if (previousStep.current !== step) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      previousStep.current = step;
    }
  }, [step]);
  function reset() {
    setStep(0);
    setFurthest(0);
    setSelected(["vale"]);
    setFitting("vale");
    setDays("14");
    setShowOriginal(false);
  }
  function changeSelection(id: GownId) {
    const next = selected.includes(id)
      ? selected.filter((g) => g !== id)
      : [...selected, id];
    setSelected(next);
    if (!next.includes(fitting) && next.length) setFitting(next[0]);
    setFurthest(0);
  }
  return (
    <div className="sim">
      <header className="sim-top">
        <AisleworkLogo />
        <span className="sim-mode">
          <i /> Interactive demo
        </span>
        <a href="/">
          Exit demo <ArrowUpRight size={15} />
        </a>
      </header>
      <div className="sim-shell">
        <aside className="sim-sidebar">
          <div className="sim-shop">
            <div className="shop-stamp">
              <Store size={22} />
            </div>
            <div>
              <small>Shop workspace</small>
              <b>Juniper Bridal</b>
            </div>
          </div>
          <nav aria-label="Demo workflow">
            {stations.map(({ title, icon: Icon }, i) => (
              <button
                key={title}
                disabled={i > furthest}
                aria-current={i === step ? "step" : undefined}
                onClick={() => go(i)}
              >
                <Icon size={17} />
                <span>{title}</span>
                {i === step && <ChevronRight size={13} />}
              </button>
            ))}
          </nav>
          <div className="sim-side-foot">
            <span className="shop-initials">JB</span>
            <div>
              <b>Juniper Bridal</b>
              <small>Sample shop</small>
            </div>
          </div>
        </aside>
        <main className="sim-main">
          <div className="sim-crumb">
            <span>
              <PanelTop size={14} /> Workspace <ChevronRight size={12} />{" "}
              {stage.title}
            </span>
            <button onClick={reset}>
              <RotateCcw size={14} /> Reset demo
            </button>
          </div>
          <div className="sim-intro">
            <p className="demo-eyebrow">
              {step === 2 ? "Bride’s experience" : "Consultant console"}{" "}
              <span>/ Sample data</span>
            </p>
            <h1 ref={heading} tabIndex={-1}>
              {stage.heading}
            </h1>
            <p>{stage.description}</p>
          </div>
          {step === 0 && (
            <div className="catalog-layout">
              <section className="demo-rack" aria-label="Sample gowns">
                {gowns.map((g) => {
                  const active = selected.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      aria-label={`${active ? "Remove" : "Add"} ${g.name}`}
                      aria-pressed={active}
                      className={active ? "rack-card selected" : "rack-card"}
                      onClick={() => changeSelection(g.id)}
                    >
                      <div className="rack-pic">
                        <img
                          src={picture(g.id)}
                          alt={g.cut + " wedding gown on a dress form"}
                        />
                        <span className="rack-check">
                          {active ? <Check size={15} /> : <span />}
                        </span>
                      </div>
                      <div className="rack-info">
                        <small>{g.sku}</small>
                        <h2>{g.name}</h2>
                        <p>{g.cut}</p>
                      </div>
                    </button>
                  );
                })}
              </section>
              <aside className="edit-summary">
                <BookOpen size={23} />
                <p className="demo-eyebrow">Lookbook draft</p>
                <h2>Maya’s shortlist</h2>
                <p>Select the gowns she’ll see in her private link.</p>
                <ul>
                  {edit.map((g) => (
                    <li key={g.id}>
                      <CheckSquare size={14} />
                      {g.name}
                      <span>{g.sku}</span>
                    </li>
                  ))}
                  {!edit.length && (
                    <li>
                      <Square size={14} /> No styles selected
                    </li>
                  )}
                </ul>
                <button
                  className="sim-primary"
                  disabled={!edit.length}
                  onClick={() => go(1)}
                >
                  Build lookbook <ArrowRight size={16} />
                </button>
              </aside>
            </div>
          )}
          {step === 1 && (
            <div className="book-layout">
              <section className="book-edit">
                <header>
                  <BookOpen />
                  <span>Private lookbook</span>
                </header>
                <h2>The first fitting</h2>
                <p>Prepared for Maya Patel by Juniper Bridal</p>
                <div className="book-rail">
                  {edit.map((g) => (
                    <div key={g.id}>
                      <img src={picture(g.id)} alt={g.cut} />
                      <b>{g.name}</b>
                    </div>
                  ))}
                </div>
              </section>
              <section className="book-controls">
                <p className="demo-eyebrow">Link settings</p>
                <h2>Share her edit</h2>
                <p>
                  Maya can try every gown in her edit as often as she likes while the link is open.
                </p>
                <label>
                  Link expires after
                  <select
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                  >
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                  </select>
                </label>
                <button
                  className="sim-primary"
                  onClick={() => {
                    setShowOriginal(false);
                    go(2);
                  }}
                >
                  Open bride’s view <ArrowUpRight size={16} />
                </button>
              </section>
            </div>
          )}
          {step === 2 && (
            <section className="fit-demo">
              <div className="fit-image">
                <img
                  src={picture(showOriginal ? "maya" : "maya-" + sample.id)}
                  alt={
                    showOriginal
                      ? "Maya’s sample reference photo"
                      : `Illustrative preview of Maya in the ${sample.name} gown`
                  }
                />
                <span>
                  {showOriginal ? "Reference photo" : "Example try-on"}
                </span>
              </div>
              <div className="fit-choices">
                <p className="demo-eyebrow">
                  <LockKeyhole size={13} /> Private lookbook
                </p>
                <h2>Maya’s edit</h2>
                <p>Choose a style to see a sample fitting.</p>
                <div className="style-switch">
                  {edit.map((g) => (
                    <button
                      aria-pressed={fitting === g.id}
                      key={g.id}
                      onClick={() => {
                        setFitting(g.id);
                        setShowOriginal(false);
                        setFurthest(2);
                      }}
                    >
                      <img src={picture(g.id)} alt="" />
                      <span>
                        <b>{g.name}</b>
                        <small>{g.cut}</small>
                      </span>
                      {fitting === g.id && <Check size={16} />}
                    </button>
                  ))}
                </div>
                <button
                  className="compare-button"
                  onClick={() => setShowOriginal(!showOriginal)}
                >
                  {showOriginal ? "Show example try-on" : "See reference photo"}
                </button>
                <div className="fit-window">
                  Private link · {days} days
                </div>
                <button className="sim-primary" onClick={() => go(3)}>
                  Request a fitting <ArrowRight size={16} />
                </button>
              </div>
            </section>
          )}
          {step === 3 && (
            <section className="inbox-demo">
              <div className="inbox-title">
                <Inbox size={19} />
                <h2>Consultant inbox</h2>
                <span>1 request</span>
              </div>
              <div className="inbox-record">
                <span className="person-icon">MP</span>
                <div>
                  <small>New inquiry</small>
                  <h3>Maya Patel</h3>
                  <p>maya@example.com</p>
                </div>
                <strong>Ready for follow-up</strong>
              </div>
              <div className="inbox-look">
                <img src={picture(sample.id)} alt={sample.cut} />
                <div>
                  <small>Selected in this demo</small>
                  <h3>{sample.name}</h3>
                  <p>
                    {sample.sku} · {sample.fabric}
                  </p>
                </div>
              </div>
              <div className="inbox-footer">
                <p>This example request stays in the demo.</p>
                <a className="sim-primary" href="/create-venue">
                  Get workspace <ArrowUpRight size={16} />
                </a>
              </div>
            </section>
          )}
          {step > 0 && (
            <button className="sim-back" onClick={() => go(step - 1)}>
              <ArrowLeft size={14} /> Back to{" "}
              {stations[step - 1].title.toLowerCase()}
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
