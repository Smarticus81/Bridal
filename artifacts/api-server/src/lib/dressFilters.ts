/**
 * Consultant catalog browse filters (spec §7). A shop stocks hundreds of
 * dresses; the console filters by silhouette, neckline, sleeve, size range,
 * price band, in-stock-at-this-shop, and try-on readiness. Kept as a pure
 * predicate so the matching rules are unit-testable; the route applies it over
 * the org-scoped catalog.
 */

export interface DressFilters {
  silhouette?: string;
  neckline?: string;
  sleeve?: string;
  /** Substring match against the size range string (e.g. "2" matches "2-16"). */
  sizeRange?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  /** In stock at this shop (shop id present in the dress's shopIds). */
  shopId?: number;
  status?: string;
  /** Only dresses that are try-on ready (have a validated front image). */
  tryOnReadyOnly?: boolean;
}

export interface FilterableDress {
  silhouette?: string | null;
  neckline?: string | null;
  sleeve?: string | null;
  sizeRange?: string | null;
  priceCents?: number | null;
  shopIds: number[];
  status: string;
  tryOnReady: boolean;
}

const eqCI = (value: string | null | undefined, want: string): boolean =>
  typeof value === "string" && value.toLowerCase() === want.toLowerCase();

const includesCI = (value: string | null | undefined, want: string): boolean =>
  typeof value === "string" && value.toLowerCase().includes(want.toLowerCase());

/** Whether a dress matches every provided filter (absent filters are ignored). */
export function matchesDressFilters(dress: FilterableDress, filters: DressFilters): boolean {
  if (filters.silhouette && !eqCI(dress.silhouette, filters.silhouette)) return false;
  if (filters.neckline && !eqCI(dress.neckline, filters.neckline)) return false;
  if (filters.sleeve && !eqCI(dress.sleeve, filters.sleeve)) return false;
  if (filters.sizeRange && !includesCI(dress.sizeRange, filters.sizeRange)) return false;
  if (filters.status && dress.status !== filters.status) return false;
  if (filters.tryOnReadyOnly && !dress.tryOnReady) return false;
  if (typeof filters.shopId === "number" && !dress.shopIds.includes(filters.shopId)) return false;
  if (typeof filters.minPriceCents === "number") {
    if (dress.priceCents == null || dress.priceCents < filters.minPriceCents) return false;
  }
  if (typeof filters.maxPriceCents === "number") {
    if (dress.priceCents == null || dress.priceCents > filters.maxPriceCents) return false;
  }
  return true;
}

/** Filter a catalog by the given filters, preserving order. */
export function filterDresses<T extends FilterableDress>(dresses: T[], filters: DressFilters): T[] {
  return dresses.filter((dress) => matchesDressFilters(dress, filters));
}
