import { BookOpen, CreditCard, Inbox, Layers3 } from "lucide-react";
import { AisleworkLogo } from "@/components/brand/AisleworkLogo";
const sections = [
  ["/catalog", "Gown catalog", Layers3],
  ["/lookbooks", "Lookbooks", BookOpen],
  ["/leads", "Fitting requests", Inbox],
  ["/dashboard", "Account & billing", CreditCard],
] as const;
export function BoutiqueNav({ showBrand = true }: { showBrand?: boolean }) {
  return (
    <div className="workroom-nav">
      {showBrand && (
        <div className="workroom-brand">
          <AisleworkLogo />
          <span>Shop workspace</span>
        </div>
      )}
      <nav aria-label="Shop workspace">
        {sections.map(([url, label, Icon]) => (
          <a
            key={url}
            href={url}
            aria-current={location.pathname === url ? "page" : undefined}
          >
            <Icon size={15} />
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}
