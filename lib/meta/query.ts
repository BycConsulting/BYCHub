import { createHash } from 'node:crypto'
import type { DateRange } from './ranges'

export type InsightLevel = 'account' | 'campaign' | 'adset' | 'ad'

export type Breakdown = 'publisher_platform' | 'platform_position' | 'age' | 'gender' | 'country'

export type WidgetQuery = {
  level: InsightLevel
  metrics: string[]
  breakdown?: Breakdown
  timeIncrement?: 'day'
}

/** Stable hash identifying one cached Meta query. */
export function queryKey(accountId: string, query: WidgetQuery, range: DateRange, compare: boolean): string {
  const material = JSON.stringify([
    accountId,
    query.level,
    [...query.metrics].sort(),
    query.breakdown ?? null,
    query.timeIncrement ?? null,
    range.from,
    range.to,
    compare,
  ])
  return createHash('sha256').update(material).digest('hex')
}
