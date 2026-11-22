import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { AisleworkLogo } from "@/components/brand/AisleworkLogo";

export function StudioMasthead({ section }: { section: string }) {
  return (
    <header className="studio-masthead">
      <AisleworkLogo />
      <span>{section}</span>
      <a href="/">
        Product overview <ArrowUpRight size={14} />
      </a>
    </header>
  );
}

export function StudioPage({
  children,
  section,
}: {
  children: ReactNode;
  section: string;
}) {
  return (
    <div className="studio-page">
      <StudioMasthead section={section} />
      <main className="studio-panel">
        <div className="studio-panel-content">{children}</div>
      </main>
    </div>
  );
}
