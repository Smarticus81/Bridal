import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrganization,
  useListDresses,
  useListLookbooks,
  useCreateLookbook,
  getListDressesQueryKey,
  getListLookbooksQueryKey,
} from "@workspace/api-client-react";
import { OrgGate } from "@/components/auth/OrgGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

/**
 * Consultant console — lookbooks (spec §6.1, §6.5). A light surface to send a
 * bride a curated /try link and watch the shop-visible burn meter. A lookbook is
 * always capped and always expiring; the form enforces both.
 */

const PURPOSES = [
  { value: "pre_appointment", label: "Pre-appointment (lead gen)" },
  { value: "post_appointment", label: "Post-appointment (closing)" },
  { value: "open_catalog", label: "Open catalog" },
] as const;

function LookbooksContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const orgQuery = useGetOrganization();
  const dressesQuery = useListDresses(undefined, { query: { queryKey: getListDressesQueryKey() } });
  const lookbooksQuery = useListLookbooks();
  const createLookbook = useCreateLookbook();

  const shops = orgQuery.data?.venues ?? [];
  const dresses = dressesQuery.data?.dresses ?? [];
  const lookbooks = lookbooksQuery.data?.lookbooks ?? [];

  const [shopId, setShopId] = useState<number | "">("");
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]["value"]>("pre_appointment");
  const [creditCap, setCreditCap] = useState(8);
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const effectiveShopId = shopId === "" ? shops[0]?.id : shopId;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveShopId || selected.size === 0) {
      toast({ title: "Add a shop and at least one dress", variant: "destructive" });
      return;
    }
    createLookbook.mutate(
      {
        data: {
          shopId: effectiveShopId,
          purpose,
          creditCap,
          expiresInDays,
          dressIds: [...selected],
        },
      },
      {
        onSuccess: (res) => {
          setCreatedUrl(res.url);
          setSelected(new Set());
          toast({ title: "Lookbook sent", description: `${res.dressCount} dresses, ${res.creditCap} tries.` });
          queryClient.invalidateQueries({ queryKey: getListLookbooksQueryKey() });
        },
        onError: () => toast({ title: "Couldn't create the lookbook", variant: "destructive" }),
      },
    );
  };

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-semibold">Lookbooks</h1>
        <p className="mt-1 text-sm text-neutral-500">Send a bride a curated try-on link. Always capped, always expiring.</p>

        <form onSubmit={submit} className="mt-8 rounded-lg border border-neutral-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="shop">Shop</Label>
              <select id="shop" value={shopId} onChange={(e) => setShopId(e.target.value ? Number(e.target.value) : "")}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm">
                {shops.length === 0 && <option value="">No shops yet</option>}
                {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="purpose">Purpose</Label>
              <select id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm">
                {PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cap">Tries</Label>
                <Input id="cap" type="number" min={1} value={creditCap}
                  onChange={(e) => setCreditCap(Math.max(1, Number(e.target.value)))} />
              </div>
              <div>
                <Label htmlFor="days">Days</Label>
                <Input id="days" type="number" min={1} max={365} value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Math.max(1, Number(e.target.value)))} />
              </div>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-neutral-700">Dresses ({selected.size} selected)</p>
            <div className="mt-2 grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {dresses.map((d) => (
                <label key={d.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-neutral-50">
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                  <span className="font-serif">{d.styleName}</span>
                  <span className="font-mono text-xs text-neutral-400">{d.sku}</span>
                </label>
              ))}
              {dresses.length === 0 && <p className="text-sm text-neutral-500">Add dresses in the catalog first.</p>}
            </div>
          </div>

          <div className="mt-5">
            <Button type="submit" disabled={createLookbook.isPending}>
              {createLookbook.isPending ? "Sending…" : "Send lookbook"}
            </Button>
          </div>

          {createdUrl && (
            <div className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
              Lookbook link: <span className="font-mono break-all">{createdUrl}</span>
            </div>
          )}
        </form>

        <section className="mt-12">
          <h2 className="text-lg font-semibold">Sent lookbooks</h2>
          {lookbooks.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">No lookbooks yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-200">
              {lookbooks.map((lb) => (
                <li key={lb.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-mono text-xs text-neutral-500">/try/{lb.token.slice(0, 10)}…</p>
                    <p className="text-sm text-neutral-700">
                      {lb.remainingCredits}/{lb.creditCap} tries left · expires {new Date(lb.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    lb.usable ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-600"
                  }`}>
                    {lb.usable ? "Active" : lb.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

export default function LookbooksPage() {
  return (
    <OrgGate>
      <LookbooksContent />
    </OrgGate>
  );
}
