export type RawRow = Record<string, unknown>

export type InsightRow = RawRow & { date_start?: string; date_stop?: string }

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function actionTotal(row: RawRow, actionType: string): number {
  const actions = Array.isArray(row.actions) ? (row.actions as { action_type: string; value: string }[]) : []
  return actions.filter((a) => a.action_type === actionType).reduce((sum, a) => sum + num(a.value), 0)
}

function results(row: RawRow): number {
  return actionTotal(row, 'lead')
}

export type MetricDef = {
  label: string
  unit: string
  /** Raw Insights fields to request from Meta. */
  fields: string[]
  derive: (row: RawRow) => number
}

export const METRIC_CATALOG: Record<string, MetricDef> = {
  spend: { label: 'Spend', unit: '₹', fields: ['spend'], derive: (r) => num(r.spend) },
  impressions: { label: 'Impressions', unit: '', fields: ['impressions'], derive: (r) => num(r.impressions) },
  reach: { label: 'Reach', unit: '', fields: ['reach'], derive: (r) => num(r.reach) },
  frequency: { label: 'Frequency', unit: 'x', fields: ['frequency'], derive: (r) => num(r.frequency) },
  clicks: { label: 'Clicks', unit: '', fields: ['clicks'], derive: (r) => num(r.clicks) },
  link_clicks: { label: 'Link clicks', unit: '', fields: ['inline_link_clicks'], derive: (r) => num(r.inline_link_clicks) },
  ctr: { label: 'CTR', unit: '%', fields: ['ctr'], derive: (r) => num(r.ctr) },
  cpc: { label: 'CPC', unit: '₹', fields: ['cpc'], derive: (r) => num(r.cpc) },
  cpm: { label: 'CPM', unit: '₹', fields: ['cpm'], derive: (r) => num(r.cpm) },
  results: { label: 'Leads', unit: '', fields: ['actions'], derive: results },
  purchases: { label: 'Purchases', unit: '', fields: ['actions'], derive: (r) => actionTotal(r, 'omni_purchase') },
  cost_per_result: {
    label: 'Cost per lead',
    unit: '₹',
    fields: ['spend', 'actions'],
    derive: (r) => (results(r) > 0 ? num(r.spend) / results(r) : 0),
  },
  roas: {
    label: 'ROAS',
    unit: 'x',
    fields: ['purchase_roas'],
    derive: (r) => {
      const roas = Array.isArray(r.purchase_roas) ? (r.purchase_roas as { value: string }[]) : []
      return roas.length > 0 ? num(roas[0].value) : 0
    },
  },
}
