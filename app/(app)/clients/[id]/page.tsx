import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { addActivity } from '../../leads/actions'
import { requireModule } from '@/lib/access'

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('clients')
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: client } = await supabase.from('clients').select('id, name, status').eq('id', id).single()

  if (!client) notFound()

  const { data: activities } = await supabase
    .from('activities')
    .select('id, type, body, created_at')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-3xl space-y-6">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">{client.name}</h1>
        <p className="text-sm text-slate-500">Status: {client.status}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Activity</h2>
        <form action={addActivity} className="mt-3 space-y-2">
          <input type="hidden" name="clientId" value={client.id} />
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
