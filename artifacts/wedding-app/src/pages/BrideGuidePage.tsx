import { useEffect } from "react";
import { useCopyMessage } from "@/hooks/use-copy-message";
import { Play, Copy } from "lucide-react";
import { StudioMasthead } from "@/components/layout/StudioPage";
import "./bride-guides.css";

const lessons = [
  {
    id: "first-try-on",
    title: "Make your first try-on",
    intro: "Start with the private lookbook your stylist sent you.",
    steps: [
      "Open your invitation and tap a gown.",
      "Take a head-to-toe photo in even light. Face the camera, stand alone, and leave a little space between your arms and waist.",
      "Choose your photo and enter your email. Read the consent statement, then check the box if you agree.",
      "Tap See it on you and leave the page open for your preview.",
    ],
  },
  {
    id: "next-dress",
    title: "Try more gowns and request a fitting",
    intro: "Start from a finished preview in your lookbook.",
    steps: [
      "Tap Try another dress and select a different gown. Your photo and email stay filled in while this lookbook is open.",
      "Keep or change your photo, confirm permission for this gown, and tap See it on you again.",
      "To get a second opinion, tap Share with your people and paste the copied link into a message.",
      "Tap Request a fitting and look for Fitting request sent. Your stylist can then email you to arrange a time.",
    ],
  },
];

export default function BrideGuidePage() {
  const copyMessage = useCopyMessage();
  useEffect(() => {
    const previous = document.title;
    document.title = "Your virtual fitting guide | Aislework";
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    return () => {
      document.title = previous;
    };
  }, []);
  return (
    <div className="bride-guides">
      <StudioMasthead section="Bride guides" />
      <main>
        <header className="bride-guide-intro">
          <p className="studio-label">From your bridal boutique</p>
          <h1>Your virtual fitting guide</h1>
          <p>
            Watch how to preview a gown on your photo, explore more styles, and
            ask your stylist for an in-store fitting. Use the private link from
            your boutique to try your own gowns.
          </p>
          <button
            className="bride-copy"
            type="button"
            onClick={() =>
              copyMessage(new URL("/bride-guide", window.location.origin).href)
            }
          >
            <Copy size={15} /> Copy guide link
          </button>
        </header>
        <div className="bride-lessons">
          {lessons.map(({ id, title, intro, steps }) => (
            <section key={id} id={id} aria-labelledby={id + "-title"}>
              <h2 id={id + "-title"}>{title}</h2>
              <p>{intro}</p>
              <video
                controls
                playsInline
                preload="none"
                poster={`/aislework/${id}.webp`}
                aria-label={title}
                src={`/aislework/${id}.mp4`}
                onPlay={(event) => {
                  for (const other of document.querySelectorAll<HTMLVideoElement>(
                    ".bride-lessons video",
                  ))
                    if (other !== event.currentTarget) other.pause();
                }}
              >
                <track
                  kind="captions"
                  srcLang="en"
                  label="English"
                  src={`/aislework/${id}.en.vtt`}
                />
              </video>
              <details>
                <summary>Read the steps</summary>
                <ol>
                  {steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
              <a href={`/aislework/${id}.mp4`}>
                <Play size={13} /> Open video on its own
              </a>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
