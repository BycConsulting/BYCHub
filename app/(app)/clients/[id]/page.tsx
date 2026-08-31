import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { addActivity } from '../../leads/actions'
import { addClientMetric, deleteClientMetric } from './metrics-actions'
import { MetricEntryForm } from './metric-entry-form'
import { requireModule } from '@/lib/access'
import { getMetricCatalog } from '@/lib/metric-catalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormSelect } from '@/components/ui/form-select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'active') return 'default'
  if (status === 'lost') return 'destructive'
  return 'secondary'
}

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

  const activityTypeOptions = [
    { value: 'note', label: 'Note' },
    { value: 'call', label: 'Call' },
    { value: 'email', label: 'Email' },
  ]

  return (
    <div className="max-w-3xl space-y-6">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{client.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            Status:{' '}
            <Badge variant={statusBadgeVariant(client.status)} className="capitalize">
              {client.status}
            </Badge>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Metrics</CardTitle>
          <CardAction>
            <Link
              href={`/clients/${id}/dashboard`}
              className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
            >
              View dashboard →
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <form className="flex items-center gap-2">
            <Input type="month" name="period" defaultValue={period} className="w-auto" />
            <Button type="submit" variant="outline">
              Go
            </Button>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={addActivity} className="space-y-2">
            <input type="hidden" name="clientId" value={client.id} />
            <FormSelect name="type" options={activityTypeOptions} defaultValue="note" />
            <Textarea name="body" placeholder="What happened?" required className="w-full" />
            <Button type="submit">Add activity</Button>
          </form>

          <ul className="mt-4 space-y-2">
            {(activities ?? []).map((activity) => (
              <li key={activity.id} className="rounded-lg border border-slate-100 p-2 text-sm">
                <Badge variant="outline" className="capitalize">
                  {activity.type}
                </Badge>{' '}
                <span className="text-slate-600">— {activity.body}</span>
                <div className="text-xs text-slate-400">{new Date(activity.created_at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
