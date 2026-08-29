import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { leadStages } from '@/lib/validation'
import { updateLeadStage, addActivity } from '../actions'
import { requireModule } from '@/lib/access'

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('leads')
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
    <div className="max-w-3xl space-y-6">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">{lead.contact_name}</h1>
        <p className="text-sm text-slate-500">
          {lead.contact_company} · {lead.contact_email}
        </p>
        <p className="mt-2 text-sm text-slate-700">{lead.notes}</p>

        {lead.client_id ? (
          <p className="mt-2 text-sm text-green-700">Converted to client.</p>
        ) : (
          <form action={updateLeadStage} className="mt-3 flex items-center gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <select
              name="stage"
              defaultValue={lead.stage}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
            >
              {leadStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Update stage
            </button>
          </form>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Activity</h2>
        <form action={addActivity} className="mt-3 space-y-2">
          <input type="hidden" name="leadId" value={lead.id} />
          <select
            name="type"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
          </select>
          <textarea
            name="body"
            placeholder="What happened?"
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Add activity
          </button>
        </form>

        <ul className="mt-4 space-y-2">
          {(activities ?? []).map((activity) => (
            <li key={activity.id} className="rounded-lg border border-slate-100 p-2 text-sm">
              <span className="font-medium text-slate-800">{activity.type}</span>{' '}
              <span className="text-slate-600">— {activity.body}</span>
              <div className="text-xs text-slate-400">{new Date(activity.created_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
