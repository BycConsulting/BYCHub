// Server-only: reads META_ACCESS_TOKEN. Never import from a client component.
import { METRIC_CATALOG, type InsightRow } from './metrics'
import type { DateRange } from './ranges'
import type { WidgetQuery } from './query'

export const META_API_VERSION = 'v23.0'

const MAX_PAGES = 20

export class MetaError extends Error {
  constructor(
    public kind: 'token' | 'rate_limit' | 'permission' | 'other',
    message: string
  ) {
    super(message)
  }
}

export function mapMetaError(code: number, message: string): MetaError {
  if (code === 190) return new MetaError('token', 'Meta access token is invalid or expired. Renew META_ACCESS_TOKEN.')
  if ([4, 17, 32, 613].includes(code)) return new MetaError('rate_limit', 'Meta rate limit reached. Wait a few minutes and press Refresh.')
  if ([10, 200].includes(code)) return new MetaError('permission', 'The Meta token has no access to this ad account.')
  return new MetaError('other', `Meta error: ${message}`)
}

const NAME_FIELDS: Record<WidgetQuery['level'], string[]> = {
  account: [],
  campaign: ['campaign_id', 'campaign_name'],
  adset: ['adset_id', 'adset_name', 'campaign_name'],
  ad: ['ad_id', 'ad_name', 'adset_name', 'campaign_name'],
}

export async function fetchInsights(accountId: string, query: WidgetQuery, range: DateRange): Promise<InsightRow[]> {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) throw new MetaError('token', 'META_ACCESS_TOKEN is not set.')

  const fields = new Set<string>(NAME_FIELDS[query.level])
  for (const metric of query.metrics) METRIC_CATALOG[metric]?.fields.forEach((f) => fields.add(f))

  const params = new URLSearchParams({
    level: query.level,
    fields: [...fields].join(','),
    time_range: JSON.stringify({ since: range.from, until: range.to }),
    limit: '500',
  })
  if (query.breakdown) params.set('breakdowns', query.breakdown)
  if (query.timeIncrement === 'day') params.set('time_increment', '1')

  let url: string | undefined = `https://graph.facebook.com/${META_API_VERSION}/${accountId}/insights?${params}`
  const rows: InsightRow[] = []

  for (let page = 0; url && page < MAX_PAGES; page++) {
    const response: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    const body = await response.json()
    if (body.error) throw mapMetaError(Number(body.error.code), String(body.error.message ?? ''))
    rows.push(...(body.data ?? []))
    url = body.paging?.next
  }

  return rows
}
