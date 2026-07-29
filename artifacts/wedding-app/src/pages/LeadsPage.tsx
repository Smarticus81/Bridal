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
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-semibold">Leads</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Brides who shared their details from a try-on link.
        </p>

        {leadsQuery.isLoading && <p className="mt-6 text-neutral-500">Loading…</p>}
        {leads.length === 0 && !leadsQuery.isLoading && (
          <p className="mt-6 text-neutral-500">No leads yet. They'll appear here as brides try dresses at home.</p>
        )}

        {leads.length > 0 && (
          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
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
                  <td className="py-3 text-neutral-500">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

export default function LeadsPage() {
  return (
    <OrgGate>
      <LeadsContent />
    </OrgGate>
  );
}
