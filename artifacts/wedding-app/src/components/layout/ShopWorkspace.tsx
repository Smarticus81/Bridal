import type { ReactNode } from "react";
import { ArrowUpRight, ChevronRight, Store } from "lucide-react";
import { AisleworkLogo } from "@/components/brand/AisleworkLogo";
import { BoutiqueNav } from "./BoutiqueNav";

export function ShopWorkspace({
  section,
  children,
}: {
  section: string;
  children: ReactNode;
}) {
  return (
    <div className="console">
      <header className="console-top">
        <AisleworkLogo />
        <span>Shop workspace</span>
        <a href="/dashboard">
          Account <ArrowUpRight size={14} />
        </a>
      </header>
      <div className="console-layout">
        <aside className="console-sidebar">
          <div className="console-stamp">
            <Store size={22} />
            <strong>Consultant console</strong>
          </div>
          <BoutiqueNav showBrand={false} />
        </aside>
        <main className="workroom">
          <div>
            <div className="console-path">
              Workspace <ChevronRight size={12} /> {section}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
