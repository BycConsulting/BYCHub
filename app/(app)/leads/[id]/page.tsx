import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { leadStages } from '@/lib/validation'
import { updateLeadStage, addActivity } from '../actions'

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('id, contact_name, contact_company, contact_email, stage, source, notes, client_id')
    .eq('id', id)
    .single()

  if (!lead) notFound()

  const { data: activities } = await supabase
    .from('activities')
    .select('id, type, body, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <div>
        <h1 className="text-lg font-semibold">{lead.contact_name}</h1>
        <p className="text-sm text-gray-600">
          {lead.contact_company} · {lead.contact_email}
        </p>
        <p className="mt-2 text-sm">{lead.notes}</p>

        {lead.client_id ? (
          <p className="mt-2 text-sm text-green-700">Converted to client.</p>
        ) : (
          <form action={updateLeadStage} className="mt-3 flex items-center gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <select name="stage" defaultValue={lead.stage} className="rounded border px-3 py-2">
              {leadStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded bg-black px-3 py-2 text-white">
              Update stage
            </button>
          </form>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Activity</h2>
        <form action={addActivity} className="mt-3 space-y-2">
          <input type="hidden" name="leadId" value={lead.id} />
          <select name="type" className="rounded border px-3 py-2">
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
          </select>
          <textarea name="body" placeholder="What happened?" required className="w-full rounded border px-3 py-2" />
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Add activity
          </button>
        </form>

        <ul className="mt-4 space-y-2">
          {(activities ?? []).map((activity) => (
            <li key={activity.id} className="rounded border p-2 text-sm">
              <span className="font-medium">{activity.type}</span> — {activity.body}
              <div className="text-xs text-gray-500">{new Date(activity.created_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
