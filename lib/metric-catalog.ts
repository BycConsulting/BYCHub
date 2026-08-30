import { createClient } from '@/lib/supabase/server'

export interface CatalogMetric {
  channel: string
  metricKey: string
  label: string
  unit: string
}

export async function getMetricCatalog(): Promise<CatalogMetric[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('client_metric_catalog')
    .select('channel, metric_key, label, unit')
    .order('channel')
    .order('sort_order')

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => ({
    channel: row.channel,
    metricKey: row.metric_key,
    label: row.label,
    unit: row.unit,
  }))
}
