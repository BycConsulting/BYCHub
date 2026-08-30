import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { addActivity } from '../../leads/actions'
import { addClientMetric, deleteClientMetric } from './metrics-actions'
import { MetricEntryForm } from './metric-entry-form'
import { requireModule } from '@/lib/access'
import { getMetricCatalog } from '@/lib/metric-catalog'

function currentMonthValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; period?: string }>
}) {
  await requireModule('clients')
  const { id } = await params
  const { error, period: periodParam } = await searchParams
  const period = periodParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodParam) ? periodParam : currentMonthValue()
  const supabase = await createClient()

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name, status')
    .eq('id', id)
    .single()

  if (clientError && clientError.code !== 'PGRST116') {
    throw new Error(clientError.message)
  }

  if (!client) notFound()

  const { data: activities } = await supabase
    .from('activities')
    .select('id, type, body, created_at')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const catalog = await getMetricCatalog()

  const { data: metrics, error: metricsError } = await supabase
    .from('client_metrics')
    .select('id, channel, metric_label, value, unit, notes')
    .eq('client_id', id)
    .eq('period', `${period}-01`)
    .order('channel')

  if (metricsError) {
    throw new Error(metricsError.message)
  }

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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Metrics</h2>
          <Link
            href={`/clients/${id}/dashboard`}
            className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
          >
            View dashboard →
          </Link>
        </div>

        <form className="mt-3 flex items-center gap-2">
          <input
            type="month"
            name="period"
            defaultValue={period}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Go
          </button>
        </form>

        <ul className="mt-4 space-y-2">
          {(metrics ?? []).map((metric) => (
            <li
              key={metric.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 p-2 text-sm"
            >
              <span>
                <span className="text-slate-400">{metric.channel} — </span>
                <span className="font-medium text-slate-800">{metric.metric_label}</span>
                <span className="text-slate-600">
                  {' '}
                  = {metric.value}
                  {metric.unit ? ` ${metric.unit}` : ''}
                </span>
                {metric.notes && <span className="text-slate-400"> ({metric.notes})</span>}
              </span>
              <form action={deleteClientMetric}>
                <input type="hidden" name="metricId" value={metric.id} />
                <input type="hidden" name="clientId" value={id} />
                <button type="submit" className="text-red-600 underline">
                  Delete
                </button>
              </form>
            </li>
          ))}
          {(metrics ?? []).length === 0 && (
            <li className="text-sm text-slate-400">No metrics logged for {period} yet.</li>
          )}
        </ul>

        <MetricEntryForm action={addClientMetric} clientId={id} period={period} catalog={catalog} />
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
