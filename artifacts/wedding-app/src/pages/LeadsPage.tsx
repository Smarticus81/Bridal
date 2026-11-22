import { ShopWorkspace } from "@/components/layout/ShopWorkspace";
import { useListLeads, getListLeadsQueryKey } from "@workspace/api-client-react";
import { OrgGate } from "@/components/auth/OrgGate";

/**
 * Consultant console — leads (spec §6.5). A light data surface listing brides
 * captured from the remote flow (each fires after her first look renders), so
 * the shop can follow up. Read-only.
 */

function LeadsContent() {
  const leadsQuery = useListLeads({ query: { queryKey: getListLeadsQueryKey() } });
  const leads = leadsQuery.data?.leads ?? [];

  return (
    <ShopWorkspace section="Fitting requests">
        <h1 className="text-3xl font-semibold">Fitting requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Brides who shared their details from a try-on link.
        </p>

        {leadsQuery.isLoading && <p className="mt-6 text-muted-foreground">Loading…</p>}
        {leadsQuery.isError && <p role="alert">Fitting requests could not be loaded. <button onClick={() => leadsQuery.refetch()} className="underline">Retry</button></p>}
        {leads.length === 0 && !leadsQuery.isLoading && !leadsQuery.isError && (
          <div className="console-empty"><h2>Your inbox is clear</h2><p>Requests appear here when brides share their details after a virtual try-on.</p><a href="/lookbooks">Open lookbooks →</a></div>
        )}

        {leads.length > 0 && (
          <div className="mt-6 overflow-x-auto"><table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Phone</th>
                <th className="py-2 font-medium">Captured</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-neutral-100">
                  <td className="py-3 font-mono text-xs">{lead.email}</td>
                  <td className="py-3">{lead.name ?? "—"}</td>
                  <td className="py-3">{lead.phone ?? "—"}</td>
                  <td className="py-3 text-muted-foreground">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
    </ShopWorkspace>
  );
}

export default function LeadsPage() {
  return (
    <OrgGate>
      <LeadsContent />
    </OrgGate>
  );
}
