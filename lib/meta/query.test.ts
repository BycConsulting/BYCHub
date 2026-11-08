import { describe, expect, it } from 'vitest'
import { queryKey } from './query'
import type { WidgetQuery } from './query'

const q: WidgetQuery = { level: 'campaign', metrics: ['spend', 'results'] }
const range = { from: '2026-11-01', to: '2026-11-30' }

describe('queryKey', () => {
  it('is identical for equal inputs', () => {
    expect(queryKey('act_1', q, range, false)).toBe(queryKey('act_1', { ...q }, { ...range }, false))
  })
  it('changes with compare, range and account', () => {
    const base = queryKey('act_1', q, range, false)
    expect(queryKey('act_1', q, range, true)).not.toBe(base)
    expect(queryKey('act_1', q, { from: '2026-11-02', to: '2026-11-30' }, false)).not.toBe(base)
    expect(queryKey('act_2', q, range, false)).not.toBe(base)
  })
})
