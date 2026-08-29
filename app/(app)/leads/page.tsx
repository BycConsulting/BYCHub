import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createLead } from './actions'
import { requireModule } from '@/lib/access'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('leads')
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: leads } = await supabase
    .from('leads')
    .select('id, contact_name, contact_company, stage, source, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">New lead</h1>
        {error && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
        )}
        <form action={createLead} className="mt-3 grid grid-cols-2 gap-3">
          <input
            name="contact_name"
            placeholder="Contact name"
            required
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <input
            name="contact_email"
            placeholder="Email"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <input
            name="contact_company"
            placeholder="Company"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <input
            name="source"
            placeholder="Source"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <textarea
            name="notes"
            placeholder="Notes"
            className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <button
            type="submit"
            className="col-span-2 rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Add lead
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h1 className="px-4 pt-4 text-lg font-semibold text-slate-800">Leads</h1>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-2">Contact</th>
              <th>Company</th>
              <th>Stage</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {(leads ?? []).map((lead) => (
              <tr key={lead.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:underline">
                    {lead.contact_name}
                  </Link>
                </td>
                <td className="text-slate-600">{lead.contact_company ?? '—'}</td>
                <td className="text-slate-600">{lead.stage}</td>
                <td className="text-slate-600">{lead.source ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
