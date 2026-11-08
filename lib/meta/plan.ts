import type { Page } from './layout'
import { queryKey, type WidgetQuery } from './query'
import type { DateRange } from './ranges'

export function collectQueries(pages: Page[]): { widgetId: string; type: Page[number]['type']; query: WidgetQuery }[] {
  return pages.flat().flatMap((w) => (w.config.query ? [{ widgetId: w.id, type: w.type, query: w.config.query }] : []))
}

export type PlannedFetch = { key: string; query: WidgetQuery; withPrevious: boolean }

/** One fetch per distinct query; the previous period is fetched only for KPI queries when comparing. */
export function planFetches(pages: Page[], accountId: string, range: DateRange, compare: boolean): PlannedFetch[] {
  const byKey = new Map<string, PlannedFetch>()
  for (const { type, query } of collectQueries(pages)) {
    const key = queryKey(accountId, query, range, compare)
    const existing = byKey.get(key)
    const withPrevious = compare && type === 'kpi'
    if (existing) existing.withPrevious ||= withPrevious
    else byKey.set(key, { key, query, withPrevious })
  }
  return [...byKey.values()]
}

export type FetchResult = { key: string; payload: { rows: unknown[]; previous?: unknown[]; error?: string } }

/** Failed fetches are not saved, so a rate-limited Refresh never wipes the last good data. */
export function partitionResults(results: FetchResult[]): { toSave: FetchResult[]; failures: string[] } {
  const toSave = results.filter((r) => !r.payload.error)
  const failures = [...new Set(results.flatMap((r) => (r.payload.error ? [r.payload.error] : [])))]
  return { toSave, failures }
}
