import { GlimpseLogo } from "@/components/brand/GlimpseLogo";
const sections = [
  ["/catalog", "Gown catalog"],
  ["/lookbooks", "Lookbooks"],
  ["/leads", "Fitting requests"],
  ["/dashboard", "Account & billing"],
] as const;

export function BoutiqueNav({ showBrand = true }: { showBrand?: boolean }) {
  return (
    <div className="workroom-nav">
      {showBrand && (
        <div className="workroom-brand">
          <GlimpseLogo />
          <span>Boutique studio</span>
        </div>
      )}
      <nav aria-label="Boutique studio">
        {sections.map(([url, label]) => (
          <a
            key={url}
            href={url}
            aria-current={location.pathname === url ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}
