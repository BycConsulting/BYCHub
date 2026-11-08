import { METRIC_CATALOG, type InsightRow } from './metrics'
import { changePercent } from './ranges'

export function kpiValue(rows: InsightRow[], metric: string): number {
  return rows.length > 0 ? METRIC_CATALOG[metric].derive(rows[0]) : 0
}

export type SeriesPoint = { date: string } & Record<string, number | string>

export function seriesByDay(rows: InsightRow[], metrics: string[]): SeriesPoint[] {
  return [...rows]
    .sort((a, b) => String(a.date_start).localeCompare(String(b.date_start)))
    .map((row) => {
      const point: SeriesPoint = { date: String(row.date_start) }
      for (const m of metrics) point[m] = METRIC_CATALOG[m].derive(row)
      return point
    })
}

export function breakdownPairs(rows: InsightRow[], metric: string, breakdown: string): { label: string; value: number }[] {
  return rows
    .map((row) => ({ label: String(row[breakdown] ?? 'Unknown'), value: METRIC_CATALOG[metric].derive(row) }))
    .sort((a, b) => b.value - a.value)
}

export function formatMetric(metric: string, value: number): string {
  const unit = METRIC_CATALOG[metric]?.unit ?? ''
  if (metric === 'cost_per_result' && value === 0) return '—'
  if (unit === '₹') return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: value < 100 ? 2 : 0 })}`
  if (unit === '%') return `${value.toFixed(1)}%`
  if (unit === 'x') return `${value.toFixed(2)}x`
  return Math.round(value).toLocaleString('en-IN')
}

/** Cost ratios that Meta/derive report as 0 when undefined (no results, no clicks), not when truly zero. */
const UNDEFINED_WHEN_ZERO = new Set(['cost_per_result', 'roas', 'cpc', 'cpm'])

/** Change vs the previous period, or null when either side is an undefined ratio or there is no baseline. */
export function kpiChange(metric: string, current: number, previous: number): number | null {
  if (UNDEFINED_WHEN_ZERO.has(metric) && (current === 0 || previous === 0)) return null
  return changePercent(current, previous)
}
