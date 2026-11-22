import type { ReactNode } from "react";
import { GlimpseLogo } from "@/components/brand/GlimpseLogo";

type StudioPageProps = {
  children: ReactNode;
  image?: "mikado" | "column" | "lace" | "evening";
  section: string;
};

export function StudioMasthead({ section }: { section: string }) {
  return (
    <header className="studio-masthead">
      <GlimpseLogo />
      <span>{section}</span>
      <a href="/#collection">
        The collection <span aria-hidden="true">↗</span>
      </a>
    </header>
  );
}

export function StudioPage({
  children,
  image = "mikado",
  section,
}: StudioPageProps) {
  return (
    <div className="studio-page">
      <StudioMasthead section={section} />
      <main className="studio-spread">
        <div className="studio-photo" aria-hidden="true">
          <img src={"/campaign/" + image + ".webp"} alt="" />
        </div>
        <div className="studio-panel">
          <div className="studio-panel-content">{children}</div>
        </div>
      </main>
    </div>
  );
}
