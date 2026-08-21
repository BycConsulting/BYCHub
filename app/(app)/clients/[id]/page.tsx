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
    <div className="space-y-8">
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <div>
        <h1 className="text-lg font-semibold">{client.name}</h1>
        <p className="text-sm text-gray-600">Status: {client.status}</p>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Activity</h2>
        <form action={addActivity} className="mt-3 space-y-2">
          <input type="hidden" name="clientId" value={client.id} />
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
