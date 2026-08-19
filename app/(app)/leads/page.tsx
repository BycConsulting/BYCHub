import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createLead } from './actions'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: leads } = await supabase
    .from('leads')
    .select('id, contact_name, contact_company, stage, source, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">New lead</h1>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <form action={createLead} className="mt-3 grid grid-cols-2 gap-3">
          <input name="contact_name" placeholder="Contact name" required className="rounded border px-3 py-2" />
          <input name="contact_email" placeholder="Email" className="rounded border px-3 py-2" />
          <input name="contact_company" placeholder="Company" className="rounded border px-3 py-2" />
          <input name="source" placeholder="Source" className="rounded border px-3 py-2" />
          <textarea name="notes" placeholder="Notes" className="col-span-2 rounded border px-3 py-2" />
          <button type="submit" className="col-span-2 rounded bg-black py-2 text-white">
            Add lead
          </button>
        </form>
      </div>

      <div>
        <h1 className="text-lg font-semibold">Leads</h1>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-2">Contact</th>
              <th>Company</th>
              <th>Stage</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {(leads ?? []).map((lead) => (
              <tr key={lead.id} className="border-b">
                <td className="py-2">
                  <Link href={`/leads/${lead.id}`} className="text-blue-600 hover:underline">
                    {lead.contact_name}
                  </Link>
                </td>
                <td>{lead.contact_company ?? '—'}</td>
                <td>{lead.stage}</td>
                <td>{lead.source ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
