import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDresses,
  useCreateDress,
  getListDressesQueryKey,
} from "@workspace/api-client-react";
import { OrgGate } from "@/components/auth/OrgGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

/**
 * Consultant console — the catalog (spec §7). A light surface (§8: light where
 * you read data). Lists the shop's dresses with try-on readiness shown
 * prominently (a dress with no front photo can't be tried on), and a quick
 * add-a-dress form. Deeper import (CSV dry-run) and image ingestion attach here.
 */

const STATUSES = ["in_stock", "special_order", "discontinued"] as const;

function CatalogContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filterStatus, setFilterStatus] = useState<"" | (typeof STATUSES)[number]>("");
  const [filterSilhouette, setFilterSilhouette] = useState("");
  const [tryOnReadyOnly, setTryOnReadyOnly] = useState(false);

  // Only include set filters, so the query key stays stable when nothing is chosen.
  const params = {
    ...(filterStatus ? { status: filterStatus } : {}),
    ...(filterSilhouette.trim() ? { silhouette: filterSilhouette.trim() } : {}),
    ...(tryOnReadyOnly ? { tryOnReadyOnly: true } : {}),
  };
  const hasFilters = Object.keys(params).length > 0;

  const dressesQuery = useListDresses(hasFilters ? params : undefined, {
    query: { queryKey: getListDressesQueryKey(hasFilters ? params : undefined) },
  });
  const createDress = useCreateDress();

  const [sku, setSku] = useState("");
  const [styleName, setStyleName] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("in_stock");

  const dresses = dressesQuery.data?.dresses ?? [];
  const notReady = dresses.filter((d) => !d.tryOnReady).length;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!sku.trim() || !styleName.trim()) return;
    createDress.mutate(
      { data: { sku: sku.trim(), styleName: styleName.trim(), status } },
      {
        onSuccess: () => {
          toast({ title: "Dress added", description: `${styleName} is in your catalog.` });
          setSku("");
          setStyleName("");
          queryClient.invalidateQueries({ queryKey: getListDressesQueryKey() });
        },
        onError: () => {
          toast({
            title: "Couldn't add that dress",
            description: "That SKU may already be in your catalog.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-8 flex items-baseline justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Catalog</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {dresses.length} dress{dresses.length === 1 ? "" : "es"}
              {notReady > 0 && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                  {notReady} need a front photo to be try-on ready
                </span>
              )}
            </p>
          </div>
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "" | (typeof STATUSES)[number])}
            className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          <Input
            aria-label="Filter by silhouette"
            value={filterSilhouette}
            onChange={(e) => setFilterSilhouette(e.target.value)}
            placeholder="Silhouette (e.g. A-line)"
            className="h-9 w-56"
          />
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={tryOnReadyOnly}
              onChange={(e) => setTryOnReadyOnly(e.target.checked)}
            />
            Try-on ready only
          </label>
          {hasFilters && (
            <button
              type="button"
              className="text-sm text-neutral-500 underline"
              onClick={() => {
                setFilterStatus("");
                setFilterSilhouette("");
                setTryOnReadyOnly(false);
              }}
            >
              Clear
            </button>
          )}
        </div>

        <form onSubmit={submit} className="mb-10 grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 bg-white p-5 sm:grid-cols-4">
          <div className="sm:col-span-1">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="AUR-2027" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="style">Style name</Label>
            <Input id="style" value={styleName} onChange={(e) => setStyleName(e.target.value)} placeholder="Aurora" />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
              className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-4">
            <Button type="submit" disabled={createDress.isPending}>
              {createDress.isPending ? "Adding…" : "Add dress"}
            </Button>
          </div>
        </form>

        {dressesQuery.isLoading && <p className="text-neutral-500">Loading your catalog…</p>}
        {dresses.length === 0 && !dressesQuery.isLoading && (
          <p className="text-neutral-500">Add your first dress.</p>
        )}

        <ul className="divide-y divide-neutral-200">
          {dresses.map((dress) => (
            <li key={dress.id} className="flex items-center justify-between py-4">
              <div>
                <p className="font-serif text-lg">{dress.styleName}</p>
                <p className="font-mono text-xs uppercase tracking-wider text-neutral-500">
                  {dress.sku}
                  {dress.sizeRange ? ` · ${dress.sizeRange}` : ""}
                  {` · ${dress.status.replace("_", " ")}`}
                </p>
              </div>
              {dress.tryOnReady ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                  Try-on ready
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                  Needs front photo
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

export default function CatalogPage() {
  return (
    <OrgGate>
      <CatalogContent />
    </OrgGate>
  );
}
