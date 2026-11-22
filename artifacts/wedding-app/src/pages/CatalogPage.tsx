import { ShopWorkspace } from "@/components/layout/ShopWorkspace";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDresses,
  type DressMediaCoverage,
  useCreateDress,
  useAddDressMedia,
  useGetOrganization,
  getListDressesQueryKey,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
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
  const addDressMedia = useAddDressMedia();
  const orgQuery = useGetOrganization();
  const shopSlug = orgQuery.data?.venues?.[0]?.slug;
  const { uploadFile } = useUpload({ purpose: "dress", venueSlug: shopSlug });

  const [uploadingId, setUploadingId] = useState<number | null>(null);

  const [views, setViews] = useState<Record<number, DressMediaCoverage>>({});
  const uploadView = async (dressId: number, file: File | undefined, coverage: DressMediaCoverage) => {
    if (!file || !shopSlug) return;
    setUploadingId(dressId);
    try {
      const result = await uploadFile(file);
      if (!result) throw new Error("upload failed");
      await addDressMedia.mutateAsync({
        dressId,
        data: { objectKey: result.objectPath, coverage },
      });
      toast({ title: "Reference added", description: `Saved the ${coverage.replace("_", " ")} view.` });
      queryClient.invalidateQueries({ queryKey: getListDressesQueryKey() });
    } catch {
      toast({
        title: "Couldn't add that photo",
        description: "Use a clear, high-resolution full-length front photo.",
        variant: "destructive",
      });
    } finally {
      setUploadingId(null);
    }
  };

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
    <ShopWorkspace section="Gown catalog">
        <header className="mb-8 flex items-baseline justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Gown catalog</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {dresses.length} dress{dresses.length === 1 ? "" : "es"}
              {notReady > 0 && (
                <span className="ml-2 rounded-none bg-amber-100 px-2 py-0.5 text-amber-800">
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
            className="h-9 rounded-md border border-input bg-card px-3 text-sm"
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
              className="text-sm text-muted-foreground underline"
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

        <details className="catalog-add"><summary>Add a gown</summary><form onSubmit={submit} className="mb-10 grid grid-cols-1 gap-4 rounded-sm border border-border bg-card p-5 sm:grid-cols-4">
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
              className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
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
        </form></details>

        {dressesQuery.isLoading && <p className="text-muted-foreground">Loading your catalog…</p>}
        {dressesQuery.isError && <p role="alert" className="console-empty">Your catalog could not be loaded. <button className="underline" onClick={()=>dressesQuery.refetch()}>Retry</button></p>}
        {dresses.length === 0 && !dressesQuery.isLoading && !dressesQuery.isError && (
          <p className="console-empty">{hasFilters ? "No gowns match these filters." : "Your rack is empty. Add a gown above, then upload a front photo to make it available for try-on."}</p>
        )}

        <ul className="stock-list">
          {dresses.map((dress) => (
            <li key={dress.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="stock-name">{dress.styleName}</p>
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {dress.sku}
                  {dress.sizeRange ? ` · ${dress.sizeRange}` : ""}
                  {` · ${dress.status.replace("_", " ")}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {dress.tryOnReady && <span className="text-xs text-emerald-800">Try-on ready</span>}
                <select className="rounded border border-input bg-card p-2 text-sm" aria-label={`Reference angle for ${dress.styleName}`}
                  value={views[dress.id] ?? (dress.tryOnReady ? "detail" : "front")} onChange={e => setViews({ ...views, [dress.id]: e.target.value as DressMediaCoverage })}>
                  <option value="front">Full-length front</option><option value="back">Full-length back</option><option value="detail">Lace / neckline</option><option value="fabric">Fabric close-up</option><option value="on_model">On model</option>
                </select>
                <label className="relative cursor-pointer rounded border border-neutral-400 px-3 py-2 text-sm has-[:focus-visible]:ring-2">
                  {uploadingId === dress.id ? "Uploading…" : "Add photo"}
                  <input aria-label={`Upload reference for ${dress.styleName}`} type="file" accept="image/jpeg,image/png,image/webp" className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    disabled={!shopSlug || uploadingId !== null} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void uploadView(dress.id, file, views[dress.id] ?? (dress.tryOnReady ? "detail" : "front")); }} />
                </label>
              </div>
            </li>
          ))}
        </ul>
    </ShopWorkspace>
  );
}

export default function CatalogPage() {
  return (
    <OrgGate>
      <CatalogContent />
    </OrgGate>
  );
}
