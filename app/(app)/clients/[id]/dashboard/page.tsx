import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { MetricChart } from './metric-chart'

interface MetricPoint {
  period: string
  value: number
}

export default async function ClientMetricsDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule('clients')
  const { id } = await params
  const supabase = await createClient()

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', id)
    .single()

  if (clientError && clientError.code !== 'PGRST116') {
    throw new Error(clientError.message)
  }

  if (!client) notFound()

  const { data: metrics, error: metricsError } = await supabase
    .from('client_metrics')
    .select('channel, metric_label, unit, period, value')
    .eq('client_id', id)
    .order('period', { ascending: true })

  if (metricsError) {
    throw new Error(metricsError.message)
  }

  const byChannel = new Map<string, Map<string, { unit: string; points: MetricPoint[] }>>()

  for (const row of metrics ?? []) {
    const channelMap = byChannel.get(row.channel) ?? new Map()
    const metric = channelMap.get(row.metric_label) ?? { unit: row.unit, points: [] as MetricPoint[] }
    metric.points.push({ period: row.period, value: row.value })
    channelMap.set(row.metric_label, metric)
    byChannel.set(row.channel, channelMap)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Link href={`/clients/${id}`} className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
          ← Back to {client.name}
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-slate-800">{client.name} — Metrics dashboard</h1>
      </div>

      {byChannel.size === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
          No metrics logged for this client yet.
        </p>
      )}

      {Array.from(byChannel.entries()).map(([channel, metricMap]) => (
        <div key={channel} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">{channel}</h2>
          <div className="mt-3 grid grid-cols-2 gap-4">
            {Array.from(metricMap.entries()).map(([label, metric]) => (
              <div key={label} className="rounded-lg border border-slate-100 p-3">
                <h3 className="text-sm font-medium text-slate-600">
                  {label}
                  {metric.unit ? ` (${metric.unit})` : ''}
                </h3>
                {metric.points.length >= 2 ? (
                  <MetricChart points={metric.points} />
                ) : (
                  <p className="mt-2 text-2xl font-semibold text-slate-800">
                    {metric.points[0]?.value}
                    <span className="ml-2 text-xs font-normal text-slate-400">{metric.points[0]?.period}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
