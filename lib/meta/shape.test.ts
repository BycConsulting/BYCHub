import { describe, expect, it } from 'vitest'
import { breakdownPairs, formatMetric, kpiValue, seriesByDay } from './shape'

describe('kpiValue', () => {
  it('is 0 when Meta returned no rows', () => {
    expect(kpiValue([], 'spend')).toBe(0)
  })
  it('reads the first row', () => {
    expect(kpiValue([{ spend: '12.5' }], 'spend')).toBe(12.5)
  })
})

describe('seriesByDay', () => {
  it('sorts by date and derives each metric', () => {
    const rows = [
      { date_start: '2026-11-02', spend: '5' },
      { date_start: '2026-11-01', spend: '3' },
    ]
    expect(seriesByDay(rows, ['spend'])).toEqual([
      { date: '2026-11-01', spend: 3 },
      { date: '2026-11-02', spend: 5 },
    ])
  })
  it('returns an empty series for no rows', () => {
    expect(seriesByDay([], ['spend'])).toEqual([])
  })
})

describe('breakdownPairs', () => {
  it('labels by the breakdown field and sorts largest first', () => {
    const rows = [
      { publisher_platform: 'instagram', spend: '4' },
      { publisher_platform: 'facebook', spend: '9' },
    ]
    expect(breakdownPairs(rows, 'spend', 'publisher_platform')).toEqual([
      { label: 'facebook', value: 9 },
      { label: 'instagram', value: 4 },
    ])
  })
})

describe('formatMetric', () => {
  it('formats currency, percent, ratio and counts', () => {
    expect(formatMetric('spend', 12400)).toBe('$12,400')
    expect(formatMetric('ctr', 1.234)).toBe('1.2%')
    expect(formatMetric('roas', 3.456)).toBe('3.46x')
    expect(formatMetric('reach', 482000)).toBe('482,000')
  })
  it('shows a dash for 0 cost-per-result', () => {
    expect(formatMetric('cost_per_result', 0)).toBe('—')
  })
})
