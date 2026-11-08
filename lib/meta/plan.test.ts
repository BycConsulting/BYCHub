import { describe, expect, it } from 'vitest'
import { collectQueries, planFetches } from './plan'
import { STANDARD_PAGES, type Page } from './layout'

const range = { from: '2026-11-01', to: '2026-11-30' }

describe('collectQueries', () => {
  it('returns one entry per widget that has a query and skips text widgets', () => {
    const entries = collectQueries(STANDARD_PAGES)
    const widgets = STANDARD_PAGES.flat().filter((w) => w.config.query)
    expect(entries).toHaveLength(widgets.length)
    expect(entries.some((e) => e.widgetId === 'p1-title')).toBe(false)
  })
})

describe('planFetches', () => {
  const kpi = (id: string): Page[number] => ({
    id,
    type: 'kpi',
    x: 0,
    y: 0,
    w: 2,
    h: 2,
    config: { metrics: ['spend'], query: { level: 'account', metrics: ['spend'] } },
  })

  it('fetches identical queries once', () => {
    expect(planFetches([[kpi('a'), kpi('b')]], 'act_1', range, false)).toHaveLength(1)
  })
  it('asks for the previous period only for KPI queries and only when comparing', () => {
    const line: Page[number] = { ...kpi('c'), id: 'c', type: 'line', config: { metrics: ['reach'], query: { level: 'account', metrics: ['reach'] } } }
    const without = planFetches([[kpi('a'), line]], 'act_1', range, false)
    expect(without.every((f) => !f.withPrevious)).toBe(true)
    const withCompare = planFetches([[kpi('a'), line]], 'act_1', range, true)
    expect(withCompare.find((f) => f.query.metrics[0] === 'spend')?.withPrevious).toBe(true)
    expect(withCompare.find((f) => f.query.metrics[0] === 'reach')?.withPrevious).toBe(false)
  })
})
