const sections = [
  ["/catalog", "Gown catalog"], ["/lookbooks", "Lookbooks"], ["/leads", "Fitting requests"], ["/dashboard", "Account & billing"],
] as const;

export function BoutiqueNav() {
  return <nav aria-label="Boutique studio" className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-neutral-200 pb-5 mb-8 text-sm">
    <a href="/" className="mr-auto font-display text-2xl tracking-tight">glimpse</a>
    {sections.map(([url, label]) => <a key={url} href={url} aria-current={location.pathname === url ? "page" : undefined}
      className="underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline">{label}</a>)}
  </nav>;
}
