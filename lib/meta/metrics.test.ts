import { describe, expect, it } from 'vitest'
import { METRIC_CATALOG } from './metrics'

const row = { spend: '120', actions: [{ action_type: 'lead', value: '4' }], purchase_roas: [{ action_type: 'omni_purchase', value: '2.5' }] }

describe('METRIC_CATALOG', () => {
  it('derives results from lead actions', () => {
    expect(METRIC_CATALOG.results.derive(row)).toBe(4)
  })
  it('derives cost_per_result as spend / results', () => {
    expect(METRIC_CATALOG.cost_per_result.derive(row)).toBe(30)
  })
  it('returns 0 for cost_per_result when there are no results', () => {
    expect(METRIC_CATALOG.cost_per_result.derive({ spend: '50' })).toBe(0)
  })
  it('returns 0 for roas when Meta sends none', () => {
    expect(METRIC_CATALOG.roas.derive({ spend: '50' })).toBe(0)
  })
  it('reads roas from purchase_roas', () => {
    expect(METRIC_CATALOG.roas.derive(row)).toBe(2.5)
  })
  it('treats missing numeric fields as 0', () => {
    expect(METRIC_CATALOG.spend.derive({})).toBe(0)
  })
})
