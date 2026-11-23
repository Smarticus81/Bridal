import { ShopWorkspace } from "@/components/layout/ShopWorkspace";
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
import { useCopyMessage } from "@/hooks/use-copy-message";
import { useToast } from "@/hooks/use-toast";

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
          expiresInDays,
          dressIds: [...selected],
        },
      },
      {
        onSuccess: (res) => {
          setCreatedUrl(res.url);
          setSelected(new Set());
          toast({ title: "Private link ready", description: `${res.dressCount} gowns in this lookbook.` });
          queryClient.invalidateQueries({ queryKey: getListLookbooksQueryKey() });
        },
        onError: () => toast({ title: "Couldn't create the lookbook", variant: "destructive" }),
      },
    );
  };

  const guideUrl = new URL("/bride-guide", window.location.origin).href;
  const copyMessage = useCopyMessage();
  function copyInvitation(link: string) {
    const message = `Here’s your private gown lookbook: ${link}\nChoose any gown to see it on you. These two short videos show how to take your photo, try more dresses, and request a fitting: ${guideUrl}`;
    return copyMessage(message);
  }

  return (
    <ShopWorkspace section="Lookbooks">
        <h1 className="text-3xl font-semibold">Lookbooks</h1>
        <p className="mt-1 text-sm text-muted-foreground">Choose gowns and an expiry date. Your bride can preview as many styles as she likes while her invitation is open.</p>

        <form onSubmit={submit} className="mt-8 rounded-sm border border-border bg-card p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="shop">Shop</Label>
              <select id="shop" value={shopId} onChange={(e) => setShopId(e.target.value ? Number(e.target.value) : "")}
                className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                {shops.length === 0 && <option value="">No shops yet</option>}
                {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="purpose">Purpose</Label>
              <select id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
                {PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="days">Days</Label>
              <Input id="days" type="number" min={1} max={365} value={expiresInDays}
                onChange={(e) => setExpiresInDays(Math.max(1, Number(e.target.value)))} />
            </div>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-neutral-700">Dresses ({selected.size} selected)</p>
            <div className="mt-2 grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {dresses.map((d) => (
                <label key={d.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-neutral-50">
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                  <span className="font-medium">{d.styleName}</span>
                  <span className="font-mono text-xs text-neutral-400">{d.sku}</span>
                </label>
              ))}
              {dresses.length === 0 && <p className="text-sm text-muted-foreground">Add dresses in the catalog first.</p>}
            </div>
          </div>

          <div className="mt-5">
            <Button type="submit" disabled={createLookbook.isPending}>
              {createLookbook.isPending ? "Sending…" : "Send lookbook"}
            </Button>
          </div>

          {createdUrl && (
            <div className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
              Private lookbook link <a href={createdUrl} className="font-mono break-all underline">{createdUrl}</a>
              <button type="button" className="block mt-2 underline" onClick={() => copyInvitation(createdUrl)}>Copy invitation and bride videos</button>
            </div>
          )}
        </form>

        <section className="guide-share">
          <h2>Videos for your brides</h2>
          <p>Send these two guides with a lookbook or play them during a consultation. The guide link can be shared with any bride.</p>
          <div><a href="/bride-guide" target="_blank" rel="noreferrer">Watch the bride guides ↗</a>
          <button type="button" onClick={() => copyMessage(guideUrl)}>Copy guide link</button></div>
        </section>
        <section className="mt-12">
          <h2 className="text-lg font-semibold">Sent lookbooks</h2>
          {lookbooks.length === 0 ? (
            <p className="console-empty">Your private links will appear here with their usage and expiry dates.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-200">
              {lookbooks.map((lb) => (
                <li key={lb.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">/try/{lb.token.slice(0, 10)}…</p>
                    <p className="text-sm text-neutral-700">
                      {lb.creditsUsed} shop credits used · expires {new Date(lb.expiresAt).toLocaleDateString()}
                    </p>
                    {lb.usable && <button type="button" className="mt-2 text-sm underline" onClick={() => copyInvitation(new URL("/try/" + lb.token, window.location.origin).href)}>Copy invitation and bride videos</button>}
                  </div>
                  <span className={`rounded-none px-3 py-1 text-xs font-medium ${
                    lb.usable ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-600"
                  }`}>
                    {lb.usable ? "Active" : lb.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
    </ShopWorkspace>
  );
}

export default function LookbooksPage() {
  return (
    <OrgGate>
      <LookbooksContent />
    </OrgGate>
  );
}
