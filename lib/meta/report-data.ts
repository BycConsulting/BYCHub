// Server-only: reads the report_data_cache table.
import { createClient } from '@/lib/supabase/server'
import type { InsightRow } from './metrics'
import { collectQueries } from './plan'
import { queryKey } from './query'
import type { Page } from './layout'
import type { DateRange } from './ranges'

export type WidgetData = { rows: InsightRow[]; previous?: InsightRow[]; error?: string; fetchedAt: string }

/** Cached data keyed by widget id. A widget with no entry has never been refreshed for this range. */
export async function loadReportData(
  layoutId: string,
  accountId: string,
  pages: Page[],
  range: DateRange,
  compare: boolean
): Promise<Record<string, WidgetData | undefined>> {
  const queries = collectQueries(pages)
  const keys = queries.map((q) => queryKey(accountId, q.query, range, compare))
  if (keys.length === 0) return {}

  const supabase = await createClient()
  const { data } = await supabase
    .from('report_data_cache')
    .select('query_key, payload, fetched_at')
    .eq('layout_id', layoutId)
    .in('query_key', keys)

  const byKey = new Map((data ?? []).map((row) => [row.query_key, row]))
  const result: Record<string, WidgetData | undefined> = {}
  queries.forEach((q, i) => {
    const row = byKey.get(keys[i])
    if (row) result[q.widgetId] = { ...(row.payload as Omit<WidgetData, 'fetchedAt'>), fetchedAt: row.fetched_at }
  })
  return result
}
