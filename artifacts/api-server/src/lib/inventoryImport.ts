import { DRESS_STATUSES, type DressStatus } from "@workspace/db/schema";

/**
 * Bulk catalog import with a dry-run diff (spec §7). An unready catalog is the
 * #1 reason the product fails at onboarding, so the import is deliberate: parse
 * the CSV, map arbitrary columns to canonical dress fields, validate each row,
 * then compute exactly what a commit would do — "will create N, update M,
 * archive K" — so a consultant sees the effect before anything is written.
 *
 * All pure and side-effect free: the route does the DB writes; this decides them.
 */

/** Canonical dress fields the importer understands. `sku` and `styleName` are required. */
export const CANONICAL_DRESS_FIELDS = [
  "sku",
  "designer",
  "styleName",
  "silhouette",
  "neckline",
  "sleeve",
  "trainLength",
  "fabric",
  "color",
  "sizeRange",
  "priceCents",
  "status",
] as const;
export type CanonicalDressField = (typeof CANONICAL_DRESS_FIELDS)[number];

export interface DressRowInput {
  sku: string;
  designer?: string | null;
  styleName: string;
  silhouette?: string | null;
  neckline?: string | null;
  sleeve?: string | null;
  trainLength?: string | null;
  fabric?: string | null;
  color?: string | null;
  sizeRange?: string | null;
  priceCents?: number | null;
  status?: DressStatus;
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/**
 * Minimal RFC-4180-ish CSV parser: quoted fields, escaped quotes (""), and
 * commas/newlines inside quotes. Handles \n and \r\n line endings. Blank
 * trailing lines are ignored.
 */
export function parseCsv(text: string): ParsedCsv {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let sawAny = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      sawAny = true;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawAny = true;
    } else if (c === ",") {
      pushField();
      sawAny = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      if (sawAny || record.length > 0 || field.length > 0) pushRecord();
      sawAny = false;
    } else {
      field += c;
      sawAny = true;
    }
  }
  if (sawAny || field.length > 0 || record.length > 0) pushRecord();

  const headers = records.shift() ?? [];
  // Drop fully-empty rows (e.g. a trailing blank line that slipped through).
  const rows = records.filter((r) => r.some((cell) => cell.trim() !== ""));
  return { headers: headers.map((h) => h.trim()), rows };
}

/** Normalize a header for fuzzy matching: lowercase, strip non-alphanumerics. */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const DEFAULT_HEADER_ALIASES: Record<string, CanonicalDressField> = {
  sku: "sku",
  style: "styleName",
  stylename: "styleName",
  name: "styleName",
  designer: "designer",
  brand: "designer",
  silhouette: "silhouette",
  neckline: "neckline",
  sleeve: "sleeve",
  sleeves: "sleeve",
  train: "trainLength",
  trainlength: "trainLength",
  fabric: "fabric",
  material: "fabric",
  color: "color",
  colour: "color",
  size: "sizeRange",
  sizerange: "sizeRange",
  sizes: "sizeRange",
  price: "priceCents",
  pricecents: "priceCents",
  status: "status",
};

/**
 * Resolve CSV headers to canonical fields. An explicit `mapping` (header ->
 * field) wins; otherwise headers are matched by normalized alias. Unmapped
 * headers are ignored. Returns column index -> field.
 */
export function resolveColumnMapping(
  headers: string[],
  mapping?: Record<string, CanonicalDressField>,
): Map<number, CanonicalDressField> {
  const resolved = new Map<number, CanonicalDressField>();
  headers.forEach((header, index) => {
    const explicit = mapping?.[header];
    if (explicit) {
      resolved.set(index, explicit);
      return;
    }
    const alias = DEFAULT_HEADER_ALIASES[normalizeHeader(header)];
    if (alias) resolved.set(index, alias);
  });
  return resolved;
}

const trimOrNull = (v: string | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export interface RowValidationError {
  rowIndex: number;
  errors: string[];
}

export interface MappedRows {
  valid: DressRowInput[];
  invalid: RowValidationError[];
}

/** Parse a price like "$1,299.00" or "129900" into integer cents, or null. */
export function parsePriceToCents(raw: string | null): number | null {
  if (raw === null) return null;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "") return null;
  if (cleaned.includes(".")) return Math.round(Number(cleaned) * 100);
  return Math.round(Number(cleaned) * 100);
}

/** Map parsed CSV rows to validated dress inputs, collecting per-row errors. */
export function mapRowsToDresses(
  parsed: ParsedCsv,
  mapping?: Record<string, CanonicalDressField>,
): MappedRows {
  const columns = resolveColumnMapping(parsed.headers, mapping);
  const valid: DressRowInput[] = [];
  const invalid: RowValidationError[] = [];

  parsed.rows.forEach((cells, rowIndex) => {
    const get = (field: CanonicalDressField): string | null => {
      for (const [index, mapped] of columns) {
        if (mapped === field) return trimOrNull(cells[index]);
      }
      return null;
    };

    const errors: string[] = [];
    const sku = get("sku");
    const styleName = get("styleName");
    if (!sku) errors.push("missing sku");
    if (!styleName) errors.push("missing styleName");

    const statusRaw = get("status");
    let status: DressStatus | undefined;
    if (statusRaw !== null) {
      const normalized = statusRaw.toLowerCase().replace(/[\s-]/g, "_");
      if ((DRESS_STATUSES as readonly string[]).includes(normalized)) {
        status = normalized as DressStatus;
      } else {
        errors.push(`invalid status "${statusRaw}"`);
      }
    }

    if (errors.length > 0) {
      invalid.push({ rowIndex, errors });
      return;
    }

    valid.push({
      sku: sku!,
      styleName: styleName!,
      designer: get("designer"),
      silhouette: get("silhouette"),
      neckline: get("neckline"),
      sleeve: get("sleeve"),
      trainLength: get("trainLength"),
      fabric: get("fabric"),
      color: get("color"),
      sizeRange: get("sizeRange"),
      priceCents: parsePriceToCents(get("priceCents")),
      status: status ?? "in_stock",
    });
  });

  return { valid, invalid };
}

export interface ExistingDress extends DressRowInput {
  id: number;
  status: DressStatus;
}

export interface InventoryDiff {
  create: DressRowInput[];
  update: Array<{ id: number; sku: string; changes: string[]; next: DressRowInput }>;
  archive: ExistingDress[];
  unchanged: string[];
  invalid: RowValidationError[];
}

const COMPARE_FIELDS: CanonicalDressField[] = [
  "designer",
  "styleName",
  "silhouette",
  "neckline",
  "sleeve",
  "trainLength",
  "fabric",
  "color",
  "sizeRange",
  "priceCents",
  "status",
];

/**
 * Compute the dry-run diff of an import against the existing catalog, keyed by
 * SKU (unique per org). `archiveMissing` marks existing dresses absent from the
 * import as archivable (status -> discontinued) rather than deleting them.
 */
export function diffInventory(
  mapped: MappedRows,
  existing: ExistingDress[],
  opts: { archiveMissing?: boolean } = {},
): InventoryDiff {
  const bySku = new Map(existing.map((d) => [d.sku, d]));
  const incomingSkus = new Set<string>();
  const diff: InventoryDiff = {
    create: [],
    update: [],
    archive: [],
    unchanged: [],
    invalid: mapped.invalid,
  };

  for (const row of mapped.valid) {
    incomingSkus.add(row.sku);
    const current = bySku.get(row.sku);
    if (!current) {
      diff.create.push(row);
      continue;
    }
    const changes: string[] = [];
    for (const field of COMPARE_FIELDS) {
      const before = current[field] ?? null;
      const after = (row[field] ?? null) as unknown;
      if (before !== after) changes.push(field);
    }
    if (changes.length === 0) diff.unchanged.push(row.sku);
    else diff.update.push({ id: current.id, sku: row.sku, changes, next: row });
  }

  if (opts.archiveMissing) {
    for (const d of existing) {
      if (!incomingSkus.has(d.sku) && d.status !== "discontinued") diff.archive.push(d);
    }
  }

  return diff;
}

/** Human-readable dry-run summary: "will create N, update M, archive K". */
export function summarizeDiff(diff: InventoryDiff): string {
  const parts = [
    `will create ${diff.create.length}`,
    `update ${diff.update.length}`,
    `archive ${diff.archive.length}`,
  ];
  if (diff.unchanged.length > 0) parts.push(`${diff.unchanged.length} unchanged`);
  if (diff.invalid.length > 0) parts.push(`${diff.invalid.length} invalid (skipped)`);
  return parts.join(", ");
}
